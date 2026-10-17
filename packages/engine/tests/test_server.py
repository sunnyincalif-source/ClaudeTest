"""Server security tests (SPEC §4.7, §8): the loopback bridge is a security surface."""

from __future__ import annotations

import os
import stat
import sys
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from leettrace.server.app import create_app
from leettrace.server.daemon import LOOPBACK, pick_port
from leettrace.server.session import make_session, read_session, session_path, write_session
from leettrace.tracer.runner import RunLimits

PORT = 47999
TOKEN = "test-token-abc"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
BASE = f"http://127.0.0.1:{PORT}"

codes: list[tuple[str, str]] = []


@pytest.fixture
def client() -> TestClient:
    codes.clear()
    app = create_app(
        token=TOKEN,
        port=PORT,
        on_pair_code=lambda c, code: codes.append((c, code)),
        limits=RunLimits(max_steps=300, max_seconds=2.0),
    )
    return TestClient(app, base_url=BASE)


def test_health_requires_token(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 401
    assert r.headers["X-LeetTrace"]  # still discoverable as "a leettrace engine"
    assert client.get("/health", headers=AUTH).json()["status"] == "ok"


def test_wrong_token_rejected(client: TestClient) -> None:
    r = client.post("/trace", json={"code": "x = 1"}, headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401


def test_trace_without_token_is_401(client: TestClient) -> None:
    assert client.post("/trace", json={"code": "x = 1"}).status_code == 401


def test_trace_ok(client: TestClient) -> None:
    r = client.post("/trace", json={"code": "print(6 * 7)"}, headers=AUTH)
    assert r.status_code == 200
    trace = r.json()
    assert trace["steps"][-1]["stdout"] == "42\n"
    assert trace["engineVersion"]


@pytest.mark.parametrize(
    "origin",
    ["https://evil.example", "https://leetcode.com.evil.io", "http://leetcode.com", "null"],
)
def test_disallowed_origin_rejected_even_with_token(client: TestClient, origin: str) -> None:
    r = client.post("/trace", json={"code": "x = 1"}, headers={**AUTH, "Origin": origin})
    assert r.status_code == 403
    assert "Access-Control-Allow-Origin" not in r.headers


def test_disallowed_origin_preflight_rejected(client: TestClient) -> None:
    r = client.options(
        "/trace",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert r.status_code == 403


def test_leetcode_origin_allowed_with_cors(client: TestClient) -> None:
    pre = client.options(
        "/trace",
        headers={
            "Origin": "https://leetcode.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Private-Network": "true",
        },
    )
    assert pre.status_code == 204
    assert pre.headers["Access-Control-Allow-Origin"] == "https://leetcode.com"
    assert pre.headers["Access-Control-Allow-Private-Network"] == "true"
    r = client.post(
        "/trace", json={"code": "x = 1"}, headers={**AUTH, "Origin": "https://leetcode.com"}
    )
    assert r.status_code == 200
    assert r.headers["Access-Control-Allow-Origin"] == "https://leetcode.com"


def test_local_ui_origin_allowed(client: TestClient) -> None:
    r = client.post("/trace", json={"code": "x = 1"}, headers={**AUTH, "Origin": BASE})
    assert r.status_code == 200


def test_dns_rebinding_host_rejected(client: TestClient) -> None:
    r = client.get("/health", headers={**AUTH, "Host": "attacker.example:47999"})
    assert r.status_code == 421


def test_runaway_program_truncated(client: TestClient) -> None:
    r = client.post("/trace", json={"code": "while True:\n    pass\n"}, headers=AUTH)
    assert r.status_code == 200
    assert r.json()["truncated"] is True


def test_oversized_program_rejected(client: TestClient) -> None:
    r = client.post("/trace", json={"code": "x = 1\n" * 30_000}, headers=AUTH)
    assert r.status_code == 422


def test_static_shell_is_public_but_carries_csp(client: TestClient) -> None:
    r = client.get("/")
    assert r.status_code == 200
    assert "frame-ancestors 'none'" in r.headers["Content-Security-Policy"]


def test_publish_and_fetch_run(client: TestClient) -> None:
    r = client.post(
        "/trace", json={"code": "y = 2", "publish": True, "label": "a.py"}, headers=AUTH
    )
    run_id = r.headers["X-LeetTrace-Run"]
    assert client.get(f"/runs/{run_id}").status_code == 401
    assert client.get(f"/runs/{run_id}", headers=AUTH).json() == r.json()


def test_watch_requires_token_and_pushes(client: TestClient) -> None:
    from starlette.websockets import WebSocketDisconnect

    url = f"ws://127.0.0.1:{PORT}/watch"
    # No token → closed.
    with pytest.raises(WebSocketDisconnect), client.websocket_connect(url) as ws:
        ws.receive_json()
    # Valid token but a foreign origin → closed.
    evil = {"Origin": "https://evil.example"}
    with (
        pytest.raises(WebSocketDisconnect),
        client.websocket_connect(f"{url}?token={TOKEN}", headers=evil) as ws,
    ):
        ws.receive_json()
    with client.websocket_connect(f"ws://127.0.0.1:{PORT}/watch?token={TOKEN}") as ws:
        client.post(
            "/trace", json={"code": "z = 3", "publish": True, "label": "w.py"}, headers=AUTH
        )
        msg: dict[str, Any] = ws.receive_json()
        assert msg["type"] == "trace" and msg["label"] == "w.py"
        assert msg["trace"]["steps"]


def _current_code(client: TestClient) -> str:
    return client.get("/pair/code", headers=AUTH).json()["code"]


def test_pairing_with_the_welcome_page_code(client: TestClient) -> None:
    lc = {"Origin": "https://leetcode.com"}
    # The standing code is only readable with the session token (welcome page / CLI).
    assert client.get("/pair/code").status_code == 401
    code = _current_code(client)
    assert len(code) == 6 and code.isdigit()
    # Only the LeetCode page origin may pair.
    assert client.post("/pair/confirm", json={"code": code}).status_code == 403
    assert (
        client.post(
            "/pair/confirm", json={"code": code}, headers={"Origin": "https://evil.example"}
        ).status_code
        == 403
    )
    wrong = "000000" if code != "000000" else "111111"
    assert client.post("/pair/confirm", json={"code": wrong}, headers=lc).status_code == 403
    ok = client.post("/pair/confirm", json={"code": f"{code[:3]}-{code[3:]}"}, headers=lc)
    assert ok.status_code == 200
    assert ok.json()["token"] == TOKEN
    # One-time: the same code can't pair a second client.
    assert client.post("/pair/confirm", json={"code": code}, headers=lc).status_code == 403
    info = client.get("/pair/code", headers=AUTH).json()
    assert info["code"] != code and info["paired"] == 1


def test_pair_request_echoes_code_to_terminal(client: TestClient) -> None:
    lc = {"Origin": "https://leetcode.com"}
    assert client.post("/pair/request", json={"client": "x"}).status_code == 403
    r = client.post("/pair/request", json={"client": "LeetTrace extension"}, headers=lc)
    assert r.status_code == 200
    assert codes == [("LeetTrace extension", _current_code(client))]
    assert client.post("/pair/request", json={}, headers=lc).status_code == 429  # rate limit


def test_pairing_brute_force_rotates_the_code(client: TestClient) -> None:
    lc = {"Origin": "https://leetcode.com"}
    real = _current_code(client)
    wrong = "999999" if real != "999999" else "888888"
    for _ in range(5):
        assert client.post("/pair/confirm", json={"code": wrong}, headers=lc).status_code == 403
    # After 5 wrong guesses the code is replaced; the old one no longer works.
    assert client.post("/pair/confirm", json={"code": real}, headers=lc).status_code == 403
    assert _current_code(client) != real


def test_expired_code_is_replaced(client: TestClient) -> None:
    lc = {"Origin": "https://leetcode.com"}
    code = _current_code(client)
    client.app.state.engine.pair.expires = 0  # type: ignore[attr-defined]
    r = client.post("/pair/confirm", json={"code": code}, headers=lc)
    assert r.status_code == 410
    assert "welcome page" in r.json()["error"]


def test_health_reports_limits_honestly(client: TestClient) -> None:
    limits = client.get("/health", headers=AUTH).json()["limits"]
    assert limits["maxSteps"] == 300
    assert limits["memory"] in ("enforced", "best-effort", "unavailable")
    assert limits["mechanism"]


def test_downloads_serve_only_bundled_zips(client: TestClient) -> None:
    assert client.get("/downloads/../session.json").status_code in (401, 404)
    assert client.get("/downloads/%2e%2e%2fsession.json").status_code == 404
    assert client.get("/downloads/nope.zip").status_code == 404


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX permission bits")
def test_session_file_is_user_only(tmp_path: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LEETTRACE_HOME", str(tmp_path / "lt"))
    s = make_session(12345, "0.1.0")
    write_session(s)
    mode = stat.S_IMODE(os.stat(session_path()).st_mode)
    assert mode == 0o600
    assert stat.S_IMODE(os.stat(session_path().parent).st_mode) == 0o700
    assert read_session() == s
    assert len(s.token) >= 40


def test_binds_loopback_only() -> None:
    assert LOOPBACK == "127.0.0.1"
    port = pick_port(48500, 5)
    assert 48500 <= port <= 48505


def test_no_wildcard_bind_anywhere() -> None:
    from pathlib import Path

    src = Path(__file__).parents[1] / "src"
    for f in src.rglob("*.py"):
        text = f.read_text(encoding="utf-8")
        assert "0.0.0.0" not in text, f"wildcard bind found in {f}"  # noqa: S104


def test_huge_body_rejected_before_parsing(client: TestClient) -> None:
    r = client.post(
        "/trace", content=b"x" * 2_000_000, headers={**AUTH, "Content-Type": "application/json"}
    )
    assert r.status_code == 413


# ------------------------------------------------------------------ automatic pairing (§6)


def test_bootstrap_only_for_the_engines_own_page(client: TestClient) -> None:
    own = {"Sec-Fetch-Site": "same-origin"}
    ok = client.get("/pair/bootstrap", headers=own)
    assert ok.status_code == 200
    assert ok.json() == {"token": TOKEN, "port": PORT, "version": ok.json()["version"]}
    assert ok.headers["cache-control"] == "no-store"
    # Same-origin fetch that also names our own origin: fine.
    with_origin = {**own, "Origin": f"http://127.0.0.1:{PORT}"}
    assert client.get("/pair/bootstrap", headers=with_origin).status_code == 200
    # Everyone else is refused — including LeetCode's own page scripts.
    for headers in (
        {},  # no fetch metadata (not a browser page we trust)
        {"Sec-Fetch-Site": "cross-site", "Origin": "https://leetcode.com"},
        {"Sec-Fetch-Site": "same-site"},
        {"Sec-Fetch-Site": "none"},  # typed into the address bar / navigation
        {"Sec-Fetch-Site": "same-origin", "Origin": "https://leetcode.com"},
    ):
        r = client.get("/pair/bootstrap", headers=headers)
        assert r.status_code == 403, headers
        assert TOKEN not in r.text
    # A foreign origin never even reaches the route (middleware allowlist).
    evil = {"Sec-Fetch-Site": "same-origin", "Origin": "https://evil.example"}
    assert client.get("/pair/bootstrap", headers=evil).status_code == 403


def test_bootstrap_rejects_dns_rebinding(client: TestClient) -> None:
    r = client.get(
        "/pair/bootstrap",
        headers={"Sec-Fetch-Site": "same-origin", "Host": "attacker.example"},
    )
    assert r.status_code == 421


def test_token_persists_across_restarts(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    from leettrace.server import session as sess

    monkeypatch.setenv("LEETTRACE_HOME", str(tmp_path))
    first = sess.make_session(47823, "1.1.0")
    second = sess.make_session(47823, "1.1.0")
    assert first.token == second.token and len(first.token) >= 40
    path = sess.token_path()
    if os.name != "nt":
        assert path.stat().st_mode & 0o777 == 0o600
    rotated = sess.rotate_token()
    assert rotated != first.token
    assert sess.make_session(47823, "1.1.0").token == rotated
    # A damaged token file is replaced, not trusted.
    path.write_text("short", encoding="utf-8")
    assert len(sess.make_session(47823, "1.1.0").token) >= 40
