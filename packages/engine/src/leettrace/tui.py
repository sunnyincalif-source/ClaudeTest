"""Terminal TUI (SPEC §5.1, Phase 7): `leettrace run file.py --tui`.

Renders the same Trace the web UI and extension render — current line, call stack with
locals, a compact heap, narration — with ←/→ stepping. Reads only the Trace Schema; no
tracing logic lives here.
"""

from __future__ import annotations

import io
from typing import Any, ClassVar

from rich.console import Console, RenderableType
from rich.markup import escape
from rich.table import Table
from rich.text import Text
from textual.app import App, ComposeResult
from textual.binding import Binding, BindingType
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.reactive import reactive
from textual.widgets import Footer, Header, Static

JSON = dict[str, Any]


def fmt_value(v: JSON, heap: JSON) -> str:
    kind = v.get("kind")
    if kind in ("int", "float"):
        return str(v["value"])
    if kind == "bool":
        return "True" if v["value"] else "False"
    if kind == "str":
        return repr(v["value"])
    if kind == "none":
        return "None"
    if kind == "unserializable":
        return str(v["repr"])
    if kind == "ref":
        return f"→{v['id']} {short_label(heap.get(v['id']))}"
    return "?"


def short_label(obj: JSON | None) -> str:
    if obj is None:
        return "…"
    t = obj["type"]
    if t == "instance":
        val = obj["fields"].get("val")
        if val is not None and val.get("kind") not in ("ref", None):
            return f"{obj['className']}({fmt_value(val, {})})"
        return str(obj["className"])
    if t == "dict":
        return f"dict[{len(obj['entries'])}]"
    return f"{t}[{len(obj['items'])}]"


def heap_line(obj: JSON, heap: JSON) -> str:
    t = obj["type"]
    if t == "instance":
        fields = ", ".join(f"{k}: {fmt_inline(v)}" for k, v in obj["fields"].items())
        return f"{obj['id']}  {obj['className']} {{{fields}}}"
    if t == "dict":
        entries = ", ".join(
            f"{fmt_inline(e['key'])}: {fmt_inline(e['value'])}" for e in obj["entries"]
        )
        return f"{obj['id']}  {{{entries}}}"
    open_, close = {"list": ("[", "]"), "tuple": ("(", ")"), "set": ("{", "}")}[t]
    return f"{obj['id']}  {open_}{', '.join(fmt_inline(v) for v in obj['items'])}{close}"


def fmt_inline(v: JSON) -> str:
    return f"→{v['id']}" if v.get("kind") == "ref" else fmt_value(v, {})


class TraceTUI(App[None]):
    CSS = """
    #body { height: 1fr; }
    #source { width: 46%; border: round $primary; padding: 0 1; }
    #right { width: 1fr; }
    #stack { height: 1fr; border: round $secondary; padding: 0 1; }
    #heap { height: 1fr; border: round $secondary; padding: 0 1; }
    #note { height: auto; min-height: 3; border: round $accent; padding: 0 1; }
    #out { height: auto; max-height: 6; border: round $panel; padding: 0 1; }
    """
    BINDINGS: ClassVar[list[BindingType]] = [
        Binding("right,l", "step(1)", "Next"),
        Binding("left,h", "step(-1)", "Back"),
        Binding("home", "jump(0)", "First"),
        Binding("end", "jump(-1)", "Last"),
        Binding("space", "toggle_play", "Play/pause"),
        Binding("q,escape", "quit", "Quit"),
    ]

    index: reactive[int] = reactive(0)
    playing: reactive[bool] = reactive(False)

    def __init__(self, trace: JSON, title: str = "") -> None:
        super().__init__()
        self.trace = trace
        self.steps: list[JSON] = trace["steps"]
        self.lines = trace["source"].splitlines()
        self.sub_title = title
        self.title = "LeetTrace"
        self._panes_ready = False
        self.rendered: dict[str, str] = {}  # plain-text copy of each pane (tests, a11y)

    def compose(self) -> ComposeResult:
        yield Header()
        yield Static(id="note")
        with Horizontal(id="body"):
            yield VerticalScroll(Static(id="source-text"), id="source")
            with Vertical(id="right"):
                yield VerticalScroll(Static(id="stack-text"), id="stack")
                yield VerticalScroll(Static(id="heap-text"), id="heap")
        yield Static(id="out")
        yield Footer()

    def on_mount(self) -> None:
        self.query_one("#source").border_title = "Source"
        self.query_one("#stack").border_title = "Call stack"
        self.query_one("#heap").border_title = "Heap"
        self.query_one("#out").border_title = "Output"
        self.set_interval(0.5, self._tick)
        self._panes_ready = True
        self.render_step()

    def _tick(self) -> None:
        if self.playing:
            if self.index >= len(self.steps) - 1:
                self.playing = False
            else:
                self.index += 1

    def action_step(self, delta: int) -> None:
        if self.steps:
            self.index = max(0, min(len(self.steps) - 1, self.index + delta))

    def action_jump(self, to: int) -> None:
        if self.steps:
            self.index = len(self.steps) - 1 if to < 0 else to

    def action_toggle_play(self) -> None:
        self.playing = not self.playing

    def watch_index(self, _old: int, _new: int) -> None:
        if self._panes_ready:
            self.render_step()

    def render_step(self) -> None:
        note = self.query_one("#note", Static)
        if not self.steps:
            err = self.trace.get("error") or {}
            msg = f"[red]{escape(err.get('type', 'Error'))}[/]: {escape(err.get('message', ''))}"
            note.update(msg)
            self.rendered["note"] = plain(Text.from_markup(msg))
            return
        step = self.steps[self.index]
        heap = step["heap"]
        status = f"step {self.index + 1}/{len(self.steps)} · line {step['line']} · {step['event']}"
        test = self.trace.get("test")
        verdict = ""
        if test:
            verdict = {True: " · [green]PASS[/]", False: " · [red]FAIL[/]"}.get(
                test.get("passed"), ""
            )
        note_markup = f"[dim]{status}[/]{verdict}\n{escape(step.get('note') or '')}"
        note.update(note_markup)
        self.rendered["note"] = plain(Text.from_markup(note_markup))
        note.border_title = "Why"

        src = Text()
        for n, line in enumerate(self.lines, start=1):
            current = n == step["line"]
            src.append(f"{n:>3} ", style="dim")
            src.append("➜ " if current else "  ", style="bold yellow")
            src.append(line + "\n", style="reverse" if current else "")
        self.query_one("#source-text", Static).update(src)

        frames = Table.grid(padding=(0, 1))
        frames.add_column()
        for i, f in enumerate(reversed(step["stack"])):
            name = "Global frame" if f["func"] == "<module>" else f"{f['func']}()"
            frames.add_row(
                Text(
                    name + ("  (active)" if i == 0 else ""), style="bold cyan" if i == 0 else "bold"
                )
            )
            for var in f["order"]:
                frames.add_row(Text(f"  {var} = {fmt_value(f['locals'][var], heap)}"))
            if "returnValue" in f:
                frames.add_row(
                    Text(f"  return {fmt_value(f['returnValue'], heap)}", style="magenta")
                )
        self.query_one("#stack-text", Static).update(frames)
        self.rendered["stack"] = plain(frames)

        heap_text = Text()
        for obj in heap.values():
            heap_text.append(heap_line(obj, heap) + "\n")
        if not heap:
            heap_text.append("(empty)", style="dim")
        self.query_one("#heap-text", Static).update(heap_text)

        out = step["stdout"] or ""
        if step.get("exception"):
            exc = step["exception"]
            out += f"\n{exc['type']}: {exc['message']}"
        out_text = out.rstrip("\n")[-600:] or "(no output yet)"
        self.query_one("#out", Static).update(Text(out_text))
        self.rendered["out"] = out_text


def plain(renderable: RenderableType) -> str:
    console = Console(width=100, record=True, file=io.StringIO(), color_system=None)
    console.print(renderable)
    return console.export_text()


def run_tui(trace: JSON, *, title: str = "") -> None:
    TraceTUI(trace, title=title).run()
