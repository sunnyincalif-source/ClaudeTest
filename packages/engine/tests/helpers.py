"""Helpers for structural assertions over schema traces."""

from __future__ import annotations

from typing import Any

Trace = dict[str, Any]


def final(trace: Trace) -> dict[str, Any]:
    return trace["steps"][-1]


def frame_local(step: dict[str, Any], name: str, func: str | None = None) -> dict[str, Any]:
    for f in reversed(step["stack"]):
        if (func is None or f["func"] == func) and name in f["locals"]:
            return f["locals"][name]
    raise KeyError(name)


def walk_next(step: dict[str, Any], ref: dict[str, Any], field: str = "next") -> list[Any]:
    """Follow `field` pointers from a ref, returning the node vals."""
    out = []
    seen = set()
    while ref["kind"] == "ref":
        if ref["id"] in seen:
            raise AssertionError("cycle")
        seen.add(ref["id"])
        node = step["heap"][ref["id"]]
        out.append(node["fields"]["val"]["value"])
        ref = node["fields"][field]
    return out


def max_depth(trace: Trace) -> int:
    return max(len(s["stack"]) for s in trace["steps"])
