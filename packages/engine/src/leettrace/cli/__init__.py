"""The `leettrace` command-line interface (SPEC §5.1)."""

from __future__ import annotations

import contextlib
import json
import sys
import time
import webbrowser
from pathlib import Path
from typing import Annotated, Any

import typer
from rich.console import Console
from rich.markup import escape

from leettrace import __version__
from leettrace.client import (
    DaemonUnavailable,
    check_version,
    ensure_daemon,
    find_daemon,
    get,
    post,
)

app = typer.Typer(
    name="leettrace",
    help="See how your solution actually executes: stack, heap, pointers, and a reason per step.",
    add_completion=False,
    pretty_exceptions_enable=False,
)
console = Console(highlight=False, soft_wrap=True)
err = Console(stderr=True, highlight=False)


def _version_callback(value: bool) -> None:
    if value:
        console.print(f"leettrace {__version__}")
        raise typer.Exit()


@app.callback(invoke_without_command=True)
def _root(
    ctx: typer.Context,
    version: Annotated[
        bool, typer.Option("--version", callback=_version_callback, is_eager=True)
    ] = False,
) -> None:
    """LeetTrace — a local trace engine for your LeetCode practice.

    Run with no command (or double-click the app) to start the engine and open the welcome
    page with your pairing code.
    """
    if ctx.invoked_subcommand is None:
        launch()


# ------------------------------------------------------------------ daemon lifecycle


@app.command()
def start(
    port: Annotated[int | None, typer.Option(help="Port to bind on 127.0.0.1.")] = None,
    background: Annotated[bool, typer.Option(hidden=True)] = False,
    dev: Annotated[bool, typer.Option(help="Also allow the Vite dev server origin.")] = False,
    no_open: Annotated[bool, typer.Option("--no-open", help="Don't open the web UI.")] = False,
) -> None:
    """Start the local engine (loopback only) and keep it running."""
    running = find_daemon()
    if running is not None:
        console.print(f"[green]●[/] LeetTrace engine already running at {running.base_url}")
        console.print(f"  Welcome page (pairing code, status): {running.welcome_url()}")
        if not no_open and not background:
            webbrowser.open(running.welcome_url())
        return

    from leettrace.server.daemon import serve
    from leettrace.server.session import Session

    def ready(session: Session, code: str) -> None:
        if background:
            print(f"leettrace engine {__version__} on {session.base_url}", flush=True)
            return
        from leettrace.tracer.runner import memory_cap_status

        _welcome_once()
        console.print(f"[bold green]●[/] LeetTrace engine {__version__} running")
        console.print(f"  Listening on {session.base_url} [dim](loopback only)[/]")
        console.print(f"  Welcome:     {session.welcome_url()}")
        console.print(f"  Pairing code for the extension: [bold reverse] {code[:3]}-{code[3:]} [/]")
        console.print("  Extension:   open a LeetCode problem and click [bold]Trace[/]")
        cap = memory_cap_status()
        if cap["memory"] != "enforced":
            console.print(f"[yellow]  Memory cap: {cap['memory']} — {cap['mechanism']}[/]")
        console.print(
            "[dim]  Your code runs locally, in a sandboxed subprocess. "
            "Close this window or press Ctrl+C to stop.[/]"
        )
        if not no_open:
            webbrowser.open(session.welcome_url())

    def pair_code(client: str, code: str) -> None:
        pretty = f"{code[:3]}-{code[3:]}"
        if background:
            print(f"pairing request from {client}: code {pretty}", flush=True)
            return
        console.print(
            f"\n[bold yellow]Pairing[/] ({escape(client)}): enter this code in the "
            f"extension — [bold reverse] {pretty} [/] (also shown on the welcome page)\n"
        )

    try:
        serve(port=port, on_ready=ready, on_pair_code=pair_code, dev=dev)
    except RuntimeError as e:
        err.print(f"[red]Could not start:[/] {e}")
        raise typer.Exit(1) from e


def _welcome_once() -> None:
    from leettrace.server.session import home

    marker = home() / ".welcomed"
    if marker.exists():
        return
    console.print(
        "\n[bold]Welcome to LeetTrace![/] Three ways to use it:\n"
        "  1. [bold]Browser[/]: install the extension, open a LeetCode problem, click "
        "[bold]Trace[/] beside Run.\n"
        "     The first time, the panel asks for a pairing code — it appears right here.\n"
        "  2. [bold]Terminal[/]: [cyan]leettrace run solution.py[/] · "
        "[cyan]leettrace watch solution.py[/] (re-traces on save)\n"
        '     LeetCode-style: [cyan]leettrace leetcode sol.py -c "nums = [2,7], target = 9"[/]\n'
        "  3. [bold]Try it now[/]: [cyan]leettrace demo[/]\n"
    )
    try:
        marker.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        marker.touch()
    except OSError:
        pass


DEMO_FILES = {
    "reverse_list.py": """class Solution:
    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        prev = None
        cur = head
        while cur:
            nxt = cur.next
            cur.next = prev
            prev = cur
            cur = nxt
        return prev
""",
    "factorial.py": """def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)


print(factorial(5))
""",
}


@app.command()
def demo(
    directory: Annotated[Path, typer.Argument(help="Where to write the demo files")] = Path(
        "leettrace-demo"
    ),
    no_open: Annotated[bool, typer.Option("--no-open", help="Don't open the web UI")] = False,
) -> None:
    """Write two example solutions and trace one — the fastest way to see LeetTrace."""
    directory.mkdir(parents=True, exist_ok=True)
    for name, code in DEMO_FILES.items():
        target = directory / name
        if not target.exists():
            target.write_text(code, encoding="utf-8")
    console.print(f"Wrote examples to [bold]{escape(str(directory))}/[/]")
    session = _daemon()
    body = {
        "code": DEMO_FILES["reverse_list.py"],
        "cases": [{"input": "head = [1,2,3,4]", "expected": "[4,3,2,1]"}],
        "publish": True,
        "slug": "reverse-linked-list",
    }
    r = post(session, "/leetcode/trace", body)
    print_trace(r.json()["traces"][0], label="reverse_list.py")
    console.print(
        f"\nNext: [cyan]leettrace watch {escape(str(directory / 'factorial.py'))}[/] "
        "and edit the file — the view updates on save."
    )
    run_id = r.headers.get("X-LeetTrace-Run")
    if not no_open and run_id:
        webbrowser.open(session.ui_url(run_id))


@app.command()
def stop() -> None:
    """Stop the running engine."""
    session = find_daemon()
    if session is None:
        console.print("No engine running.")
        return
    post(session, "/shutdown", {})
    console.print("Engine stopping.")


@app.command()
def status() -> None:
    """Show whether the engine is running."""
    session = find_daemon()
    if session is None:
        console.print("[red]●[/] engine not running — start it with [bold]leettrace start[/]")
        raise typer.Exit(1)
    health = get(session, "/health").json()
    console.print(
        f"[green]●[/] engine {health['version']} at {session.base_url} (pid {session.pid})"
    )
    console.print(f"  runs: {health['runs']}  ·  open UIs: {health['watchers']}")


@app.command(name="open")
def open_ui() -> None:
    """Open the local web UI."""
    session = _daemon()
    console.print(session.ui_url())
    webbrowser.open(session.ui_url())


@app.command()
def pair() -> None:
    """Show the one-time code that pairs the browser extension with this engine."""
    session = _daemon()
    info = get(session, "/pair/code").json()
    code = info["code"]
    console.print(
        f"Pairing code: [bold reverse] {code[:3]}-{code[3:]} [/] "
        f"[dim](valid {info['expiresIn'] // 60} min, one use)[/]"
    )
    console.print("Open a LeetCode problem, click [bold]Trace[/], and paste it into the panel.")


def launch() -> None:
    """No subcommand / double-click: start the engine (or find it) and open the welcome page."""
    running = find_daemon()
    if running is not None:
        console.print(f"[green]●[/] LeetTrace is already running — opening {running.base_url}")
        webbrowser.open(running.welcome_url())
        return
    start(port=None, background=False, dev=False, no_open=False)


# ------------------------------------------------------------------ tracing


def _daemon() -> Any:
    try:
        return ensure_daemon()
    except DaemonUnavailable as e:
        err.print(f"[red]{e}[/]")
        raise typer.Exit(1) from e


def _read_input(input_text: str | None, input_file: Path | None) -> str:
    if input_file is not None:
        return input_file.read_text(encoding="utf-8")
    return (input_text or "").replace("\\n", "\n")


def print_trace(trace: dict[str, Any], *, label: str = "") -> None:
    steps = trace["steps"]
    title = f" {escape(label)}" if label else ""
    console.rule(f"[bold]LeetTrace[/]{title} — {len(steps)} steps")
    lines = trace["source"].splitlines()
    for s in steps:
        top = s["stack"][-1]["func"] if s["stack"] else ""
        depth = "  " * max(0, len(s["stack"]) - 1)
        src = lines[s["line"] - 1].strip() if 0 < s["line"] <= len(lines) else ""
        event = {
            "call": "[cyan]call[/]",
            "return": "[magenta]ret [/]",
            "exception": "[red]exc [/]",
        }.get(s["event"], "    ")
        note = escape(s.get("note") or "")
        console.print(
            f"[dim]{s['i']:>4}[/] L{s['line']:<3} {event} {depth}[bold]{escape(top)}[/] "
            f"[dim]{escape(src[:48])}[/]  {note}"
        )
    if steps and steps[-1]["stdout"]:
        console.rule("stdout", style="dim")
        console.print(escape(steps[-1]["stdout"].rstrip("\n")))
    test = trace.get("test")
    if test:
        verdict = {True: "[green]PASS[/]", False: "[red]FAIL[/]"}.get(
            test.get("passed"), "[dim]—[/]"
        )
        console.print(
            f"{verdict} case {test['index'] + 1}: {escape(test['input'])} → "
            f"{escape(str(test.get('actual')))}"
            + (f" (expected {escape(str(test['expected']))})" if test.get("expected") else "")
        )
        if test.get("error"):
            console.print(f"[red]{escape(test['error'])}[/]")
    if trace.get("truncated"):
        console.print("[yellow]Trace truncated[/] (step/time/memory cap reached).")
    if trace.get("error"):
        e = trace["error"]
        where = f" (line {e['line']})" if e.get("line") else ""
        console.print(f"[red]{escape(e['type'])}[/]{where}: {escape(e['message'])}")
    warning = check_version(trace)
    if warning:
        console.print(f"[yellow]{warning}[/]")


@app.command()
def run(
    file: Annotated[Path, typer.Argument(exists=True, dir_okay=False, readable=True)],
    input: Annotated[
        str | None, typer.Option("--input", "-i", help="stdin for the program")
    ] = None,
    input_file: Annotated[Path | None, typer.Option(help="Read stdin from a file")] = None,
    as_json: Annotated[bool, typer.Option("--json", help="Print the raw Trace JSON")] = False,
    no_open: Annotated[bool, typer.Option("--no-open", help="Don't open the web UI")] = False,
    tui: Annotated[bool, typer.Option("--tui", help="Step through it in the terminal")] = False,
) -> None:
    """Trace a Python file once and show it (web UI by default)."""
    code = file.read_text(encoding="utf-8")
    stdin = _read_input(input, input_file)
    if tui:
        from leettrace.tracer.runner import trace_script
        from leettrace.tui import run_tui

        run_tui(trace_script(code, stdin), title=file.name)
        return
    session = _daemon()
    r = post(session, "/trace", {"code": code, "input": stdin, "publish": True, "label": file.name})
    trace = r.json()
    if as_json:
        sys.stdout.write(json.dumps(trace, indent=2) + "\n")
    else:
        print_trace(trace, label=file.name)
    run_id = r.headers.get("X-LeetTrace-Run")
    if not no_open and run_id:
        url = session.ui_url(run_id)
        if not as_json:
            console.print(f"[dim]Visualization:[/] {url}")
        webbrowser.open(url)


@app.command()
def watch(
    file: Annotated[Path, typer.Argument(exists=True, dir_okay=False, readable=True)],
    input: Annotated[
        str | None, typer.Option("--input", "-i", help="stdin for the program")
    ] = None,
    input_file: Annotated[Path | None, typer.Option(help="Read stdin from a file")] = None,
    no_open: Annotated[bool, typer.Option("--no-open", help="Don't open the web UI")] = False,
) -> None:
    """Re-trace on every save and live-update the open web UI."""
    from watchfiles import watch as watch_files

    session = _daemon()
    stdin = _read_input(input, input_file)

    def trace_once() -> str | None:
        code = file.read_text(encoding="utf-8")
        t0 = time.monotonic()
        r = post(
            session, "/trace", {"code": code, "input": stdin, "publish": True, "label": file.name}
        )
        trace = r.json()
        ms = (time.monotonic() - t0) * 1000
        status = "[red]error[/]" if trace.get("error") else "[green]ok[/]"
        console.print(
            f"[dim]{time.strftime('%H:%M:%S')}[/] {status} {len(trace['steps'])} steps "
            f"[dim]({ms:.0f} ms)[/]"
            + (
                f" — {escape(trace['error']['type'])}: {escape(trace['error']['message'])}"
                if trace.get("error")
                else ""
            )
        )
        run_header: str | None = r.headers.get("X-LeetTrace-Run")
        return run_header

    run_id = trace_once()
    url = session.ui_url(run_id)
    console.print(f"Watching [bold]{escape(str(file))}[/] — live view: {url}")
    if not no_open:
        webbrowser.open(url)
    try:
        for _changes in watch_files(file, debounce=150, step=50):
            trace_once()
    except KeyboardInterrupt:
        pass


@app.command()
def leetcode(
    file: Annotated[Path, typer.Argument(exists=True, dir_okay=False, readable=True)],
    case: Annotated[
        list[str],
        typer.Option("--case", "-c", help='Example input, e.g. "nums = [2,7,11,15], target = 9"'),
    ],
    expected: Annotated[
        list[str] | None, typer.Option("--expected", "-e", help="Expected output per case")
    ] = None,
    function: Annotated[
        str | None, typer.Option(help="Method name (default: first method)")
    ] = None,
    as_json: Annotated[bool, typer.Option("--json", help="Print raw Trace JSON")] = False,
    no_open: Annotated[bool, typer.Option("--no-open", help="Don't open the web UI")] = False,
    tui: Annotated[bool, typer.Option("--tui", help="Step through case 1 in the terminal")] = False,
) -> None:
    """Run a `class Solution` file against LeetCode-style example cases."""
    code = file.read_text(encoding="utf-8")
    exp = expected or []
    cases = [{"input": c, "expected": exp[i] if i < len(exp) else None} for i, c in enumerate(case)]
    if tui:
        from leettrace.tracer.runner import run_request
        from leettrace.tui import run_tui

        trace = run_request(
            {
                "mode": "leetcode",
                "source": code,
                "functionName": function,
                "caseIndex": 0,
                "input": cases[0]["input"],
                "expected": cases[0]["expected"],
            }
        )
        run_tui(trace, title=file.name)
        return
    session = _daemon()
    body = {
        "code": code,
        "functionName": function,
        "cases": cases,
        "publish": True,
        "slug": file.stem,
    }
    r = post(session, "/leetcode/trace", body)
    traces = r.json()["traces"]
    if as_json:
        sys.stdout.write(json.dumps(traces, indent=2) + "\n")
    else:
        for t in traces:
            print_trace(t, label=f"{file.name} case {t.get('test', {}).get('index', 0) + 1}")
    run_id = r.headers.get("X-LeetTrace-Run")
    if not no_open and run_id:
        webbrowser.open(session.ui_url(run_id))


def _ensure_stdio() -> None:
    """A double-clicked windowed app (macOS .app) has no console: log to a file instead.
    Everywhere else, write UTF-8 (Windows consoles and redirected files default to cp1252,
    which can't encode the status glyphs) and never crash on an unencodable character."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            with contextlib.suppress(ValueError, OSError):
                reconfigure(encoding="utf-8", errors="replace")
    if sys.stdout is not None and sys.stderr is not None:
        return
    import io
    from typing import TextIO

    from leettrace.server.session import home

    log: TextIO
    try:
        home().mkdir(mode=0o700, parents=True, exist_ok=True)
        log = open(home() / "app.log", "a", encoding="utf-8")  # noqa: SIM115 — process-lifetime
    except OSError:
        log = io.StringIO()
    sys.stdout = sys.stdout or log
    sys.stderr = sys.stderr or log
    console.file = sys.stdout
    err.file = sys.stderr


def main() -> None:
    from leettrace.tracer.runner import CHILD_FLAG

    if len(sys.argv) > 1 and sys.argv[1] == CHILD_FLAG:  # frozen-binary sandbox child
        from leettrace.tracer import child

        sys.argv.pop(1)
        child.main()
        return
    # macOS may pass a process-serial-number argument to double-clicked apps.
    sys.argv = [a for a in sys.argv if not a.startswith("-psn_")]
    _ensure_stdio()
    app()
