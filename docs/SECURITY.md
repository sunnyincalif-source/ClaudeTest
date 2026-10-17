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

**How the extension gets the token.** It never reads the token file. The engine holds one
6-digit pairing code. The code is shown on the local welcome page, which already holds the
token, and in the terminal. You paste it into the panel on a LeetCode problem once.

- The exchange (`/pair/confirm`) is only accepted from `https://leetcode.com`.
- Each code works once, and it expires after 15 minutes.
- After 5 wrong guesses the code is replaced.
- Attempts are rate-limited to 20 a minute.
- Reading the code (`/pair/code`) needs the session token.

The token is kept in extension storage, which leetcode.com's own scripts cannot read.

**How the local web UI gets the token.** `leettrace start/run/open` opens the UI with the
token in the URL fragment (`#t=…`). Fragments are never sent to a server. The UI moves the
token into per-tab `sessionStorage` and removes it from the address bar.

## Runaway or hostile programs

Your code runs in a fresh subprocess with these limits:

- `python -I` (isolated mode), a minimal environment, a temporary working directory, and a
  deterministic hash seed.
- A cap of 10,000 trace steps, 5 s wall clock inside the tracer, and a recursion depth of 200. When a cap is hit, you get a partial trace marked `truncated`.
- Memory: 256 MB for your program.
  - **Linux:** enforced with `RLIMIT_AS`, with `RLIMIT_CPU` as well.
  - **Windows:** enforced with a Job Object, which also prevents the program from starting
    other processes.
  - **macOS:** best effort only, because macOS doesn't enforce `RLIMIT_AS`.
  - `/health` and the welcome page report which of these applies, so the cap is never
    silently missing.
- The parent kills the process after a hard timeout.
- The protocol result goes over a private file descriptor. The user program's stdout (fd 1)
  is `/dev/null`, so printing cannot corrupt the trace.

This is a **resource sandbox, not a security sandbox**. The code you trace has your user's
permissions, just as it would if you ran `python solution.py` yourself or used a debugger.
The token, origin, and loopback layers above ensure the only code that runs is code you
handed to LeetTrace.

## Reporting

Please report vulnerabilities privately to the maintainers rather than in a public issue.
