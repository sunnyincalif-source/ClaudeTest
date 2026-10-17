"""Run the engine daemon: pick a loopback port, write the session file, serve."""

from __future__ import annotations

import os
import socket
from collections.abc import Callable

import uvicorn

from leettrace import __version__
from leettrace.server.app import create_app
from leettrace.server.session import (
    DEFAULT_PORT,
    PORT_SCAN,
    Session,
    clear_session,
    make_session,
    write_session,
)

LOOPBACK = "127.0.0.1"  # never the wildcard address, never a LAN interface (SPEC §8)


def pick_port(preferred: int = DEFAULT_PORT, scan: int = PORT_SCAN) -> int:
    for port in range(preferred, preferred + scan + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((LOOPBACK, port))
            except OSError:
                continue
            return port
    raise RuntimeError(f"no free loopback port in {preferred}..{preferred + scan}")


def serve(
    *,
    port: int | None = None,
    on_ready: Callable[[Session, str], None] | None = None,
    on_pair_code: Callable[[str, str], None] | None = None,
    dev: bool = False,
) -> None:
    chosen = pick_port(port or DEFAULT_PORT, 0 if port else PORT_SCAN)
    session = make_session(chosen, __version__)
    dev_origins = ("http://localhost:5173", "http://127.0.0.1:5173") if dev else ()
    app = create_app(
        token=session.token, port=chosen, on_pair_code=on_pair_code, dev_origins=dev_origins
    )
    config = uvicorn.Config(
        app,
        host=LOOPBACK,
        port=chosen,
        log_level="warning",
        access_log=False,
        ws="websockets-sansio",
    )
    server = uvicorn.Server(config)

    def request_shutdown() -> None:
        server.should_exit = True

    app.state.engine.request_shutdown = request_shutdown
    write_session(session)
    if on_ready is not None:
        on_ready(session, app.state.engine.pair.current())
    try:
        server.run()
    finally:
        clear_session(session.token)
        if os.environ.get("LEETTRACE_DEBUG"):
            print("engine stopped")
