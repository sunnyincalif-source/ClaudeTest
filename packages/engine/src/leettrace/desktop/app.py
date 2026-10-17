"""`leettrace app` — what the installed app runs (double-click, Start menu, login item).

One instance per user: if an engine is already running, this just opens its welcome page.
Otherwise it starts the engine on a worker thread, puts an icon in the tray / menu bar (main
thread, as macOS requires), and on the very first launch turns on start-at-login and opens
the welcome page with the "Add the extension" step front and centre. No terminal involved.
"""

from __future__ import annotations

import contextlib
import signal
import threading
import webbrowser
from collections.abc import Callable

from leettrace import __version__
from leettrace.client import find_daemon
from leettrace.desktop import autostart
from leettrace.desktop.tray import make_tray
from leettrace.server.session import Session, home

FIRST_RUN_MARKER = ".installed"
READY_TIMEOUT = 30.0


def first_run() -> bool:
    """True exactly once per user account (then a marker file is written)."""
    marker = home() / FIRST_RUN_MARKER
    if marker.exists():
        return False
    with contextlib.suppress(OSError):
        marker.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        marker.touch()
    return True


class EngineThread:
    """The engine's uvicorn server on a background thread."""

    def __init__(self, port: int | None = None) -> None:
        self.port = port
        self.session: Session | None = None
        self.error: BaseException | None = None
        self.ready = threading.Event()
        self.stopped = threading.Event()
        self.on_stopped: Callable[[], None] = lambda: None
        self._stop: Callable[[], None] = lambda: None
        self._thread = threading.Thread(target=self._run, name="leettrace-engine", daemon=True)

    def _run(self) -> None:
        from leettrace.server.daemon import serve

        def ready(session: Session, _code: str) -> None:
            self.session = session
            self.ready.set()

        def handle(stop: Callable[[], None]) -> None:
            self._stop = stop

        try:
            serve(port=self.port, on_ready=ready, on_stop_handle=handle)
        except BaseException as e:  # surfaced to the caller via .error
            self.error = e
        finally:
            self.ready.set()
            self.stopped.set()
            self.on_stopped()

    def start(self) -> Session:
        self._thread.start()
        self.ready.wait(READY_TIMEOUT)
        if self.session is None:
            raise RuntimeError(f"the engine did not start: {self.error or 'timed out'}")
        return self.session

    def stop(self, timeout: float = 10.0) -> None:
        self._stop()
        if timeout and threading.current_thread() is not self._thread:
            self._thread.join(timeout)

    def wait(self) -> None:
        self.stopped.wait()


def welcome_url(session: Session, first: bool) -> str:
    url = session.welcome_url()
    return f"{url}&first=1" if first else url


def run_app(*, background: bool = False, port: int | None = None) -> None:
    running = find_daemon()
    if running is not None:
        if not background:
            webbrowser.open(running.welcome_url())
        return

    first = first_run()
    with contextlib.suppress(Exception):  # best effort; the tray toggle can retry
        if first:
            autostart.enable()  # on by default; the tray menu turns it off
        else:
            autostart.refresh()

    engine = EngineThread(port)
    session = engine.start()
    if threading.current_thread() is threading.main_thread():
        # Ctrl+C / SIGTERM (CLI use, service managers): stop the engine cleanly so the session
        # file is removed and the port freed, instead of dying with a daemon thread.
        for sig in (signal.SIGINT, signal.SIGTERM):
            with contextlib.suppress(ValueError, OSError):
                signal.signal(sig, lambda *_: engine.stop(timeout=0))
    if not background:
        webbrowser.open(welcome_url(session, first))

    def toggle_autostart() -> None:
        with contextlib.suppress(Exception):
            if autostart.is_enabled():
                autostart.disable()
            else:
                autostart.enable()

    def on_action(action: str) -> None:
        if action == "open":
            webbrowser.open(session.welcome_url())
        elif action == "extension":
            webbrowser.open(f"{session.welcome_url()}&extension=1")
        elif action == "autostart":
            toggle_autostart()
            if tray is not None:
                tray.refresh()
        elif action == "quit":
            engine.stop()

    tray = make_tray(
        version=__version__,
        base_url=session.base_url,
        autostart=autostart.is_enabled,
        on_action=on_action,
    )
    print(
        f"LeetTrace {__version__} on {session.base_url}; tray: {'on' if tray else 'unavailable'}",
        flush=True,
    )
    if tray is None:
        engine.wait()
        return
    # Stopping the engine any other way (welcome page "Stop", `leettrace stop`) removes the
    # icon too, so the app never lingers in the tray without an engine behind it.
    engine.on_stopped = tray.stop
    if engine.stopped.is_set():
        return
    try:
        tray.run()
    except Exception:
        engine.wait()  # the GUI backend failed late: keep serving without an icon
        return
    engine.stop()
