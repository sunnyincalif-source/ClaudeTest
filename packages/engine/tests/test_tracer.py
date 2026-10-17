"""Golden-trace tests (SPEC §4.7). These are the credibility of the project."""

from __future__ import annotations

import sys
from typing import Any

import pytest

from conftest import program
from helpers import final, frame_local, max_depth, walk_next
from leettrace.schema import validate_trace
from leettrace.tracer.runner import RunLimits, trace_script

EXPECTED_STDOUT = {
    "factorial": "120\n",
    "fibonacci": "5\n",
    "linked_list_build": "1\n2\n3\n4\n",
    "linked_list_reverse": "[4, 3, 2, 1]\n",
    "bst_insert_inorder": "[1, 3, 4, 5, 8, 9]\n",
    "bubble_sort": "[1, 2, 4, 5, 8]\n",
    "two_sum": "[0, 1]\n",
    "exception_divzero": "6.0\n",
}

_cache: dict[str, dict[str, Any]] = {}


def traced(name: str) -> dict[str, Any]:
    if name not in _cache:
        _cache[name] = trace_script(program(name))
    return _cache[name]


@pytest.mark.parametrize("name", sorted(EXPECTED_STDOUT))
def test_stdout_matches_cpython(name: str) -> None:
    assert final(traced(name))["stdout"] == EXPECTED_STDOUT[name]


@pytest.mark.parametrize("name", sorted(EXPECTED_STDOUT))
def test_golden_snapshot(name: str, snapshot: Any) -> None:
    snapshot(name, traced(name))


@pytest.mark.parametrize("name", sorted(EXPECTED_STDOUT))
def test_schema_valid_and_well_formed(name: str) -> None:
    trace = traced(name)
    assert validate_trace(trace) == trace
    for i, step in enumerate(trace["steps"]):
        assert step["i"] == i
        assert step["line"] >= 1
        # Every ref in stack + heap resolves (heap is complete reachability, no dangling).
        refs = _refs(step)
        assert refs <= set(step["heap"]), f"dangling refs at step {i}"
        # ...and nothing unreachable is in the heap.
        assert set(step["heap"]) <= refs, f"unreachable heap objects at step {i}"
        assert step.get("note"), f"step {i} has no narration"


def _refs(step: dict[str, Any]) -> set[str]:
    out: set[str] = set()

    def visit(v: dict[str, Any]) -> None:
        if v["kind"] == "ref":
            out.add(v["id"])

    for f in step["stack"]:
        for v in f["locals"].values():
            visit(v)
        if "returnValue" in f:
            visit(f["returnValue"])
    for obj in step["heap"].values():
        if obj["type"] in ("list", "tuple", "set"):
            for v in obj["items"]:
                visit(v)
        elif obj["type"] == "dict":
            for e in obj["entries"]:
                visit(e["key"])
                visit(e["value"])
        else:
            for v in obj["fields"].values():
                visit(v)
    return out


def test_factorial_stack_pushes_and_pops() -> None:
    trace = traced("factorial")
    depths = [len(s["stack"]) for s in trace["steps"]]
    assert max(depths) == 6  # <module> + factorial(5..1)
    calls = [s for s in trace["steps"] if s["event"] == "call"]
    assert [c["stack"][-1]["locals"]["n"]["value"] for c in calls] == [5, 4, 3, 2, 1]
    returns = [
        s["stack"][-1]["returnValue"]["value"]
        for s in trace["steps"]
        if s["event"] == "return" and s["stack"][-1]["func"] == "factorial"
    ]
    assert returns == [1, 2, 6, 24, 120]
    # Frame ids are stable per activation and distinct across activations.
    ids = {c["stack"][-1]["id"] for c in calls}
    assert len(ids) == 5


def test_fib_recursion_tree() -> None:
    trace = traced("fibonacci")
    calls = [s for s in trace["steps"] if s["event"] == "call"]
    assert len(calls) == 15  # fib(5) makes 15 calls
    assert max_depth(trace) == 6


def test_linked_list_build_nodes_appear() -> None:
    trace = traced("linked_list_build")
    step = next(s for s in trace["steps"] if s["line"] == 13)  # cur = head
    head = frame_local(step, "head")
    assert walk_next(step, head) == [1, 2, 3, 4]
    classes = {o["className"] for o in step["heap"].values() if o["type"] == "instance"}
    assert classes == {"Node"}


def test_linked_list_reverse_rewires_with_stable_ids() -> None:
    trace = traced("linked_list_reverse")
    steps = trace["steps"]
    before = next(s for s in steps if s["line"] == 9)  # prev = None
    after = next(s for s in steps if s["line"] == 18)  # out = []
    head_before = frame_local(before, "head")
    head_after = frame_local(after, "head")
    assert walk_next(before, head_before) == [1, 2, 3, 4]
    assert walk_next(after, head_after) == [4, 3, 2, 1]
    # The new head is the *same object* (same HeapId) that was the old tail.
    ids_before = _chain_ids(before, head_before)
    assert head_after["id"] == ids_before[-1]
    assert _chain_ids(after, head_after) == list(reversed(ids_before))
    # Exactly one pointer flips per `cur.next = prev` step.
    flips = [s for s in steps if s["line"] == 13]
    assert len(flips) == 4


def _chain_ids(step: dict[str, Any], ref: dict[str, Any]) -> list[str]:
    out = []
    while ref["kind"] == "ref":
        out.append(ref["id"])
        ref = step["heap"][ref["id"]]["fields"]["next"]
    return out


def test_bst_structure() -> None:
    trace = traced("bst_insert_inorder")
    step = next(s for s in trace["steps"] if s["line"] == 31)  # result = []
    root = frame_local(step, "root")
    node = step["heap"][root["id"]]
    assert node["fields"]["val"]["value"] == 5
    left = step["heap"][node["fields"]["left"]["id"]]
    right = step["heap"][node["fields"]["right"]["id"]]
    assert (left["fields"]["val"]["value"], right["fields"]["val"]["value"]) == (3, 8)


def test_bubble_sort_list_identity_stable() -> None:
    trace = traced("bubble_sort")
    ids = {
        frame_local(s, "nums")["id"] for s in trace["steps"] if "nums" in s["stack"][-1]["locals"]
    }
    assert len(ids) == 1
    swaps = [s for s in trace["steps"] if s.get("note", "").startswith("Swap:")]
    assert len(swaps) == 4


def test_two_sum_dict() -> None:
    trace = traced("two_sum")
    ret = next(
        s for s in trace["steps"] if s["event"] == "return" and s["stack"][-1]["func"] == "two_sum"
    )
    seen = frame_local(ret, "seen")
    d = ret["heap"][seen["id"]]
    assert d["type"] == "dict"
    assert [(e["key"]["value"], e["value"]["value"]) for e in d["entries"]] == [(2, 0)]


def test_exception_is_captured_not_thrown() -> None:
    trace = traced("exception_divzero")
    assert trace["error"]["type"] == "ZeroDivisionError"
    assert trace["error"]["line"] == 3
    last = final(trace)
    assert last["event"] == "exception"
    assert last["exception"]["type"] == "ZeroDivisionError"
    assert [f["func"] for f in last["stack"]] == ["<module>", "average"]  # where it blew up
    assert "never printed" not in last["stdout"]


def test_syntax_error_yields_trace_error() -> None:
    trace = trace_script("def f(:\n    pass\n")
    assert trace["error"]["type"] == "SyntaxError"
    assert trace["error"]["line"] == 1
    assert trace["steps"][-1]["event"] == "exception"


def test_infinite_loop_truncates_at_step_cap() -> None:
    trace = trace_script("i = 0\nwhile True:\n    i += 1\n", limits=RunLimits(max_steps=500))
    assert trace["truncated"] is True
    assert len(trace["steps"]) == 500


def test_infinite_loop_swallowing_exceptions_still_stops() -> None:
    src = "while True:\n    try:\n        pass\n    except BaseException:\n        pass\n"
    trace = trace_script(src, limits=RunLimits(max_steps=300))
    assert trace["truncated"] is True


def test_wall_clock_cap() -> None:
    src = "import time\nwhile True:\n    time.sleep(0.05)\n"
    trace = trace_script(src, limits=RunLimits(max_seconds=0.5))
    assert trace["truncated"] is True
    assert trace["error"]["type"] == "Timeout"


def test_recursion_depth_cap() -> None:
    src = "def f(n):\n    return f(n + 1)\n\nf(0)\n"
    trace = trace_script(src, limits=RunLimits(max_depth=50))
    assert trace["truncated"] is True
    assert trace["error"]["type"] == "RecursionLimit"
    assert max_depth(trace) <= 52


@pytest.mark.skipif(
    sys.platform == "darwin", reason="macOS does not enforce RLIMIT_AS (best effort)"
)
def test_memory_cap() -> None:
    src = "xs = []\nwhile True:\n    xs.append('x' * 10_000_000)\n"
    trace = trace_script(src, limits=RunLimits(max_memory_mb=64))
    assert trace.get("error", {}).get("type") in ("MemoryError", "MemoryLimit")


def test_user_cannot_corrupt_protocol_fd() -> None:
    src = "import os\nos.write(1, b'garbage{')\nprint('ok')\n"
    trace = trace_script(src)
    assert final(trace)["stdout"] == "ok\n"


def test_stdin_input() -> None:
    trace = trace_script("name = input()\nprint('hi', name)\n", stdin="ada\n")
    assert final(trace)["stdout"] == "hi ada\n"


def test_exotic_values_never_crash() -> None:
    src = (
        "import math\n"
        "class Weird:\n"
        "    def __repr__(self):\n"
        "        raise RuntimeError('no')\n"
        "big = 2 ** 100\n"
        "inf = math.inf\n"
        "g = (i for i in range(3))\n"
        "w = Weird()\n"
        "s = {3, 1, 2}\n"
        "t = (1, 'a')\n"
        "f = lambda x: x\n"
        "long = 'x' * 1000\n"
    )
    trace = trace_script(src)
    assert "error" not in trace
    last = final(trace)
    locs = last["stack"][-1]["locals"]
    assert locs["big"]["kind"] == "unserializable"
    assert locs["inf"]["repr"] == "inf"
    assert locs["g"]["kind"] == "unserializable"
    assert locs["w"]["kind"] == "ref"
    assert last["heap"][locs["s"]["id"]]["items"] == [
        {"kind": "int", "value": v} for v in (1, 2, 3)
    ]
    assert locs["f"]["kind"] == "unserializable"
    assert len(locs["long"]["value"]) == 201


def test_cycles_survive_bfs() -> None:
    src = (
        "class N:\n"
        "    def __init__(self):\n"
        "        self.prev = None\n"
        "        self.next = None\n"
        "a = N()\nb = N()\na.next = b\nb.prev = a\na.prev = a\n"
    )
    trace = trace_script(src)
    last = final(trace)
    assert len(last["heap"]) == 2


def test_gc_like_disappearance() -> None:
    src = "xs = [1, 2]\nxs = None\ny = 1\n"
    trace = trace_script(src)
    by_line = {s["line"]: s for s in trace["steps"]}
    assert len(by_line[2]["heap"]) == 1  # before `xs = None` runs
    assert len(by_line[3]["heap"]) == 0  # the list is no longer reachable
