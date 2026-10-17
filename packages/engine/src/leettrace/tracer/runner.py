"""Parent side of the sandbox: spawn the tracer child, enforce a hard wall-clock kill,
and validate whatever comes back against the schema (the engine boundary)."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from typing import Any

from leettrace import __version__
from leettrace.schema import validate_trace

CHILD_FLAG = "--leettrace-tracer-child"


@dataclass(frozen=True)
class RunLimits:
    max_steps: int = 10_000
    max_seconds: float = 5.0
    max_depth: int = 200
    max_memory_mb: int = 256

    def as_json(self) -> dict[str, Any]:
        return {
            "maxSteps": self.max_steps,
            "maxSeconds": self.max_seconds,
            "maxDepth": self.max_depth,
            "maxMemoryMb": self.max_memory_mb,
        }


def child_command() -> list[str]:
    if getattr(sys, "frozen", False):  # PyInstaller standalone binary
        return [sys.executable, CHILD_FLAG]
    # -I: isolated mode (ignore PYTHON* env vars, user site-packages, and the cwd).
    return [sys.executable, "-I", "-m", "leettrace.tracer.child"]


def _child_env() -> dict[str, str]:
    env = {
        "PYTHONHASHSEED": "0",  # deterministic set/dict-of-str ordering → stable traces
        "PYTHONIOENCODING": "utf-8",
        "PYTHONDONTWRITEBYTECODE": "1",
    }
    for key in ("PATH", "SYSTEMROOT", "TMPDIR", "TEMP", "TMP", "LANG"):
        if key in os.environ:
            env[key] = os.environ[key]
    return env


def _error_trace(
    source: str, etype: str, message: str, *, truncated: bool = False
) -> dict[str, Any]:
    trace: dict[str, Any] = {
        "language": "python",
        "source": source,
        "steps": [],
        "error": {"type": etype, "message": message},
        "engineVersion": __version__,
    }
    if truncated:
        trace["truncated"] = True
    return trace


def run_request(request: dict[str, Any], limits: RunLimits | None = None) -> dict[str, Any]:
    """Run one tracer request in a fresh sandboxed subprocess. Never raises for user code."""
    limits = limits or RunLimits()
    request = {**request, "limits": limits.as_json()}
    source = str(request.get("source", ""))
    hard_timeout = limits.max_seconds + 10.0  # startup + serialization headroom
    with tempfile.TemporaryDirectory(prefix="leettrace-") as cwd:
        try:
            proc = subprocess.run(
                child_command(),
                input=json.dumps(request).encode("utf-8"),
                capture_output=True,
                timeout=hard_timeout,
                cwd=cwd,
                env=_child_env(),
                check=False,
            )
        except subprocess.TimeoutExpired:
            return validate_trace(
                _error_trace(
                    source,
                    "Timeout",
                    f"The program was killed after {hard_timeout:g}s without finishing.",
                    truncated=True,
                )
            )
    if not proc.stdout:
        tail = proc.stderr.decode("utf-8", "replace").strip().splitlines()[-3:]
        if proc.returncode in (-9, 137) or "MemoryError" in " ".join(tail):
            return validate_trace(
                _error_trace(
                    source,
                    "MemoryLimit",
                    f"The program exceeded the {limits.max_memory_mb}MB memory limit.",
                    truncated=True,
                )
            )
        detail = " / ".join(tail) or f"exit code {proc.returncode}"
        return validate_trace(_error_trace(source, "EngineError", f"Tracer crashed: {detail}"))
    raw = json.loads(proc.stdout.decode("utf-8"))
    return validate_trace(raw)


def trace_script(source: str, stdin: str = "", limits: RunLimits | None = None) -> dict[str, Any]:
    return run_request({"mode": "script", "source": source, "stdin": stdin}, limits)
