"""Run a command; if it fails, publish the tail of its output as a GitHub Actions error
annotation (readable via the public checks API, unlike raw logs).

    python scripts/annotate.py "<title>" <command...>
"""

import subprocess
import sys

title, cmd = sys.argv[1], sys.argv[2:]
proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
out = proc.stdout.decode("utf-8", "replace")
sys.stdout.write(out)
sys.stdout.flush()
if proc.returncode != 0:
    tail = "\n".join(out.strip().splitlines()[-60:])
    msg = tail.replace("%", "%25").replace("\r", "").replace("\n", "%0A")
    print(f"::error title={title} (exit {proc.returncode})::{msg}")
sys.exit(proc.returncode)
