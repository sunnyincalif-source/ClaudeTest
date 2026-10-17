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


_WINDOWS_JOB_OK: bool | None = None  # learned on first run: did the Job Object attach?


def memory_cap_status() -> dict[str, str]:
    """How the per-run memory cap is enforced on this OS. Never claims a cap that isn't there.

    Step, time and recursion-depth caps are enforced by the tracer on every OS.
    """
    if sys.platform.startswith("linux"):
        return {"memory": "enforced", "mechanism": "RLIMIT_AS"}
    if sys.platform == "darwin":
        return {
            "memory": "best-effort",
            "mechanism": "RLIMIT_AS (macOS may not enforce it); step/time/depth caps apply",
        }
    if sys.platform == "win32":
        if _WINDOWS_JOB_OK is False:
            return {
                "memory": "unavailable",
                "mechanism": "Job Object could not be applied; step/time/depth caps apply",
            }
        return {"memory": "enforced", "mechanism": "Windows Job Object"}
    return {"memory": "unavailable", "mechanism": "unsupported OS; step/time/depth caps apply"}


class _Completed:
    def __init__(self, returncode: int, stdout: bytes, stderr: bytes) -> None:
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def _spawn(request_bytes: bytes, cwd: str, timeout: float, memory_mb: int) -> _Completed:
    """Start the child, cap it (Job Object on Windows) *before* it receives the program."""
    global _WINDOWS_JOB_OK
    job = None
    proc = subprocess.Popen(
        child_command(),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=cwd,
        env=_child_env(),
    )
    try:
        if sys.platform == "win32":
            from leettrace.tracer.winjob import WindowsJob

            try:
                job = WindowsJob(memory_mb)
                _WINDOWS_JOB_OK = job.assign(proc)
            except OSError:
                _WINDOWS_JOB_OK = False
        out, err = proc.communicate(request_bytes, timeout=timeout)
        return _Completed(proc.returncode, out, err)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.communicate()
        raise
    finally:
        if job is not None:
            job.close()


def run_request(request: dict[str, Any], limits: RunLimits | None = None) -> dict[str, Any]:
    """Run one tracer request in a fresh sandboxed subprocess. Never raises for user code."""
    limits = limits or RunLimits()
    request = {**request, "limits": limits.as_json()}
    source = str(request.get("source", ""))
    hard_timeout = limits.max_seconds + 10.0  # startup + serialization headroom
    with tempfile.TemporaryDirectory(prefix="leettrace-") as cwd:
        try:
            proc = _spawn(
                json.dumps(request).encode("utf-8"), cwd, hard_timeout, limits.max_memory_mb
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
        # 137/-9: killed by the OS; 0xC0000017 (STATUS_NO_MEMORY) or a job kill on Windows.
        oom_codes = (-9, 137, 3221225495, -1073741801)
        if proc.returncode in oom_codes or "MemoryError" in " ".join(tail):
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
