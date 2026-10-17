"""Session discovery file: ~/.leettrace/session.json (SPEC §4.6, §8).

Holds the daemon's port and the bearer token. Created user-only (0600) inside a 0700
directory; clients (CLI, local UI via URL fragment, paired extension) present the token on
every request.

The token itself lives in ~/.leettrace/token (0600) and survives engine restarts, so a
connected extension keeps working after the app restarts or the computer reboots, with no
re-pairing (SPEC-PRODUCT §6). `leettrace token --rotate` replaces it; the extension then
re-handshakes silently through the engine's own page.
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

    def ui_url(self, run_id: str | None = None, view: str | None = None) -> str:
        # The token travels in the URL *fragment*: never sent to any server, never logged.
        frag = f"t={self.token}"
        if run_id:
            frag += f"&run={run_id}"
        if view:
            frag += f"&view={view}"
        return f"{self.base_url}/#{frag}"

    def welcome_url(self) -> str:
        return self.ui_url(view="welcome")


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_path() -> Path:
    return home() / "token"


def _write_private(path: Path, text: str) -> None:
    d = path.parent
    d.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(d, 0o700)
    tmp = path.with_suffix(".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)


def load_or_create_token() -> str:
    """The persistent engine token (created on first use)."""
    try:
        token = token_path().read_text(encoding="utf-8").strip()
        if len(token) >= 32:
            return token
    except OSError:
        pass
    return rotate_token()


def rotate_token() -> str:
    token = new_token()
    _write_private(token_path(), token)
    return token


def write_session(session: Session) -> Path:
    path = session_path()
    _write_private(path, json.dumps(asdict(session)))
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
        port=port,
        token=load_or_create_token(),
        pid=os.getpid(),
        version=version,
        started_at=time.time(),
    )
