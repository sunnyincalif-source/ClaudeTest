"""LeetCode harness (SPEC §4.5). Runs inside the sandbox child.

Given ``{source, functionName?, input, expected?, caseIndex}``:
1. Run the user's module *untraced*, after a prelude that provides what LeetCode's
   environment does implicitly (typing names, collections, ListNode/TreeNode, …).
2. Find ``class Solution`` and the method (``functionName`` or the first public method).
3. Parse the example input against the method signature (ListNode/TreeNode decoding).
4. Trace *only the user's frames* while calling ``Solution().method(*args)`` — harness and
   prelude frames have other filenames and never appear in the trace.
5. Compare the return value (or, for ``-> None`` in-place problems, the first argument) to
   ``expected`` and attach a ``TestResult``.
"""

from __future__ import annotations

import inspect
from collections.abc import Callable
from typing import Any

from leettrace.leetcode import codec
from leettrace.tracer import narrate
from leettrace.tracer.core import (
    JSON,
    PRELUDE_FILENAME,
    USER_FILENAME,
    Limits,
    Tracer,
    _Abort,
    make_namespace,
    redirected_io,
    syntax_error_trace,
)

PRELUDE = """
from typing import *
import collections, heapq, bisect, math, itertools, functools, string, re, random, operator
from collections import deque, defaultdict, Counter, OrderedDict
from functools import lru_cache, cache, reduce
from heapq import heappush, heappop, heapify, heappushpop, nlargest, nsmallest
from bisect import bisect_left, bisect_right, insort
from itertools import accumulate, combinations, permutations, product
from math import inf, gcd, sqrt, floor, ceil
random.seed(0)

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
"""


class HarnessError(Exception):
    pass


def _error(source: str, etype: str, message: str, test: JSON | None = None) -> JSON:
    from leettrace import __version__

    trace: JSON = {
        "language": "python",
        "source": source,
        "steps": [],
        "error": {"type": etype, "message": message},
        "engineVersion": __version__,
    }
    if test is not None:
        trace["test"] = test
    return trace


def find_method(ns: dict[str, Any], function_name: str | None) -> tuple[type, str]:
    cls = ns.get("Solution")
    if not isinstance(cls, type):
        raise HarnessError("Expected a `class Solution` with your method (LeetCode style).")
    if function_name:
        if not callable(getattr(cls, function_name, None)):
            raise HarnessError(f"`Solution` has no method `{function_name}`.")
        return cls, function_name
    for name, value in vars(cls).items():
        if not name.startswith("_") and inspect.isfunction(value):
            return cls, name
    raise HarnessError("`class Solution` has no public method to call.")


def bind_args(
    method: Callable[..., Any], case_text: str, ns: dict[str, Any]
) -> tuple[list[Any], list[str]]:
    params = [
        p
        for p in inspect.signature(method).parameters.values()
        if p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD)
    ]
    pairs = codec.parse_case(case_text)
    by_name = {n: v for n, v in pairs if n is not None}
    positional = [v for n, v in pairs if n is None]
    args: list[Any] = []
    for i, p in enumerate(params):
        if p.name in by_name:
            raw = by_name[p.name]
        elif by_name and i < len(pairs) and pairs[i][0] is not None:
            raw = pairs[i][1]  # names differ from the signature: fall back to order
        elif i < len(positional):
            raw = positional[i]
        elif p.default is not p.empty:
            continue
        else:
            raise HarnessError(f"The test case doesn't give a value for `{p.name}`.")
        args.append(codec.convert_arg(raw, p.annotation, ns))
    return args, [p.name for p in params]


def run_case(
    request: dict[str, Any], *, limits: Limits, on_abort: Callable[[Tracer], None]
) -> JSON:
    source: str = request["source"]
    case_text: str = request.get("input") or ""
    expected: str | None = request.get("expected")
    index = int(request.get("caseIndex") or 0)
    test: JSON = {"index": index, "input": case_text.strip()}
    if expected is not None and expected.strip():
        test["expected"] = expected.strip()

    try:
        code = compile(source, USER_FILENAME, "exec")
    except SyntaxError as e:
        trace = syntax_error_trace(source, e)
        trace["test"] = {**test, "error": f"SyntaxError: {e.msg}"}
        return trace

    ns = make_namespace()
    tracer = Tracer(source, limits=limits, on_abort=on_abort)
    narrate.attach(tracer)

    # 1) prelude + the user's module, untraced (class/def statements, not the interesting part)
    with redirected_io(tracer.out, ""):
        try:
            exec(compile(PRELUDE, PRELUDE_FILENAME, "exec"), ns)
            exec(code, ns)
        except BaseException as e:
            return _error(
                source,
                type(e).__name__,
                f"while loading your code: {e}",
                {**test, "error": f"{type(e).__name__}: {e}"},
            )

    # 2-3) find the method and build its arguments
    try:
        cls, name = find_method(ns, request.get("functionName"))
        solution = cls()
        method = getattr(solution, name)
        args, _names = bind_args(method, case_text, ns)
        returns_none = _returns_none(getattr(cls, name))
    except (HarnessError, codec.CaseParseError) as e:
        return _error(source, "TestCaseError", str(e), {**test, "error": str(e)})
    except Exception as e:  # e.g. Solution.__init__ raised
        return _error(
            source, type(e).__name__, str(e), {**test, "error": f"{type(e).__name__}: {e}"}
        )

    # 4) trace only the user's frames (hide an empty `self`: it's harness plumbing)
    tracer._hidden_if_empty.add(id(solution))  # noqa: SLF001
    tracer._keepalive.append(solution)  # noqa: SLF001

    def stopped_test() -> JSON:
        return {"test": {**test, "error": "Stopped before finishing (step/time/depth cap)."}}

    tracer.result_extras = stopped_test  # type: ignore[attr-defined]
    result: Any = None
    raised: BaseException | None = None
    with redirected_io(tracer.out, ""):
        tracer.start()
        try:
            result = method(*args)
        except _Abort:
            pass
        except BaseException as e:
            tracer.stop()
            raised = e
            tracer.finish_with_exception(e)
        finally:
            tracer.stop()
    narrate.finalize(tracer)
    trace = tracer.result()

    # 5) verdict
    if raised is not None:
        test["error"] = f"{type(raised).__name__}: {raised}"
    elif trace.get("truncated"):
        test["error"] = "Stopped before finishing (step/time/depth cap)."
    else:
        actual_obj = args[0] if returns_none and args else result
        test["actual"] = codec.to_leetcode(actual_obj)
        if "expected" in test:
            test["passed"] = codec.outputs_equal(actual_obj, test["expected"])
    trace["test"] = test
    return trace


def _returns_none(fn: Any) -> bool:
    try:
        ann = inspect.signature(fn).return_annotation
    except (TypeError, ValueError):
        return False
    return ann is None or ann == "None"
