"""Narration must never contradict the visual (Phase 8 gate).

Each claim a note makes is checked mechanically against the snapshots the viz renders:
"x will be V" against the frame's next state, "Calling f(n=3)" against the new frame,
"→ True, so the block runs" against where execution actually goes next.
"""

from __future__ import annotations

import ast
import json
import re
from pathlib import Path
from typing import Any

import pytest

from leettrace.tracer.narrate import _after, _fmt

SNAP = Path(__file__).parent / "snapshots"
TRACES = {p.stem: json.loads(p.read_text()) for p in sorted(SNAP.glob("*.json"))}

WILL_BE = re.compile(r"^(?P<name>[A-Za-z_]\w*) will be (?P<val>.+)\.$")
WILL_POINT = re.compile(r"^(?P<name>[A-Za-z_]\w*(?:\.\w+)?) will point to (?P<what>.+)\.$")
CALLING = re.compile(r"^Calling (?P<func>\w+)\((?P<args>.*?)\)(?: \(recursion depth \d+\))?\.$")
CHECKING = re.compile(r"^Checking (?:if|elif) .* → (?P<cond>True|False), so ")
LOOP = re.compile(r"^Loop check: .* → (?P<cond>True|False), so ")
NEXT_ITER = re.compile(r"^Next loop iteration: (?P<name>\w+) will be (?P<val>.+)\.$")


def frame_by_id(step: dict[str, Any], fid: str) -> dict[str, Any] | None:
    return next((f for f in step["stack"] if f["id"] == fid), None)


def body_range(source: str, line: int) -> tuple[int, int] | None:
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.If | ast.While | ast.For) and node.lineno == line:
            return node.body[0].lineno, max(s.end_lineno or s.lineno for s in node.body)
    return None


@pytest.mark.parametrize("name", sorted(TRACES))
def test_notes_agree_with_the_next_state(name: str) -> None:
    trace = TRACES[name]
    steps = trace["steps"]
    checked = 0
    for i, step in enumerate(steps):
        note = step.get("note") or ""
        top = step["stack"][-1] if step["stack"] else None
        if top is None:
            continue
        j = _after(i, steps, top["id"]) if step["event"] == "line" else None
        after = frame_by_id(steps[j], top["id"]) if j is not None else None

        if (m := WILL_BE.match(note) or NEXT_ITER.match(note)) and after is not None:
            var = m.group("name")
            if var in after["locals"]:
                assert _fmt(after["locals"][var], steps[j]["heap"]) == m.group("val"), (i, note)
                checked += 1
        elif (m := WILL_POINT.match(note)) and after is not None and "." not in m.group("name"):
            v = after["locals"][m.group("name")]
            assert v["kind"] == "ref", (i, note)
            checked += 1
        elif (m := CALLING.match(note)) and step["event"] == "call":
            assert top["func"] == m.group("func")
            for part in filter(None, m.group("args").split(", ")):
                arg, _, shown = part.partition("=")
                if arg in top["locals"] and top["locals"][arg]["kind"] != "ref":
                    assert _fmt(top["locals"][arg], step["heap"]) == shown, (i, note)
            checked += 1
        elif (m := CHECKING.match(note) or LOOP.match(note)) and j is not None:
            rng = body_range(trace["source"], step["line"])
            assert rng is not None
            inside = rng[0] <= steps[j]["line"] <= rng[1]
            assert inside == (m.group("cond") == "True"), (i, note, steps[j]["line"])
            checked += 1
    if name not in ("exception_divzero",):
        assert checked > 0, "no verifiable notes"


def test_recursion_sentences() -> None:
    notes = [s["note"] for s in TRACES["factorial"]["steps"]]
    assert "Calling factorial(n=5)." in notes
    assert "Calling factorial(n=1) (recursion depth 5)." in notes
    assert "Base case: n <= 1 is True — returning 1 back to factorial()." in notes
    assert "factorial() returns 120 back to the program." in notes
    assert notes[-1] == "Program finished."


def test_loop_sentences() -> None:
    notes = [s["note"] for s in TRACES["bubble_sort"]["steps"]]
    assert "Next loop iteration: i will be 0." in notes
    assert "Checking if nums[j] > nums[j + 1] (5 > 1) → True, so the if block runs." in notes
    assert "Swap: nums[j] (5) and nums[j + 1] (1) trade places." in notes
    assert "The loop over range(n - i - 1) is finished." in notes
    rev = [s["note"] for s in TRACES["linked_list_reverse"]["steps"]]
    assert "Loop check: cur → False, so the loop ends." in rev
    assert "cur.next will be None." in rev
