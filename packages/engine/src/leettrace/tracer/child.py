"""Entry point of the sandboxed tracer subprocess (SPEC §4.1).

Protocol: one JSON request on stdin → one JSON trace written to a *private* copy of the
original stdout fd. fd 1 is pointed at /dev/null before user code runs, so nothing the
user's program writes (even via ``os.write(1, …)``) can corrupt the protocol.

Limits applied here (the parent additionally enforces a hard wall-clock kill):
- steps / wall time / recursion depth: inside the tracer (``Limits``), partial trace kept
- memory: RLIMIT_AS soft limit of baseline + ``max_memory_mb`` (POSIX, best-effort)
- CPU time: RLIMIT_CPU soft limit
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

from leettrace.tracer.core import Limits, Tracer


def _apply_rlimits(max_memory_mb: int, max_seconds: float) -> list[tuple[int, tuple[int, int]]]:
    restored: list[tuple[int, tuple[int, int]]] = []
    try:
        import resource
    except ImportError:  # Windows: rely on the parent's wall-clock kill
        return restored
    try:
        baseline = 0
        try:
            with open("/proc/self/statm") as f:
                baseline = int(f.read().split()[0]) * os.sysconf("SC_PAGE_SIZE")
        except (OSError, ValueError):
            pass
        soft, hard = resource.getrlimit(resource.RLIMIT_AS)
        want = baseline + max_memory_mb * 1024 * 1024
        if hard == resource.RLIM_INFINITY or want < hard:
            resource.setrlimit(resource.RLIMIT_AS, (want, hard))
            restored.append((resource.RLIMIT_AS, (soft, hard)))
    except (ValueError, OSError):
        pass
    try:
        soft, hard = resource.getrlimit(resource.RLIMIT_CPU)
        want_cpu = int(max_seconds) + 5
        if hard == resource.RLIM_INFINITY or want_cpu < hard:
            resource.setrlimit(resource.RLIMIT_CPU, (want_cpu, hard))
    except (ValueError, OSError):
        pass
    return restored


def _restore(restored: list[tuple[int, tuple[int, int]]]) -> None:
    try:
        import resource

        for which, limits in restored:
            resource.setrlimit(which, limits)
    except (ImportError, ValueError, OSError):
        pass


def main() -> None:
    request: dict[str, Any] = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    out_fd = os.dup(1)
    devnull = os.open(os.devnull, os.O_RDWR)
    os.dup2(devnull, 0)
    os.dup2(devnull, 1)

    lim = request.get("limits") or {}
    limits = Limits(
        max_steps=int(lim.get("maxSteps", Limits.max_steps)),
        max_seconds=float(lim.get("maxSeconds", Limits.max_seconds)),
        max_depth=int(lim.get("maxDepth", Limits.max_depth)),
    )
    restored = _apply_rlimits(int(lim.get("maxMemoryMb", 256)), limits.max_seconds)

    def emit(trace: dict[str, Any]) -> None:
        _restore(restored)  # serialization must not trip the user's memory budget
        data = json.dumps(trace, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        view = memoryview(data)
        while view:
            n = os.write(out_fd, view)
            view = view[n:]

    def on_abort(tracer: Tracer) -> None:
        from leettrace.tracer import narrate

        _restore(restored)
        narrate.finalize(tracer)
        extra = getattr(tracer, "result_extras", None)
        trace = tracer.result()
        if callable(extra):
            trace.update(extra())
        emit(trace)
        os._exit(0)

    mode = request.get("mode", "script")
    if mode == "script":
        from leettrace.tracer.core import run_script

        trace = run_script(
            request["source"], stdin=request.get("stdin", ""), limits=limits, on_abort=on_abort
        )
    elif mode == "leetcode":
        from leettrace.leetcode.harness import run_case

        trace = run_case(request, limits=limits, on_abort=on_abort)
    else:
        raise SystemExit(f"unknown mode {mode!r}")
    emit(trace)
    os._exit(0)


if __name__ == "__main__":
    main()
