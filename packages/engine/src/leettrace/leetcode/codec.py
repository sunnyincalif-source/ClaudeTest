"""LeetCode input/output codec (SPEC §4.5). Stdlib only: runs inside the sandbox child.

- ``parse_case``: "nums = [2,7,11,15], target = 9" (example format) or one value per line
  (the testcase panel format) → [(name | None, python value)].
- ``build_linked_list`` / ``build_tree``: LeetCode encodings like [1,2,3,null,4] → nodes.
- ``to_leetcode``: a returned value → LeetCode's canonical text ("[0,1]", "true", "null").
- ``outputs_equal``: structural comparison of actual vs expected text (float tolerance).
"""

from __future__ import annotations

import ast
import json
import math
import re
from collections import deque
from typing import Any

_NAMED = re.compile(r"^\s*([A-Za-z_]\w*)\s*=\s*(.*?)\s*$", re.DOTALL)
_MAX_NODES = 100_000


class CaseParseError(ValueError):
    pass


def split_top_level(text: str, sep: str = ",") -> list[str]:
    """Split on `sep` outside brackets and string quotes."""
    parts: list[str] = []
    depth = 0
    quote: str | None = None
    escaped = False
    buf: list[str] = []
    for ch in text:
        if quote:
            buf.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                quote = None
            continue
        if ch in "\"'":
            quote = ch
        elif ch in "[{(":
            depth += 1
        elif ch in "]})":
            depth -= 1
        elif ch == sep and depth == 0:
            parts.append("".join(buf))
            buf = []
            continue
        buf.append(ch)
    if "".join(buf).strip():
        parts.append("".join(buf))
    return parts


def parse_literal(text: str) -> Any:
    text = text.strip()
    if not text:
        raise CaseParseError("empty value")
    try:
        return json.loads(text)
    except ValueError:
        pass
    try:
        pythonish = re.sub(r"\btrue\b", "True", text)
        pythonish = re.sub(r"\bfalse\b", "False", pythonish)
        pythonish = re.sub(r"\bnull\b", "None", pythonish)
        return ast.literal_eval(pythonish)
    except (ValueError, SyntaxError) as e:
        raise CaseParseError(f"can't read value {text[:60]!r}") from e


def parse_case(text: str) -> list[tuple[str | None, Any]]:
    """Parse one test case into (name, value) pairs; name is None for positional input."""
    text = text.strip()
    if not text:
        return []
    parts = split_top_level(text.replace("\n", ","))
    named = [_NAMED.match(p) for p in parts]
    if parts and all(m is not None for m in named):
        return [(m.group(1), parse_literal(m.group(2))) for m in named if m is not None]
    lines = [ln for ln in text.splitlines() if ln.strip()]
    return [(None, parse_literal(ln)) for ln in lines]


# ------------------------------------------------------------------ structures


def build_linked_list(values: Any, node_cls: type) -> Any:
    if values is None:
        return None
    if not isinstance(values, list):
        raise CaseParseError("a linked list must be written as an array, e.g. [1,2,3]")
    dummy = node_cls(0)
    tail = dummy
    for v in values:
        tail.next = node_cls(v)
        tail = tail.next
    return dummy.next


def build_tree(values: Any, node_cls: type) -> Any:
    """LeetCode level-order encoding: [3,9,20,null,null,15,7]."""
    if values is None:
        return None
    if not isinstance(values, list):
        raise CaseParseError("a tree must be written in level order, e.g. [1,2,3,null,4]")
    if not values or values[0] is None:
        return None
    it = iter(values)
    root = node_cls(next(it))
    queue: deque[Any] = deque([root])
    while queue:
        node = queue.popleft()
        try:
            left = next(it)
        except StopIteration:
            break
        if left is not None:
            node.left = node_cls(left)
            queue.append(node.left)
        try:
            right = next(it)
        except StopIteration:
            break
        if right is not None:
            node.right = node_cls(right)
            queue.append(node.right)
    return root


def _is_list_node(x: Any) -> bool:
    return type(x).__name__ == "ListNode" and hasattr(x, "val") and hasattr(x, "next")


def _is_tree_node(x: Any) -> bool:
    return (
        type(x).__name__ == "TreeNode"
        and hasattr(x, "val")
        and hasattr(x, "left")
        and hasattr(x, "right")
    )


def to_jsonable(x: Any) -> Any:
    if x is None or isinstance(x, bool | int | str):
        return x
    if isinstance(x, float):
        return x if math.isfinite(x) else str(x)
    if _is_list_node(x):
        out: list[Any] = []
        seen: set[int] = set()
        while x is not None and len(out) < _MAX_NODES:
            if id(x) in seen:
                out.append("…cycle")
                break
            seen.add(id(x))
            out.append(to_jsonable(x.val))
            x = x.next
        return out
    if _is_tree_node(x):
        level: list[Any] = []
        queue: deque[Any] = deque([x])
        while queue and len(level) < _MAX_NODES:
            node = queue.popleft()
            if node is None:
                level.append(None)
                continue
            level.append(to_jsonable(node.val))
            queue.append(node.left)
            queue.append(node.right)
        while level and level[-1] is None:
            level.pop()
        return level
    if isinstance(x, list | tuple | deque):
        return [to_jsonable(v) for v in x]
    if isinstance(x, set | frozenset):
        items = [to_jsonable(v) for v in x]
        try:
            return sorted(items)
        except TypeError:
            return items
    if isinstance(x, dict):
        return {str(k): to_jsonable(v) for k, v in x.items()}
    return repr(x)


def to_leetcode(x: Any) -> str:
    return json.dumps(to_jsonable(x), separators=(",", ":"), ensure_ascii=False)


def _equal(a: Any, b: Any) -> bool:
    if isinstance(a, bool) or isinstance(b, bool):
        return a is b if isinstance(a, bool) and isinstance(b, bool) else False
    if isinstance(a, int | float) and isinstance(b, int | float):
        return math.isclose(a, b, rel_tol=1e-5, abs_tol=1e-5)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_equal(x, y) for x, y in zip(a, b, strict=True))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(_equal(a[k], b[k]) for k in a)
    return bool(a == b)


def outputs_equal(actual: Any, expected_text: str) -> bool:
    try:
        expected = parse_literal(expected_text)
    except CaseParseError:
        return to_leetcode(actual) == expected_text.strip()
    return _equal(to_jsonable(actual), to_jsonable(expected))


def annotation_text(annotation: Any) -> str:
    if isinstance(annotation, str):
        return annotation
    name = getattr(annotation, "__name__", None)
    text = repr(annotation)
    return text if "[" in text or name is None else str(name)


_LIST_OF = re.compile(r"^(typing\.)?(List|list)\[")


def convert_arg(value: Any, annotation: Any, ns: dict[str, Any]) -> Any:
    """Turn a parsed literal into the argument type the signature asks for."""
    text = annotation_text(annotation)
    list_of = bool(_LIST_OF.match(text))
    if "TreeNode" in text and "TreeNode" in ns:
        if list_of and isinstance(value, list):
            return [build_tree(v, ns["TreeNode"]) for v in value]
        return build_tree(value, ns["TreeNode"])
    if "ListNode" in text and "ListNode" in ns:
        if list_of and isinstance(value, list) and all(isinstance(v, list) for v in value):
            return [build_linked_list(v, ns["ListNode"]) for v in value]
        return build_linked_list(value, ns["ListNode"])
    return value
