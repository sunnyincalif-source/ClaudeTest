"""Thin HTTP client used by the CLI to talk to the local daemon."""

from __future__ import annotations

import os
import subprocess
import sys
import time
from typing import Any

import httpx

from leettrace import __version__
from leettrace.server.session import Session, home, read_session


class DaemonUnavailable(Exception):
    pass


def _headers(session: Session) -> dict[str, str]:
    return {"Authorization": f"Bearer {session.token}"}


def find_daemon() -> Session | None:
    session = read_session()
    if session is None:
        return None
    try:
        r = httpx.get(f"{session.base_url}/health", headers=_headers(session), timeout=1.5)
    except httpx.HTTPError:
        return None
    return session if r.status_code == 200 else None


def leettrace_command() -> list[str]:
    if getattr(sys, "frozen", False):
        return [sys.executable]
    return [sys.executable, "-m", "leettrace"]


def ensure_daemon(timeout: float = 15.0) -> Session:
    """Return the running daemon's session, starting one in the background if needed."""
    session = find_daemon()
    if session is not None:
        return session
    log_dir = home()
    log_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(log_dir / "daemon.log", os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    os.chmod(log_dir / "daemon.log", 0o600)
    with os.fdopen(fd, "ab") as log:
        subprocess.Popen(
            [*leettrace_command(), "start", "--background"],
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        time.sleep(0.2)
        session = find_daemon()
        if session is not None:
            return session
    raise DaemonUnavailable(f"engine did not start; see {log_dir / 'daemon.log'}")


def post(
    session: Session, path: str, body: dict[str, Any], timeout: float = 60.0
) -> httpx.Response:
    r = httpx.post(
        f"{session.base_url}{path}", json=body, headers=_headers(session), timeout=timeout
    )
    r.raise_for_status()
    return r


def get(session: Session, path: str, timeout: float = 10.0) -> httpx.Response:
    r = httpx.get(f"{session.base_url}{path}", headers=_headers(session), timeout=timeout)
    r.raise_for_status()
    return r


def check_version(trace: dict[str, Any]) -> str | None:
    engine = str(trace.get("engineVersion", "?"))
    if engine.split(".")[:2] != __version__.split(".")[:2]:
        return (
            f"engine version {engine} differs from CLI {__version__} — "
            "restart the engine (`leettrace stop && leettrace start`)."
        )
    return None
