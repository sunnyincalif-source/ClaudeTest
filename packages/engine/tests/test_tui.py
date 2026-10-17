"""TUI: stepping through a recursion in the terminal (Phase 7 gate), driven headlessly."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from leettrace.tui import TraceTUI

SNAP = Path(__file__).parent / "snapshots"


def test_tui_steps_through_recursion() -> None:
    trace = json.loads((SNAP / "factorial.json").read_text(encoding="utf-8"))

    async def scenario() -> None:
        app = TraceTUI(trace, title="factorial.py")
        async with app.run_test(size=(120, 40)) as pilot:
            assert app.index == 0
            for _ in range(16):
                await pilot.press("right")
            assert app.index == 16
            step = trace["steps"][16]
            stack_text = app.rendered["stack"]
            assert stack_text.count("factorial()") == len(step["stack"]) - 1
            assert "n = 1" in stack_text
            note = app.rendered["note"]
            assert step["note"] in note
            await pilot.press("left")
            assert app.index == 15
            await pilot.press("end")
            assert app.index == len(trace["steps"]) - 1
            assert "120" in app.rendered["out"]
            await pilot.press("home")
            assert app.index == 0
            await pilot.press("q")

    asyncio.run(scenario())


def test_tui_shows_error_trace() -> None:
    trace = {
        "language": "python",
        "source": "x",
        "steps": [],
        "engineVersion": "0.1.0",
        "error": {"type": "Timeout", "message": "killed"},
    }

    async def scenario() -> None:
        app = TraceTUI(trace)
        async with app.run_test() as pilot:
            assert "Timeout" in app.rendered["note"]
            await pilot.press("q")

    asyncio.run(scenario())
