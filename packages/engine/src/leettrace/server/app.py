"""The loopback HTTP/WebSocket server (SPEC §4.6).

Endpoints (all but the static UI shell and the pairing handshake need the bearer token):
  GET  /health            version + status
  POST /trace             {code, input?, publish?, label?}        → Trace
  POST /leetcode/trace    {code, cases:[{input, expected?}], ...} → {traces: Trace[]}
  GET  /runs/{id}         a previously published Trace
  WS   /watch?token=…     pushes {type:"trace", runId, label, trace} on every publish
  POST /pair/request      extension asks to pair → user sees a code in the terminal
  POST /pair/confirm      extension submits the code → receives the token
  GET  /pair/pending      (auth) pending pairing codes, for `leettrace pair`
  POST /shutdown          (auth) stop the daemon
"""

from __future__ import annotations

import asyncio
import contextlib
import secrets
import time
import uuid
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from importlib import resources
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from leettrace import __version__
from leettrace.server.security import LEETCODE_ORIGIN, Gate
from leettrace.tracer.runner import RunLimits, run_request

MAX_BODY_BYTES = 1_000_000
MAX_CODE = 100_000
MAX_INPUT = 100_000
MAX_CASES = 10
RUNS_KEPT = 30
MAX_CONCURRENT_TRACES = 2


class TraceBody(BaseModel):
    code: str = Field(max_length=MAX_CODE)
    input: str = Field(default="", max_length=MAX_INPUT)
    publish: bool = False
    label: str | None = Field(default=None, max_length=200)


class CaseBody(BaseModel):
    input: str = Field(max_length=MAX_INPUT)
    expected: str | None = Field(default=None, max_length=MAX_INPUT)


class LeetCodeBody(BaseModel):
    code: str = Field(max_length=MAX_CODE)
    language: str = "python3"
    slug: str | None = Field(default=None, max_length=200)
    function_name: str | None = Field(default=None, alias="functionName", max_length=100)
    cases: list[CaseBody] = Field(min_length=1, max_length=MAX_CASES)
    publish: bool = False


class PairRequestBody(BaseModel):
    client: str = Field(default="extension", max_length=80)


class PairConfirmBody(BaseModel):
    request_id: str = Field(alias="requestId", max_length=64)
    code: str = Field(max_length=16)


@dataclass
class _Pending:
    request_id: str
    code: str
    client: str
    expires: float
    attempts: int = 0


@dataclass
class EngineState:
    gate: Gate
    on_pair_code: Callable[[str, str], None]
    request_shutdown: Callable[[], None] = lambda: None
    runs: OrderedDict[str, dict[str, Any]] = field(default_factory=OrderedDict)
    labels: dict[str, str] = field(default_factory=dict)
    watchers: set[WebSocket] = field(default_factory=set)
    latest: str | None = None
    pending: dict[str, _Pending] = field(default_factory=dict)
    last_pair_request: float = 0.0
    limits: RunLimits = field(default_factory=RunLimits)
    sem: asyncio.Semaphore = field(default_factory=lambda: asyncio.Semaphore(MAX_CONCURRENT_TRACES))

    async def publish(self, trace: dict[str, Any], label: str | None) -> str:
        run_id = uuid.uuid4().hex[:12]
        self.runs[run_id] = trace
        self.labels[run_id] = label or ""
        while len(self.runs) > RUNS_KEPT:
            old, _ = self.runs.popitem(last=False)
            self.labels.pop(old, None)
        self.latest = run_id
        message = {"type": "trace", "runId": run_id, "label": label or "", "trace": trace}
        for ws in list(self.watchers):
            try:
                await ws.send_json(message)
            except Exception:
                self.watchers.discard(ws)
        return run_id


def _web_dist() -> Path | None:
    try:
        root = Path(str(resources.files("leettrace") / "web_dist"))
    except (ModuleNotFoundError, TypeError):
        return None
    return root if (root / "index.html").exists() else None


_PLACEHOLDER = """<!doctype html><meta charset="utf-8"><title>LeetTrace</title>
<body style="font:16px system-ui;margin:3rem;max-width:40rem">
<h1>LeetTrace engine is running</h1>
<p>The web UI isn't bundled in this build. Run <code>pnpm --filter @leettrace/web build</code>
from the repo, then restart <code>leettrace start</code>.</p></body>"""


def create_app(
    *,
    token: str,
    port: int,
    on_pair_code: Callable[[str, str], None] | None = None,
    dev_origins: tuple[str, ...] = (),
    limits: RunLimits | None = None,
) -> FastAPI:
    gate = Gate(token, port, dev_origins=dev_origins)
    state = EngineState(gate=gate, on_pair_code=on_pair_code or (lambda _c, _code: None))
    if limits is not None:
        state.limits = limits
    app = FastAPI(
        title="LeetTrace engine",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.engine = state

    def cors_headers(origin: str | None) -> dict[str, str]:
        if origin is None:
            return {}
        return {
            "Access-Control-Allow-Origin": origin,
            "Vary": "Origin",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Expose-Headers": "X-LeetTrace, X-LeetTrace-Run",
            "Access-Control-Max-Age": "600",
        }

    @app.middleware("http")
    async def guard(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        base = {"X-LeetTrace": __version__}
        host = request.headers.get("host")
        origin = request.headers.get("origin")
        if not gate.host_ok(host):
            return JSONResponse({"error": "bad host"}, status_code=421, headers=base)
        if not gate.origin_ok(origin):
            return JSONResponse({"error": "origin not allowed"}, status_code=403, headers=base)
        headers = {**base, **cors_headers(origin)}
        length = request.headers.get("content-length")
        if length is not None and (not length.isdigit() or int(length) > MAX_BODY_BYTES):
            return JSONResponse({"error": "request too large"}, status_code=413, headers=headers)
        if request.method == "OPTIONS":
            if request.headers.get("access-control-request-private-network") == "true":
                headers["Access-Control-Allow-Private-Network"] = "true"
            return Response(status_code=204, headers=headers)
        path = request.url.path
        if not gate.is_public(path):
            presented = gate.bearer(request.headers.get("authorization"))
            if not gate.token_ok(presented):
                return JSONResponse(
                    {"error": "missing or invalid session token", "app": "leettrace"},
                    status_code=401,
                    headers=headers,
                )
        response = await call_next(request)
        for k, v in headers.items():
            response.headers[k] = v
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = response.headers.get("Cache-Control", "no-store")
        return response

    # ------------------------------------------------------------------ API

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "app": "leettrace",
            "version": __version__,
            "status": "ok",
            "runs": len(state.runs),
            "watchers": len(state.watchers),
        }

    @app.post("/trace")
    async def trace(body: TraceBody) -> Response:
        async with state.sem:
            result = await run_in_threadpool(
                run_request,
                {"mode": "script", "source": body.code, "stdin": body.input},
                state.limits,
            )
        headers = {}
        if body.publish:
            headers["X-LeetTrace-Run"] = await state.publish(result, body.label)
        return JSONResponse(result, headers=headers)

    @app.post("/leetcode/trace")
    async def leetcode_trace(body: LeetCodeBody) -> Response:
        if body.language.lower() not in ("python", "python3"):
            return JSONResponse(
                {"error": f"LeetTrace v1 traces Python only (got {body.language!r})."},
                status_code=422,
            )
        traces = []
        for index, case in enumerate(body.cases):
            request = {
                "mode": "leetcode",
                "source": body.code,
                "functionName": body.function_name,
                "caseIndex": index,
                "input": case.input,
                "expected": case.expected,
            }
            async with state.sem:
                traces.append(await run_in_threadpool(run_request, request, state.limits))
        headers = {}
        if body.publish and traces:
            label = f"{body.slug or 'leetcode'} — case 1"
            headers["X-LeetTrace-Run"] = await state.publish(traces[0], label)
        return JSONResponse({"traces": traces}, headers=headers)

    @app.get("/runs/{run_id}")
    async def get_run(run_id: str) -> Response:
        if run_id == "latest" and state.latest:
            run_id = state.latest
        trace_data = state.runs.get(run_id)
        if trace_data is None:
            return JSONResponse({"error": "no such run"}, status_code=404)
        return JSONResponse(trace_data, headers={"X-LeetTrace-Run": run_id})

    @app.post("/shutdown")
    async def shutdown() -> dict[str, str]:
        state.request_shutdown()
        return {"status": "stopping"}

    # ------------------------------------------------------------------ pairing

    @app.post("/pair/request")
    async def pair_request(body: PairRequestBody, request: Request) -> Response:
        # Only the LeetCode page (where the extension's content script lives) may ask.
        if request.headers.get("origin") != LEETCODE_ORIGIN:
            return JSONResponse(
                {"error": "pairing is only offered to the extension"}, status_code=403
            )
        now = time.monotonic()
        for rid, p in list(state.pending.items()):
            if p.expires < now:
                del state.pending[rid]
        if now - state.last_pair_request < 2.0 or len(state.pending) >= 3:
            return JSONResponse(
                {"error": "too many pairing requests; wait a moment"}, status_code=429
            )
        state.last_pair_request = now
        code = f"{secrets.randbelow(1_000_000):06d}"
        pending = _Pending(
            request_id=uuid.uuid4().hex, code=code, client=body.client[:80], expires=now + 180
        )
        state.pending[pending.request_id] = pending
        state.on_pair_code(pending.client, code)
        return JSONResponse({"requestId": pending.request_id, "expiresIn": 180})

    @app.post("/pair/confirm")
    async def pair_confirm(body: PairConfirmBody, request: Request) -> Response:
        if request.headers.get("origin") != LEETCODE_ORIGIN:
            return JSONResponse(
                {"error": "pairing is only offered to the extension"}, status_code=403
            )
        pending = state.pending.get(body.request_id)
        if pending is None or pending.expires < time.monotonic():
            state.pending.pop(body.request_id, None)
            return JSONResponse({"error": "pairing request expired — start again"}, status_code=410)
        submitted = body.code.replace("-", "").replace(" ", "")
        if not secrets.compare_digest(submitted, pending.code):
            pending.attempts += 1
            if pending.attempts >= 5:
                del state.pending[body.request_id]
            return JSONResponse({"error": "wrong code"}, status_code=403)
        del state.pending[body.request_id]
        return JSONResponse({"token": gate.token, "port": gate.port, "version": __version__})

    @app.get("/pair/pending")
    async def pair_pending(request: Request) -> Response:
        # Under /pair/ (public prefix) so check the token explicitly here.
        if not gate.token_ok(gate.bearer(request.headers.get("authorization"))):
            return JSONResponse({"error": "missing or invalid session token"}, status_code=401)
        now = time.monotonic()
        items = [
            {"client": p.client, "code": p.code, "expiresIn": int(p.expires - now)}
            for p in state.pending.values()
            if p.expires > now
        ]
        return JSONResponse({"pending": items})

    # ------------------------------------------------------------------ watch (WS)

    @app.websocket("/watch")
    async def watch(ws: WebSocket) -> None:
        # HTTP middleware doesn't cover websockets: repeat every check here.
        if not gate.host_ok(ws.headers.get("host")) or not gate.origin_ok(ws.headers.get("origin")):
            await ws.close(code=1008)
            return
        if not gate.token_ok(ws.query_params.get("token")):
            await ws.close(code=4401)
            return
        await ws.accept()
        state.watchers.add(ws)
        try:
            if state.latest is not None:
                await ws.send_json(
                    {
                        "type": "trace",
                        "runId": state.latest,
                        "label": state.labels.get(state.latest, ""),
                        "trace": state.runs[state.latest],
                    }
                )
            while True:
                await ws.receive_text()  # keepalive pings; we don't accept commands
        except WebSocketDisconnect:
            pass
        finally:
            state.watchers.discard(ws)

    # ------------------------------------------------------------------ static UI

    dist = _web_dist()
    if dist is not None and (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    csp = (
        "default-src 'self'; "
        f"connect-src 'self' ws://127.0.0.1:{port} ws://localhost:{port}; "
        "img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
        "frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    )

    @app.get("/", include_in_schema=False)
    async def index() -> Response:
        headers = {"Content-Security-Policy": csp, "X-Frame-Options": "DENY"}
        if dist is None:
            return HTMLResponse(_PLACEHOLDER, headers=headers)
        return FileResponse(dist / "index.html", headers=headers)

    @app.get("/favicon.svg", include_in_schema=False)
    async def favicon() -> Response:
        if dist is not None and (dist / "favicon.svg").exists():
            return FileResponse(dist / "favicon.svg")
        return Response(status_code=404)

    with contextlib.suppress(Exception):
        app.state.dist = dist
    return app
