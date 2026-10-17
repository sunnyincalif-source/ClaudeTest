"""Request gatekeeping for the loopback server (SPEC §8). Load-bearing, not polish.

Order of checks for every HTTP request:
1. Host header must be our loopback address+port (defeats DNS-rebinding attacks, where an
   attacker's domain resolves to 127.0.0.1 so the browser treats it as same-origin).
2. If an Origin header is present it must be on the allowlist: https://leetcode.com and the
   local UI's own origin. Never widened for convenience.
3. CORS preflights from allowed origins are answered (incl. Private Network Access).
4. API routes require `Authorization: Bearer <session token>` (constant-time compare).
   Only the static UI shell (no data, no execution) is served without the token.
"""

from __future__ import annotations

import hmac
from collections.abc import Iterable

LEETCODE_ORIGIN = "https://leetcode.com"

# Paths that execute nothing and expose nothing: the static UI shell and the pairing
# handshake (which itself requires an out-of-band code typed by the user).
PUBLIC_PREFIXES = ("/assets/", "/pair/")
PUBLIC_PATHS = ("/", "/index.html", "/favicon.svg", "/favicon.ico")


class Gate:
    def __init__(self, token: str, port: int, *, dev_origins: Iterable[str] = ()) -> None:
        self.token = token
        self.port = port
        self.hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
        self.local_origins = {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}
        self.origins = {LEETCODE_ORIGIN, *self.local_origins, *dev_origins}

    def host_ok(self, host: str | None) -> bool:
        return host is not None and host.lower() in self.hosts

    def origin_ok(self, origin: str | None) -> bool:
        return origin is None or origin in self.origins

    def token_ok(self, presented: str | None) -> bool:
        if not presented:
            return False
        return hmac.compare_digest(presented.encode(), self.token.encode())

    @staticmethod
    def bearer(header: str | None) -> str | None:
        if header and header.startswith("Bearer "):
            return header[len("Bearer ") :].strip()
        return None

    @staticmethod
    def is_public(path: str) -> bool:
        return path in PUBLIC_PATHS or path.startswith(PUBLIC_PREFIXES)
