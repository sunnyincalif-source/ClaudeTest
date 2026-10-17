# Security model

LeetTrace runs a small server on your computer that executes Python code. That is a real
attack surface, so the protections below are load-bearing, and they are covered by tests in
`packages/engine/tests/test_server.py`.

## What we defend against

**A random web page quietly sending code to your machine.** Any site you visit can make your
browser send requests to `127.0.0.1`. LeetTrace refuses them because:

| Layer            | What it does                                                                                                                                                                          | Where                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Loopback bind    | The server listens on `127.0.0.1` only. It never binds the wildcard address or a LAN interface. A test fails the build if the wildcard address appears anywhere in the engine source. | `server/daemon.py`   |
| Session token    | A 256-bit random token is required on every API request (`Authorization: Bearer …`, or `?token=` for the WebSocket). It is compared in constant time. Requests without it get `401`.  | `server/security.py` |
| Token storage    | `~/.leettrace/session.json` is `0600` inside a `0700` directory. The daemon log is `0600`.                                                                                            | `server/session.py`  |
| Origin allowlist | Only `https://leetcode.com` and the engine's own UI origin are accepted. Anything else gets `403`, even with a valid token. The list is never widened for convenience.                | `server/security.py` |
| Host check       | The `Host` header must be `127.0.0.1:<port>` or `localhost:<port>`. This defeats DNS-rebinding attacks, where an attacker's domain resolves to 127.0.0.1.                             | `server/security.py` |
| Size limits      | Bodies over 1 MB are rejected with `413` before parsing. Code is limited to 100 KB and input to 100 KB.                                                                               | `server/app.py`      |
| Static shell     | The UI's HTML is public but contains no data. It is served with a strict CSP and `frame-ancestors 'none'`.                                                                            | `server/app.py`      |

**How the extension gets the token.** It never reads the token file. On first use the panel
asks the engine to pair. This request is only accepted from `https://leetcode.com`. The
engine then prints a one-time 6-digit code in your terminal, and you type it into the panel.
A request is locked out after 5 wrong attempts, at most 3 pairing requests can be pending at
once, and new requests are rate-limited. The token is kept in extension storage, which
leetcode.com's own scripts cannot read.

**How the local web UI gets the token.** `leettrace start/run/open` opens the UI with the
token in the URL fragment (`#t=…`). Fragments are never sent to a server. The UI moves the
token into per-tab `sessionStorage` and removes it from the address bar.

## Runaway or hostile programs

Your code runs in a fresh subprocess with these limits:

- `python -I` (isolated mode), a minimal environment, a temporary working directory, and a
  deterministic hash seed.
- A cap of 10,000 trace steps, 5 s wall clock inside the tracer, and a recursion depth of 200. When a cap is hit, you get a partial trace marked `truncated`.
- On POSIX, `RLIMIT_AS` allows 256 MB above the interpreter's baseline, and `RLIMIT_CPU` is
  also capped.
- The parent kills the process after a hard timeout.
- The protocol result goes over a private file descriptor. The user program's stdout (fd 1)
  is `/dev/null`, so printing cannot corrupt the trace.

This is a **resource sandbox, not a security sandbox**. The code you trace has your user's
permissions, just as it would if you ran `python solution.py` yourself or used a debugger.
The token, origin, and loopback layers above ensure the only code that runs is code you
handed to LeetTrace.

## Reporting

Please report vulnerabilities privately to the maintainers rather than in a public issue.
