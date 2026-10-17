"""Session discovery file: ~/.leettrace/session.json (SPEC §4.6, §8).

Holds the daemon's port and a random bearer token. Created user-only (0600) inside a 0700
directory; clients (CLI, local UI via URL fragment, paired extension) present the token on
every request.
"""

from __future__ import annotations

import contextlib
import json
import os
import secrets
import time
from dataclasses import asdict, dataclass
from pathlib import Path

DEFAULT_PORT = 47823
PORT_SCAN = 10


def home() -> Path:
    override = os.environ.get("LEETTRACE_HOME")
    return Path(override) if override else Path.home() / ".leettrace"


def session_path() -> Path:
    return home() / "session.json"


@dataclass(frozen=True)
class Session:
    port: int
    token: str
    pid: int
    version: str
    started_at: float

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def ui_url(self, run_id: str | None = None) -> str:
        # The token travels in the URL *fragment*: never sent to any server, never logged.
        frag = f"t={self.token}"
        if run_id:
            frag += f"&run={run_id}"
        return f"{self.base_url}/#{frag}"


def new_token() -> str:
    return secrets.token_urlsafe(32)


def write_session(session: Session) -> Path:
    d = home()
    d.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(d, 0o700)
    path = session_path()
    tmp = path.with_suffix(".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(asdict(session), f)
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)
    return path


def read_session() -> Session | None:
    try:
        data = json.loads(session_path().read_text(encoding="utf-8"))
        return Session(**data)
    except (OSError, ValueError, TypeError):
        return None


def clear_session(token: str) -> None:
    current = read_session()
    if current is not None and current.token == token:
        with contextlib.suppress(OSError):
            session_path().unlink()


def make_session(port: int, version: str) -> Session:
    return Session(
        port=port, token=new_token(), pid=os.getpid(), version=version, started_at=time.time()
    )
