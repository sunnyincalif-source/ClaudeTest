"""Tier-1 rule-based narration (SPEC §7): one plain-English note per step.

Two halves:
- ``attach()`` installs a hook the tracer calls at each event. It evaluates *pure*
  expressions (if/while conditions) against the live frame with a tiny whitelisted
  evaluator — never ``eval`` on arbitrary code, never a user-defined method call.
- ``finalize()`` writes ``Step.note`` for every step from the AST node on the step's line,
  the event, and a look-ahead to the state right after the statement completes. Notes are
  derived from the same snapshots the viz renders, so they cannot contradict it.
"""

from __future__ import annotations

import ast
import contextlib
import operator
import types
from collections.abc import Callable
from typing import Any

from leettrace.tracer.core import JSON, Tracer

# ------------------------------------------------------------------ safe evaluation


class _Unsafe(Exception):
    pass


_SAFE_TYPES = (int, float, str, bool, type(None), list, tuple, dict, set, frozenset)
_CMP: dict[type[ast.cmpop], Callable[[Any, Any], Any]] = {
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.Is: operator.is_,
    ast.IsNot: operator.is_not,
    ast.In: lambda a, b: a in b,
    ast.NotIn: lambda a, b: a not in b,
}
_BIN: dict[type[ast.operator], Callable[[Any, Any], Any]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Div: operator.truediv,
}
_SAFE_CALLS: dict[str, Callable[[Any], Any]] = {"len": len, "abs": abs}


def _lookup(name: str, frame: types.FrameType) -> Any:
    if name in frame.f_locals:
        return frame.f_locals[name]
    if name in frame.f_globals:
        return frame.f_globals[name]
    raise _Unsafe(name)


def safe_eval(node: ast.AST, frame: types.FrameType) -> Any:
    """Evaluate a side-effect-free expression, or raise _Unsafe."""
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        return _lookup(node.id, frame)
    if isinstance(node, ast.Attribute):
        base = safe_eval(node.value, frame)
        try:
            attrs = vars(base)
        except TypeError as e:
            raise _Unsafe("attr") from e
        if node.attr not in attrs:  # plain instance attribute only — no properties
            raise _Unsafe("attr")
        return attrs[node.attr]
    if isinstance(node, ast.Subscript):
        base = safe_eval(node.value, frame)
        if not isinstance(base, list | tuple | dict | str):
            raise _Unsafe("subscript")
        index = safe_eval(node.slice, frame)
        if not isinstance(index, int | str):
            raise _Unsafe("index")
        return base[index]  # type: ignore[index]
    if isinstance(node, ast.UnaryOp):
        v = safe_eval(node.operand, frame)
        if isinstance(node.op, ast.Not):
            return not _truthy(v)
        if isinstance(node.op, ast.USub) and isinstance(v, int | float):
            return -v
        raise _Unsafe("unary")
    if isinstance(node, ast.BoolOp):
        if isinstance(node.op, ast.And):
            result: Any = True
            for v in node.values:
                result = safe_eval(v, frame)
                if not _truthy(result):
                    return result
            return result
        for v in node.values:
            result = safe_eval(v, frame)
            if _truthy(result):
                return result
        return result
    if isinstance(node, ast.Compare):
        left = safe_eval(node.left, frame)
        for op, comp in zip(node.ops, node.comparators, strict=True):
            right = safe_eval(comp, frame)
            fn = _CMP.get(type(op))
            if fn is None:
                raise _Unsafe("cmp")
            if type(op) not in (ast.Is, ast.IsNot):
                _require_builtin(left, right)
            if not fn(left, right):
                return False
            left = right
        return True
    if isinstance(node, ast.BinOp):
        a, b = safe_eval(node.left, frame), safe_eval(node.right, frame)
        bin_fn = _BIN.get(type(node.op))
        if bin_fn is None or not (isinstance(a, int | float) and isinstance(b, int | float)):
            raise _Unsafe("binop")
        return bin_fn(a, b)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and not node.keywords:
        call_fn = _SAFE_CALLS.get(node.func.id)
        if call_fn is None or _lookup(node.func.id, frame) is not call_fn or len(node.args) != 1:
            raise _Unsafe("call")
        arg = safe_eval(node.args[0], frame)
        _require_builtin(arg)
        return call_fn(arg)
    raise _Unsafe(type(node).__name__)


def _require_builtin(*vals: Any) -> None:
    for v in vals:
        if not isinstance(v, _SAFE_TYPES):
            raise _Unsafe("type")


def _is_plain(v: Any) -> bool:
    return v is None or isinstance(v, int | float | str | bool)


def _short(v: Any) -> str:
    r = repr(v)
    return r if len(r) <= 24 else r[:23] + "…"


_CMP_SYM = {
    ast.Eq: "==",
    ast.NotEq: "!=",
    ast.Lt: "<",
    ast.LtE: "<=",
    ast.Gt: ">",
    ast.GtE: ">=",
    ast.Is: "is",
    ast.IsNot: "is not",
    ast.In: "in",
    ast.NotIn: "not in",
}


def _truthy(v: Any) -> bool:
    if v is None or isinstance(v, _SAFE_TYPES):
        return bool(v)
    # A user instance is truthy unless it defines __bool__/__len__ (which we won't call).
    t = type(v)
    if hasattr(t, "__bool__") or hasattr(t, "__len__"):
        raise _Unsafe("truth")
    return True


# ------------------------------------------------------------------ source index


class _Index:
    def __init__(self, source: str) -> None:
        self.stmt_at: dict[int, ast.stmt] = {}
        self.parent: dict[int, ast.AST] = {}
        self.func_at: dict[int, ast.FunctionDef | ast.AsyncFunctionDef] = {}
        try:
            tree = ast.parse(source)
        except SyntaxError:
            return
        for node in ast.walk(tree):
            for child in ast.iter_child_nodes(node):
                self.parent[id(child)] = node
            if isinstance(node, ast.stmt):
                self.stmt_at.setdefault(node.lineno, node)
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                self.func_at[node.lineno] = node
                for dec in node.decorator_list:
                    self.func_at[dec.lineno] = node

    def enclosing_if(self, node: ast.stmt) -> ast.If | None:
        """The `if` whose *body* directly contains node (an early-return base case)."""
        p = self.parent.get(id(node))
        if isinstance(p, ast.If) and node in p.body:
            return p
        return None

    def is_elif(self, node: ast.If) -> bool:
        p = self.parent.get(id(node))
        return isinstance(p, ast.If) and len(p.orelse) == 1 and p.orelse[0] is node


def _calls_itself(fn: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    for n in ast.walk(fn):
        if isinstance(n, ast.Call):
            f = n.func
            if isinstance(f, ast.Name) and f.id == fn.name:
                return True
            if isinstance(f, ast.Attribute) and f.attr == fn.name:
                return True
    return False


def _src(node: ast.AST, limit: int = 60) -> str:
    try:
        s = ast.unparse(node)
    except Exception:
        return "…"
    s = " ".join(s.split())
    return s if len(s) <= limit else s[: limit - 1] + "…"


# ------------------------------------------------------------------ attach / finalize


def attach(tracer: Tracer) -> None:
    index = _Index(tracer.source)
    tracer.narration_index = index  # type: ignore[attr-defined]

    def hook(frame: types.FrameType, event: str) -> JSON:
        facts: JSON = {}
        line = frame.f_lineno or 0
        stmt = index.stmt_at.get(line)
        if event == "call":
            code = frame.f_code
            n = code.co_argcount + code.co_kwonlyargcount
            facts["args"] = list(code.co_varnames[:n])
            fn = index.func_at.get(code.co_firstlineno)
            facts["recursive"] = bool(fn and _calls_itself(fn))
        elif event == "line" and isinstance(stmt, ast.If | ast.While):
            with contextlib.suppress(Exception):
                facts["cond"] = _truthy(safe_eval(stmt.test, frame))
            test = stmt.test
            if isinstance(test, ast.Compare) and len(test.ops) == 1:
                sym = _CMP_SYM.get(type(test.ops[0]))
                try:
                    left = safe_eval(test.left, frame)
                    right = safe_eval(test.comparators[0], frame)
                    is_check = isinstance(test.ops[0], ast.Is | ast.IsNot)
                    if sym and not is_check and _is_plain(left) and _is_plain(right):
                        facts["detail"] = f"{_short(left)} {sym} {_short(right)}"
                except Exception:
                    pass
        elif event == "line" and isinstance(stmt, ast.Assign):
            target = stmt.targets[0]
            if isinstance(target, ast.Tuple):
                try:
                    vals = [safe_eval(e, frame) for e in target.elts]
                    if all(_is_plain(v) for v in vals):
                        facts["before"] = [_short(v) for v in vals]
                except Exception:
                    pass
        elif event == "return" and isinstance(stmt, ast.Return):
            enclosing = index.enclosing_if(stmt)
            if enclosing is not None:
                try:
                    facts["base_cond"] = _src(enclosing.test)
                    facts["base_val"] = _truthy(safe_eval(enclosing.test, frame))
                except Exception:
                    facts.pop("base_val", None)
            fn = index.func_at.get(frame.f_code.co_firstlineno)
            facts["recursive"] = bool(fn and _calls_itself(fn))
        return facts

    tracer.fact_hook = hook  # type: ignore[attr-defined]


def finalize(tracer: Tracer) -> None:
    index: _Index = getattr(tracer, "narration_index", None) or _Index(tracer.source)
    steps = tracer.steps
    facts = tracer.facts
    for i, step in enumerate(steps):
        if "note" in step:
            continue
        try:
            note = _note(i, steps, facts[i] if i < len(facts) else {}, index)
        except Exception:
            note = None
        if note:
            steps[i] = {**step, "note": note}


# ------------------------------------------------------------------ rendering values


def _fmt(v: JSON, heap: JSON, depth: int = 0) -> str:
    kind = v.get("kind")
    if kind in ("int", "float"):
        return repr(v["value"]) if kind == "float" else str(v["value"])
    if kind == "bool":
        return "True" if v["value"] else "False"
    if kind == "str":
        return repr(v["value"])
    if kind == "none":
        return "None"
    if kind == "unserializable":
        return str(v["repr"])
    if kind == "ref":
        return _describe(heap.get(v["id"]), heap, depth)
    return "?"


def _describe(obj: JSON | None, heap: JSON, depth: int = 0) -> str:
    if obj is None:
        return "an object"
    t = obj["type"]
    if t == "instance":
        val = obj["fields"].get("val")
        if val is not None and val.get("kind") in ("int", "float", "str", "bool"):
            return f"the {obj['className']}({_fmt(val, heap)})"
        return f"a {obj['className']}"
    if t in ("list", "tuple", "set"):
        items = obj["items"]
        simple = all(it.get("kind") != "ref" for it in items)
        if simple and len(items) <= 8 and depth == 0:
            inner = ", ".join(_fmt(it, heap, depth + 1) for it in items)
            return {"list": f"[{inner}]", "tuple": f"({inner})", "set": f"{{{inner}}}"}[t]
        noun = {"list": "list", "tuple": "tuple", "set": "set"}[t]
        return f"a {noun} of {len(items)} item{'s' if len(items) != 1 else ''}"
    if t == "dict":
        n = len(obj["entries"])
        if n == 0:
            return "an empty dict"
        return f"a dict with {n} key{'s' if n != 1 else ''}"
    return "an object"


def _top(step: JSON) -> JSON | None:
    stack = step["stack"]
    return stack[-1] if stack else None


def _frame_in(step: JSON, fid: str) -> JSON | None:
    for f in step["stack"]:
        if f["id"] == fid:
            found: JSON = f
            return found
    return None


def _after(i: int, steps: list[JSON], fid: str) -> int | None:
    """Index of the step where the statement at step i has completed in the same frame."""
    for j in range(i + 1, len(steps)):
        top = _top(steps[j])
        if top is None:
            return None
        if top["id"] == fid and steps[j]["event"] in ("line", "return", "exception"):
            return j
        if _frame_in(steps[j], fid) is None:
            return None
    return None


def _func_label(frame: JSON) -> str:
    return "the program" if frame["func"] == "<module>" else f"{frame['func']}()"


# ------------------------------------------------------------------ the rules


def _note(i: int, steps: list[JSON], facts: JSON, index: _Index) -> str | None:
    step = steps[i]
    event = step["event"]
    top = _top(step)
    heap = step["heap"]

    if event == "exception":
        exc = step.get("exception") or {}
        etype, msg = exc.get("type", "Exception"), exc.get("message", "")
        if facts.get("uncaught"):
            return f"Uncaught {etype}: {msg}. The program stops here — this is where it blew up."
        if etype == "RecursionLimit":
            return str(msg)
        return f"{etype} raised: {msg}. Python unwinds until it finds a matching except."

    if top is None:
        return None

    if event == "call":
        args = facts.get("args") or []
        parts = [f"{a}={_fmt(top['locals'][a], heap)}" for a in args if a in top["locals"]]
        same = sum(1 for f in step["stack"] if f["func"] == top["func"])
        suffix = f" (recursion depth {same})" if same > 1 else ""
        return f"Calling {top['func']}({', '.join(parts)}){suffix}."

    if event == "return":
        rv = top.get("returnValue")
        if top["func"] == "<module>":
            if facts.get("unwinding"):
                return "The exception reached the top level of the program."
            return "Program finished."
        if rv is None:
            return f"{top['func']}() exits early — the exception propagates to the caller."
        caller = step["stack"][-2] if len(step["stack"]) > 1 else None
        back = f" back to {_func_label(caller)}" if caller else ""
        value = _fmt(rv, heap)
        if facts.get("base_val") is True and facts.get("recursive"):
            return f"Base case: {facts['base_cond']} is True — returning {value}{back}."
        return f"{top['func']}() returns {value}{back}."

    # event == "line"
    stmt = index.stmt_at.get(step["line"])
    if stmt is None:
        return None
    j = _after(i, steps, top["id"])
    after_step = steps[j] if j is not None else None
    after_frame = _frame_in(after_step, top["id"]) if after_step else None
    after_heap = after_step["heap"] if after_step else heap

    def after_value(name: str) -> str | None:
        if after_frame is None or name not in after_frame["locals"]:
            return None
        return _fmt(after_frame["locals"][name], after_heap)

    def points(name: str) -> str | None:
        if after_frame is None or name not in after_frame["locals"]:
            return None
        v = after_frame["locals"][name]
        if v["kind"] == "ref":
            return f"{name} will point to {_describe(after_heap.get(v['id']), after_heap)}."
        if v["kind"] == "none":
            return f"{name} will be None."
        return f"{name} will be {_fmt(v, after_heap)}."

    if isinstance(stmt, ast.If):
        cond = facts.get("cond")
        kw = "elif" if index.is_elif(stmt) else "if"
        test = _src(stmt.test)
        if "detail" in facts and facts["detail"] != test:
            test = f"{test} ({facts['detail']})"
        if cond is True:
            return f"Checking {kw} {test} → True, so the {kw} block runs."
        if cond is False:
            nxt = "the else branch runs" if stmt.orelse else f"we skip the {kw} block"
            return f"Checking {kw} {test} → False, so {nxt}."
        return f"Checking {kw} {test}."

    if isinstance(stmt, ast.While):
        test = _src(stmt.test)
        if "detail" in facts and facts["detail"] != test:
            test = f"{test} ({facts['detail']})"
        cond = facts.get("cond")
        if cond is True:
            return f"Loop check: {test} → True, so the loop body runs."
        if cond is False:
            return f"Loop check: {test} → False, so the loop ends."
        return f"Loop check: {test}."

    if isinstance(stmt, ast.For | ast.AsyncFor):
        body_start = stmt.body[0].lineno
        body_end = max(getattr(s, "end_lineno", s.lineno) or s.lineno for s in stmt.body)
        in_body = after_step is not None and body_start <= after_step["line"] <= body_end
        if in_body and isinstance(stmt.target, ast.Name):
            v = after_value(stmt.target.id)
            if v is not None:
                return f"Next loop iteration: {stmt.target.id} will be {v}."
        if in_body:
            return f"Next iteration of the loop over {_src(stmt.iter)}."
        return f"The loop over {_src(stmt.iter)} is finished."

    calls_between = j is not None and j > i + 1

    if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1:
        target = stmt.targets[0]
        if isinstance(target, ast.Name) and calls_between:
            return f"Evaluating {_src(stmt.value)} — the result will be stored in {target.id}."
        if isinstance(target, ast.Name):
            return points(target.id) or f"Assigning {_src(stmt.value)} to {target.id}."
        if isinstance(target, ast.Tuple) and isinstance(stmt.value, ast.Tuple):
            lhs = [_src(e) for e in target.elts]
            rhs = [_src(e) for e in stmt.value.elts]
            if len(lhs) == 2 and lhs == list(reversed(rhs)):
                before = facts.get("before")
                if before:
                    return f"Swap: {lhs[0]} ({before[0]}) and {lhs[1]} ({before[1]}) trade places."
                return f"Swap: {lhs[0]} and {lhs[1]} trade values."
            names = [e.id for e in target.elts if isinstance(e, ast.Name)]
            if len(names) == len(target.elts):
                vals = [
                    f"{n} will be {after_value(n)}" for n in names if after_value(n) is not None
                ]
                if vals:
                    return f"Unpacking: {', '.join(vals)}."
            return f"Assigning {', '.join(lhs)} at once."
        if isinstance(target, ast.Attribute) and isinstance(target.value, ast.Name):
            base = target.value.id
            if after_frame and base in after_frame["locals"]:
                bv = after_frame["locals"][base]
                obj = after_heap.get(bv["id"]) if bv["kind"] == "ref" else None
                if obj and obj["type"] == "instance" and target.attr in obj["fields"]:
                    fv = obj["fields"][target.attr]
                    attr_lhs = f"{base}.{target.attr}"
                    if fv["kind"] == "ref":
                        return (
                            f"{attr_lhs} will point to "
                            f"{_describe(after_heap.get(fv['id']), after_heap)}."
                        )
                    if fv["kind"] == "none":
                        return f"{attr_lhs} will be None."
                    return f"{attr_lhs} will be {_fmt(fv, after_heap)}."
            return f"Setting {_src(target)} to {_src(stmt.value)}."
        if isinstance(target, ast.Subscript):
            return f"Storing {_src(stmt.value)} into {_src(target)}."

    if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name) and stmt.value:
        return points(stmt.target.id) or f"Assigning {_src(stmt.value)} to {stmt.target.id}."

    if isinstance(stmt, ast.AugAssign):
        sym = _OPS.get(type(stmt.op), "?")
        if isinstance(stmt.target, ast.Name):
            v = after_value(stmt.target.id)
            tail = f" → {stmt.target.id} will be {v}" if v is not None else ""
            return f"{stmt.target.id} {sym}= {_src(stmt.value)}{tail}."
        return f"{_src(stmt.target)} {sym}= {_src(stmt.value)}."

    if isinstance(stmt, ast.Return):
        if stmt.value is None:
            return f"Returning from {top['func']}()."
        return f"About to return {_src(stmt.value)}."

    if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call):
        call = stmt.value
        if isinstance(call.func, ast.Name) and call.func.id == "print":
            if after_step is not None:
                delta = after_step["stdout"][len(step["stdout"]) :].rstrip("\n")
                if delta:
                    shown = delta if len(delta) <= 60 else delta[:59] + "…"
                    return f"Printing {shown!r}."
            return f"Printing {', '.join(_src(a, 40) for a in call.args) or 'a blank line'}."
        if isinstance(call.func, ast.Attribute) and isinstance(call.func.value, ast.Name):
            obj, meth = call.func.value.id, call.func.attr
            args = ", ".join(_src(a, 30) for a in call.args)
            verb = _METHOD_VERBS.get(meth)
            if verb:
                return verb.format(obj=obj, args=args) + "."
        return f"Calling {_src(call)}."

    if isinstance(stmt, ast.FunctionDef | ast.AsyncFunctionDef):
        return f"Defining function {stmt.name}()."
    if isinstance(stmt, ast.ClassDef):
        return f"Defining class {stmt.name}."
    if isinstance(stmt, ast.Import | ast.ImportFrom):
        return f"Importing: {_src(stmt)}."
    if isinstance(stmt, ast.Break):
        return "break — leaving the loop."
    if isinstance(stmt, ast.Continue):
        return "continue — skipping to the next iteration."
    if isinstance(stmt, ast.Pass):
        return "pass — nothing to do."
    if isinstance(stmt, ast.Raise):
        return f"Raising {_src(stmt.exc) if stmt.exc else 'the current exception'}."
    if isinstance(stmt, ast.Try):
        return "Entering a try block."
    return f"Running: {_src(stmt)}"


_OPS = {
    ast.Add: "+",
    ast.Sub: "-",
    ast.Mult: "*",
    ast.Div: "/",
    ast.FloorDiv: "//",
    ast.Mod: "%",
    ast.Pow: "**",
    ast.BitOr: "|",
    ast.BitAnd: "&",
    ast.BitXor: "^",
    ast.LShift: "<<",
    ast.RShift: ">>",
}

_METHOD_VERBS = {
    "append": "Appending {args} to {obj}",
    "appendleft": "Pushing {args} onto the front of {obj}",
    "pop": "Popping from {obj}",
    "popleft": "Popping from the front of {obj}",
    "add": "Adding {args} to {obj}",
    "extend": "Extending {obj} with {args}",
    "insert": "Inserting into {obj}",
    "remove": "Removing {args} from {obj}",
    "sort": "Sorting {obj} in place",
    "reverse": "Reversing {obj} in place",
}
