"""The `leettrace` command-line interface (SPEC §5.1)."""

from __future__ import annotations

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
    no_args_is_help=True,
    add_completion=False,
    pretty_exceptions_enable=False,
)
console = Console(highlight=False, soft_wrap=True)
err = Console(stderr=True, highlight=False)


def _version_callback(value: bool) -> None:
    if value:
        console.print(f"leettrace {__version__}")
        raise typer.Exit()


@app.callback()
def _root(
    version: Annotated[
        bool, typer.Option("--version", callback=_version_callback, is_eager=True)
    ] = False,
) -> None:
    """LeetTrace — a local trace engine for your LeetCode practice."""


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
        console.print(f"  Web UI: {running.ui_url()}")
        return

    from leettrace.server.daemon import serve
    from leettrace.server.session import Session

    def ready(session: Session) -> None:
        if background:
            print(f"leettrace engine {__version__} on {session.base_url}", flush=True)
            return
        console.print(f"[bold green]●[/] LeetTrace engine {__version__} running")
        console.print(f"  Listening on {session.base_url} [dim](loopback only)[/]")
        console.print(f"  Web UI:      {session.ui_url()}")
        console.print("  Extension:   open a LeetCode problem and click [bold]Trace[/]")
        console.print(
            "[dim]  Your code runs locally, in a sandboxed subprocess. Ctrl+C to stop.[/]"
        )
        if not no_open:
            webbrowser.open(session.ui_url())

    def pair_code(client: str, code: str) -> None:
        pretty = f"{code[:3]}-{code[3:]}"
        if background:
            print(f"pairing request from {client}: code {pretty}", flush=True)
            return
        console.print(
            f"\n[bold yellow]Pairing request[/] from [bold]{escape(client)}[/]. "
            f"If that was you, enter this code in the extension: [bold reverse] {pretty} [/]\n"
        )

    try:
        serve(port=port, on_ready=ready, on_pair_code=pair_code, dev=dev)
    except RuntimeError as e:
        err.print(f"[red]Could not start:[/] {e}")
        raise typer.Exit(1) from e


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
    """Show pending pairing codes (if the extension asked to connect)."""
    session = _daemon()
    pending = get(session, "/pair/pending").json()["pending"]
    if not pending:
        console.print("No pending pairing requests. Click [bold]Connect[/] in the extension first.")
        return
    for p in pending:
        code = p["code"]
        console.print(
            f"{escape(p['client'])}: [bold reverse] {code[:3]}-{code[3:]} [/] "
            f"[dim](expires in {p['expiresIn']}s)[/]"
        )


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


def main() -> None:
    from leettrace.tracer.runner import CHILD_FLAG

    if len(sys.argv) > 1 and sys.argv[1] == CHILD_FLAG:  # frozen-binary sandbox child
        from leettrace.tracer import child

        sys.argv.pop(1)
        child.main()
        return
    app()
