"""Run the engine daemon: pick a loopback port, write the session file, serve."""

from __future__ import annotations

import os
import socket
from collections.abc import Callable
from typing import Any

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
            if os.name != "nt":
                # Match uvicorn: a just-closed socket in TIME_WAIT must not make the port
                # look busy (a restart would otherwise fail to bind its own port).
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((LOOPBACK, port))
            except OSError:
                continue
            return port
    raise RuntimeError(f"no free loopback port in {preferred}..{preferred + scan}")


class _AnnouncingServer(uvicorn.Server):
    def __init__(self, config: uvicorn.Config, on_listening: Callable[[], None]) -> None:
        super().__init__(config)
        self._on_listening = on_listening

    async def startup(self, sockets: Any = None) -> None:
        await super().startup(sockets=sockets)  # binds the listening socket
        if not self.should_exit:
            self._on_listening()


def serve(
    *,
    port: int | None = None,
    on_ready: Callable[[Session, str], None] | None = None,
    on_pair_code: Callable[[str, str], None] | None = None,
    dev: bool = False,
    on_stop_handle: Callable[[Callable[[], None]], None] | None = None,
) -> None:
    """Serve until stopped. Blocks; safe to run on a worker thread (the desktop app runs the
    tray on the main thread). `on_stop_handle` receives a thread-safe "stop" function."""
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

    def announce() -> None:
        # Only now is the port actually listening: publish the session file (clients poll
        # for it) and tell the user. Writing it earlier let fast clients hit "refused".
        write_session(session)
        if on_ready is not None:
            on_ready(session, app.state.engine.pair.current())

    server = _AnnouncingServer(config, announce)

    def request_shutdown() -> None:
        server.should_exit = True

    app.state.engine.request_shutdown = request_shutdown
    if on_stop_handle is not None:
        on_stop_handle(request_shutdown)
    try:
        server.run()
    finally:
        clear_session(session.token)
        if os.environ.get("LEETTRACE_DEBUG"):
            print("engine stopped")
