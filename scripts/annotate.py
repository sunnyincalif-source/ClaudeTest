"""Run a command; if it fails, publish the tail of its output as a GitHub Actions error
annotation (readable via the public checks API, unlike raw logs).

    python scripts/annotate.py "<title>" <command...>
"""

import subprocess
import sys

# Windows consoles default to cp1252; never let echoing the output crash the reporter.
for stream in (sys.stdout, sys.stderr):
    stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]

title, cmd = sys.argv[1], sys.argv[2:]
proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
out = proc.stdout.decode("utf-8", "replace")
sys.stdout.write(out)
sys.stdout.flush()
if proc.returncode != 0:
    lines = out.strip().splitlines()
    # Prefer pytest's failure summary if present, else the tail.
    marks = [i for i, ln in enumerate(lines) if ln.startswith(("FAILED", "ERROR", "E   "))]
    tail = "\n".join(lines[max(0, marks[0] - 25) :][:60] if marks else lines[-60:])
    msg = tail.replace("%", "%25").replace("\r", "").replace("\n", "%0A")
    print(f"::error title={title} (exit {proc.returncode})::{msg}")
sys.exit(proc.returncode)
