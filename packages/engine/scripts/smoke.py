"""Cross-OS smoke test (SPEC-LAUNCH A2): start engine → /health → trace → LeetCode trace →
welcome page + pairing code → shutdown. Standard library only, so it can run against a frozen
binary on a bare CI runner.

    python scripts/smoke.py dist-bin/leettrace           # a standalone binary
    python scripts/smoke.py uv run leettrace             # the dev install
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

PORT = 48555 + (os.getpid() % 400)  # distinct per run: no clash with a just-closed run
FACTORIAL = "def f(n):\n    return 1 if n <= 1 else n * f(n - 1)\n\nprint(f(5))\n"
TWO_SUM = (
    "class Solution:\n"
    "    def twoSum(self, nums: List[int], target: int) -> List[int]:\n"
    "        seen = {}\n"
    "        for i, x in enumerate(nums):\n"
    "            if target - x in seen:\n"
    "                return [seen[target - x], i]\n"
    "            seen[x] = i\n"
)


def call(
    method: str, path: str, token: str | None, body: Any = None, origin: str | None = None
) -> tuple[int, Any]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if origin:
        headers["Origin"] = origin
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(  # noqa: S310 — fixed loopback URL
        f"http://127.0.0.1:{PORT}{path}", data=data, method=method, headers=headers
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:  # noqa: S310
            raw = r.read()
            ctype = r.headers.get("content-type", "")
            return r.status, json.loads(raw) if "json" in ctype else raw.decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def check(cond: bool, what: str) -> None:
    print(("PASS " if cond else "FAIL ") + what, flush=True)
    if not cond:
        raise SystemExit(1)


def main(cmd: list[str]) -> None:
    home = tempfile.mkdtemp(prefix="lt-smoke-")
    env = {**os.environ, "LEETTRACE_HOME": home}
    log = open(Path(home) / "engine.log", "w")  # noqa: SIM115
    proc = subprocess.Popen(
        [*cmd, "start", "--port", str(PORT), "--no-open"], env=env, stdout=log, stderr=log
    )
    try:
        session_file = Path(home) / "session.json"
        deadline = time.monotonic() + 90
        while not session_file.exists() and time.monotonic() < deadline:
            if proc.poll() is not None:
                break
            time.sleep(0.25)
        if not session_file.exists():
            log.flush()
            print((Path(home) / "engine.log").read_text(encoding="utf-8"))
            check(False, "engine started and wrote its session file")
        token = json.loads(session_file.read_text(encoding="utf-8"))["token"]
        # The session file is written just before the socket is bound: wait until it answers.
        while time.monotonic() < deadline:
            try:
                call("GET", "/health", None)
                break
            except urllib.error.URLError:
                time.sleep(0.25)
        check(True, f"engine started ({' '.join(cmd)}) on {sys.platform}")

        status, _ = call("GET", "/health", None)
        check(status == 401, "/health without the token is rejected (401)")
        status, health = call("GET", "/health", token)
        check(status == 200 and health["status"] == "ok", f"/health ok, v{health['version']}")
        print(f"     memory cap: {health['limits']['memory']} ({health['limits']['mechanism']})")

        status, trace = call("POST", "/trace", token, {"code": FACTORIAL})
        check(status == 200 and trace["steps"][-1]["stdout"] == "120\n", "traced a program (120)")

        status, out = call("POST", "/trace", token, {"code": "while True:\n    pass\n"})
        check(status == 200 and out.get("truncated") is True, "runaway program truncated")

        status, res = call(
            "POST",
            "/leetcode/trace",
            token,
            {
                "code": TWO_SUM,
                "cases": [{"input": "nums = [2,7,11,15], target = 9", "expected": "[0,1]"}],
            },
        )
        check(status == 200 and res["traces"][0]["test"]["passed"] is True, "LeetCode case passed")

        status, page = call("GET", "/", None)
        check(status == 200 and 'id="root"' in str(page), "web UI / welcome page served")
        status, code = call("GET", "/pair/code", token)
        check(
            status == 200 and len(code["code"]) == 6, "pairing code available to the welcome page"
        )
        status, paired = call(
            "POST", "/pair/confirm", None, {"code": code["code"]}, origin="https://leetcode.com"
        )
        check(
            status == 200 and paired["token"] == token, "extension-style pairing returns the token"
        )

        status, _ = call("POST", "/shutdown", token, {})
        check(status == 200, "shutdown accepted")
        proc.wait(timeout=20)
        check(True, "engine exited")
    finally:
        if proc.poll() is None:
            proc.kill()
        log.close()


if __name__ == "__main__":
    main(sys.argv[1:] or ["leettrace"])
