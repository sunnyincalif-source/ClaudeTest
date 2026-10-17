"""LeetCode harness (Phase 5)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from leettrace.tracer.core import Limits, Tracer


def run_case(
    request: dict[str, Any], *, limits: Limits, on_abort: Callable[[Tracer], None]
) -> dict[str, Any]:
    raise NotImplementedError("LeetCode mode lands in Phase 5")
