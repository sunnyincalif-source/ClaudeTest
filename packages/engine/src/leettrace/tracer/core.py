"""The CPython tracer (SPEC §4.1, §4.4).

Runs *inside the sandboxed child process* (see ``child.py``) — stdlib only, so the child
starts fast and imports nothing it doesn't need. It drives real CPython via
``sys.settrace``, keeps a shadow stack of the user's frames, and on every event snapshots
the full stack plus the heap reachable from it, with ids that are stable across steps.

Output is a plain dict in the Trace Schema wire shape; the parent validates it with
Pydantic before it leaves the engine.
"""

from __future__ import annotations

import builtins
import io
import math
import sys
import time
import types
from collections import deque
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from leettrace import __version__

USER_FILENAME = "<solution>"
PRELUDE_FILENAME = "<prelude>"

JSON = dict[str, Any]

_MAX_SAFE_INT = 2**53
_CO_OPTIMIZED = 0x0001  # set on function code objects, not on class bodies


@dataclass(frozen=True)
class Limits:
    max_steps: int = 10_000
    max_seconds: float = 5.0
    max_depth: int = 200
    max_heap_objects: int = 300  # per step; beyond this refs dangle (UI shows "…")
    max_str: int = 200
    max_repr: int = 100
    max_stdout: int = 64_000
    max_total_heap_cells: int = 1_500_000  # across the whole trace (memory guard)


class _Abort(BaseException):  # noqa: N818 — internal control flow, not an error type
    """Raised from the trace function to stop the user's program on a limit breach."""


@dataclass
class _FrameRec:
    frame: types.FrameType
    fid: str
    func: str
    is_module: bool
    unwinding: bool = False


class _Capture(io.TextIOBase):
    """Cumulative stdout/stderr buffer with a size cap."""

    def __init__(self, limit: int) -> None:
        super().__init__()
        self.limit = limit
        self.parts: list[str] = []
        self.size = 0
        self.clipped = False

    def write(self, s: str) -> int:
        if not isinstance(s, str):
            raise TypeError(f"write() argument must be str, not {type(s).__name__}")
        room = self.limit - self.size
        if room <= 0:
            self.clipped = True
            return len(s)
        chunk = s if len(s) <= room else s[:room]
        if len(chunk) < len(s):
            self.clipped = True
        self.parts.append(chunk)
        self.size += len(chunk)
        return len(s)

    def writable(self) -> bool:
        return True

    def getvalue(self) -> str:
        if len(self.parts) > 1:
            self.parts = ["".join(self.parts)]
        text = self.parts[0] if self.parts else ""
        return text + ("\n… output truncated" if self.clipped else "")


def safe_repr(x: object, limit: int) -> str:
    try:
        r = repr(x)
    except Exception:  # an exotic object must never crash the tracer
        r = f"<{type(x).__name__} object>"
    return r if len(r) <= limit else r[: limit - 1] + "…"


def is_user_instance(x: object) -> bool:
    """Instances of classes defined by the user's program (or our LeetCode prelude)."""
    t = type(x)
    if t.__module__ != "__main__":
        return False
    return not isinstance(x, type | types.FunctionType | types.MethodType | types.ModuleType)


class Tracer:
    """One trace of one program. Not reusable."""

    def __init__(
        self,
        source: str,
        *,
        limits: Limits | None = None,
        hidden_if_empty: Iterable[object] = (),
        on_abort: Callable[[Tracer], None] | None = None,
    ) -> None:
        self.source = source
        self.limits = limits or Limits()
        self.steps: list[JSON] = []
        self.truncated = False
        self.error: JSON | None = None
        self.out = _Capture(limit=self.limits.max_stdout)
        self._shadow: list[_FrameRec] = []
        self._heap_ids: dict[int, str] = {}
        self._frame_ids: dict[int, str] = {}
        self._keepalive: list[object] = []  # keeps id() unique for the trace's lifetime
        self._exc_first_step: dict[int, int] = {}
        self._hidden_if_empty = {id(o) for o in hidden_if_empty}
        self._module_hidden: set[str] = set()
        self._start = 0.0
        self._cells = 0
        self._on_abort = on_abort
        # Side table for narration: per-step facts only knowable at trace time.
        self.facts: list[JSON] = []

    # ------------------------------------------------------------------ public API

    def hide_module_names(self, names: Iterable[str]) -> None:
        """Names already in the module namespace before user code ran (the prelude)."""
        self._module_hidden.update(names)

    def start(self) -> None:
        self._start = time.monotonic()
        sys.setrecursionlimit(max(sys.getrecursionlimit(), self.limits.max_depth * 6 + 200))
        sys.settrace(self._global_trace)

    def stop(self) -> None:
        sys.settrace(None)

    def finish_with_exception(self, exc: BaseException) -> None:
        """Record the uncaught exception as a final step showing where it blew up."""
        exc_type = type(exc).__name__
        message = str(exc)
        first = self._exc_first_step.get(id(exc))
        line = None
        if first is not None:
            base = self.steps[first]
            line = base["line"]
            final = dict(base)
            final["i"] = len(self.steps)
            final["event"] = "exception"
            final["stdout"] = self.out.getvalue()
            final["exception"] = {"type": exc_type, "message": message}
            self.steps.append(final)
            self.facts.append({"uncaught": True})
        self.error = {"type": exc_type, "message": message}
        if line is not None:
            self.error["line"] = line

    def result(self) -> JSON:
        trace: JSON = {
            "language": "python",
            "source": self.source,
            "steps": self.steps,
            "engineVersion": __version__,
        }
        if self.truncated:
            trace["truncated"] = True
        if self.error is not None:
            trace["error"] = self.error
        return trace

    # ------------------------------------------------------------------ trace functions

    def _global_trace(self, frame: types.FrameType, event: str, arg: Any) -> Any:
        if event != "call" or frame.f_code.co_filename != USER_FILENAME:
            return None
        code = frame.f_code
        if not code.co_flags & _CO_OPTIMIZED and code.co_name != "<module>":
            return None  # a class body: an implementation detail, not a call the user made
        rec = self._push(frame)
        if not rec.is_module:
            self._record(frame, "call")
        return self._local_trace

    def _local_trace(self, frame: types.FrameType, event: str, arg: Any) -> Any:
        rec = self._shadow[-1] if self._shadow else None
        if rec is None or rec.frame is not frame:
            # Shouldn't happen (local trace only fires for our frames), but never desync.
            return self._local_trace
        if event == "line":
            rec.unwinding = False
            self._record(frame, "line")
        elif event == "exception":
            exc = arg[1]
            rec.unwinding = True
            if exc is not None and id(exc) not in self._exc_first_step:
                self._keepalive.append(exc)
                self._exc_first_step[id(exc)] = len(self.steps)
            self._record(
                frame,
                "exception",
                exception={"type": arg[0].__name__, "message": str(exc)},
            )
        elif event == "return":
            # A module "returning" None is noise; only functions show a return value.
            show = not rec.unwinding and not rec.is_module
            self._record(frame, "return", return_value=(arg,) if show else None)
            self.facts[-1]["unwinding"] = rec.unwinding
            self._shadow.pop()
        return self._local_trace

    # ------------------------------------------------------------------ shadow stack

    def _push(self, frame: types.FrameType) -> _FrameRec:
        key = id(frame)
        fid = self._frame_ids.get(key)
        if fid is None:
            fid = f"f{len(self._frame_ids) + 1}"
            self._frame_ids[key] = fid
            self._keepalive.append(frame)
        code = frame.f_code
        is_module = code.co_name == "<module>"
        rec = _FrameRec(frame=frame, fid=fid, func=code.co_name, is_module=is_module)
        self._shadow.append(rec)
        if len(self._shadow) > self.limits.max_depth:
            self.truncated = True
            self.error = {
                "type": "RecursionLimit",
                "message": (
                    f"Recursion went deeper than {self.limits.max_depth} frames — "
                    "is a base case missing?"
                ),
                "line": frame.f_lineno,
            }
            self._record(
                frame,
                "exception",
                exception={"type": "RecursionLimit", "message": self.error["message"]},
                check_limits=False,
            )
            self._abort()
        return rec

    # ------------------------------------------------------------------ snapshots

    def _record(
        self,
        frame: types.FrameType,
        event: str,
        *,
        return_value: tuple[Any] | None = None,
        exception: JSON | None = None,
        check_limits: bool = True,
    ) -> None:
        if check_limits:
            self._check_limits()
        queue: deque[object] = deque()
        stack: list[JSON] = []
        for depth, rec in enumerate(self._shadow):
            is_top = depth == len(self._shadow) - 1
            stack.append(self._frame_json(rec, queue, return_value if is_top else None))
        heap = self._heap_json(queue)
        step: JSON = {
            "i": len(self.steps),
            "line": frame.f_lineno or 0,
            "event": event,
            "stack": stack,
            "heap": heap,
            "stdout": self.out.getvalue(),
        }
        if exception is not None:
            step["exception"] = exception
        self.steps.append(step)
        self.facts.append(self._facts_for(frame, event))

    def _facts_for(self, frame: types.FrameType, event: str) -> JSON:
        # Narration facts that need the live frame (evaluated conditions). Filled lazily by
        # the narrator hook, which is installed by narrate.attach().
        hook = getattr(self, "fact_hook", None)
        if hook is None:
            return {}
        try:
            result: JSON = hook(frame, event)
            return result
        except Exception:
            return {}

    def _frame_json(
        self, rec: _FrameRec, queue: deque[object], return_value: tuple[Any] | None
    ) -> JSON:
        locals_: JSON = {}
        order: list[str] = []
        try:
            items = list(rec.frame.f_locals.items())
        except Exception:
            items = []
        for name, value in items:
            if not self._visible(name, value, rec.is_module):
                continue
            locals_[name] = self._value(value, queue)
            order.append(name)
        frame: JSON = {
            "id": rec.fid,
            "func": rec.func,
            "locals": locals_,
            "order": order,
        }
        if return_value is not None:
            frame["returnValue"] = self._value(return_value[0], queue)
        return frame

    def _visible(self, name: str, value: object, is_module: bool) -> bool:
        if name.startswith("__") and name.endswith("__"):
            return False
        if is_module and name in self._module_hidden:
            return False
        if isinstance(value, types.ModuleType | type):
            return False
        # Hide definitions (`def dfs` → name dfs) but keep aliases/callbacks visible.
        if isinstance(value, types.FunctionType) and value.__name__ == name:
            return False
        if id(value) in self._hidden_if_empty:
            try:
                if not vars(value):
                    return False
            except TypeError:
                return False
        return True

    def _heap_id(self, x: object) -> str:
        key = id(x)
        hid = self._heap_ids.get(key)
        if hid is None:
            hid = f"o{len(self._heap_ids) + 1}"
            self._heap_ids[key] = hid
            self._keepalive.append(x)
        return hid

    def _value(self, x: object, queue: deque[object]) -> JSON:
        t = type(x)
        if x is None:
            return {"kind": "none"}
        if t is bool:
            return {"kind": "bool", "value": x}
        if t is int:
            assert isinstance(x, int)
            if -_MAX_SAFE_INT <= x <= _MAX_SAFE_INT:
                return {"kind": "int", "value": x}
            return {"kind": "unserializable", "repr": safe_repr(x, self.limits.max_repr)}
        if t is float:
            assert isinstance(x, float)
            if math.isfinite(x):
                return {"kind": "float", "value": x}
            return {"kind": "unserializable", "repr": repr(x)}
        if t is str:
            assert isinstance(x, str)
            s = x if len(x) <= self.limits.max_str else x[: self.limits.max_str] + "…"
            return {"kind": "str", "value": s}
        if t in (list, tuple, dict, set, frozenset, deque) or is_user_instance(x):
            queue.append(x)
            return {"kind": "ref", "id": self._heap_id(x)}
        return {"kind": "unserializable", "repr": safe_repr(x, self.limits.max_repr)}

    def _heap_json(self, queue: deque[object]) -> JSON:
        heap: JSON = {}
        while queue and len(heap) < self.limits.max_heap_objects:
            obj = queue.popleft()
            hid = self._heap_id(obj)
            if hid in heap:
                continue
            heap[hid] = self._object_json(obj, hid, queue)
        self._cells += len(heap)
        return heap

    def _object_json(self, obj: object, hid: str, queue: deque[object]) -> JSON:
        if isinstance(obj, list | deque):
            return {"type": "list", "id": hid, "items": [self._value(v, queue) for v in obj]}
        if isinstance(obj, tuple):
            return {"type": "tuple", "id": hid, "items": [self._value(v, queue) for v in obj]}
        if isinstance(obj, set | frozenset):
            try:
                items: list[object] = sorted(obj)
            except TypeError:
                items = list(obj)
            return {"type": "set", "id": hid, "items": [self._value(v, queue) for v in items]}
        if isinstance(obj, dict):
            return {
                "type": "dict",
                "id": hid,
                "entries": [
                    {"key": self._value(k, queue), "value": self._value(v, queue)}
                    for k, v in list(obj.items())
                ],
            }
        fields: JSON = {}
        try:
            attrs = dict(vars(obj))
        except TypeError:
            attrs = {}
        for slot in getattr(type(obj), "__slots__", ()):
            if isinstance(slot, str) and hasattr(obj, slot):
                attrs.setdefault(slot, getattr(obj, slot))
        for name, value in attrs.items():
            if name.startswith("__"):
                continue
            fields[name] = self._value(value, queue)
        return {"type": "instance", "id": hid, "className": type(obj).__name__, "fields": fields}

    # ------------------------------------------------------------------ limits

    def _check_limits(self) -> None:
        lim = self.limits
        if len(self.steps) >= lim.max_steps:
            self.truncated = True
            self._abort()
        if self._cells >= lim.max_total_heap_cells:
            self.truncated = True
            self.error = {
                "type": "TraceTooLarge",
                "message": "Stopped: the trace's heap snapshots got too large to visualize.",
            }
            self._abort()
        if time.monotonic() - self._start > lim.max_seconds:
            self.truncated = True
            self.error = {
                "type": "Timeout",
                "message": f"Stopped after {lim.max_seconds:g}s — is there an infinite loop?",
            }
            self._abort()

    def _abort(self) -> None:
        sys.settrace(None)
        if self._on_abort is not None:
            # The child finalizes and exits immediately, so a user `except:` can't swallow
            # the stop and keep running untraced.
            self._on_abort(self)
        raise _Abort()


def make_namespace() -> dict[str, Any]:
    return {"__name__": "__main__", "__builtins__": builtins}


def run_script(
    source: str,
    *,
    stdin: str = "",
    limits: Limits | None = None,
    on_abort: Callable[[Tracer], None] | None = None,
    narrate: bool = True,
) -> JSON:
    """Trace a whole program (script mode)."""
    tracer = Tracer(source, limits=limits, on_abort=on_abort)
    if narrate:
        from leettrace.tracer import narrate as narr

        narr.attach(tracer)
    try:
        code = compile(source, USER_FILENAME, "exec")
    except SyntaxError as e:
        return syntax_error_trace(source, e)

    ns = make_namespace()
    with redirected_io(tracer.out, stdin):
        tracer.start()
        try:
            exec(code, ns)
        except _Abort:
            pass
        except BaseException as e:  # the user's program raised: a feature, not a crash
            tracer.stop()
            tracer.finish_with_exception(e)
        finally:
            tracer.stop()
    if narrate:
        narr.finalize(tracer)
    return tracer.result()


def syntax_error_trace(source: str, e: SyntaxError) -> JSON:
    line = e.lineno or 1
    message = e.msg or str(e)
    return {
        "language": "python",
        "source": source,
        "steps": [
            {
                "i": 0,
                "line": line,
                "event": "exception",
                "stack": [],
                "heap": {},
                "stdout": "",
                "note": f"SyntaxError on line {line}: {message}. Nothing ran.",
                "exception": {"type": type(e).__name__, "message": message},
            }
        ],
        "error": {"type": type(e).__name__, "message": message, "line": line},
        "engineVersion": __version__,
    }


class redirected_io:  # noqa: N801 — used as a context manager
    def __init__(self, out: _Capture, stdin: str) -> None:
        self.out = out
        self.stdin = io.StringIO(stdin)

    def __enter__(self) -> None:
        self.saved = (sys.stdout, sys.stderr, sys.stdin)
        sys.stdout = sys.stderr = self.out
        sys.stdin = self.stdin

    def __exit__(self, *_: object) -> None:
        sys.stdout, sys.stderr, sys.stdin = self.saved
