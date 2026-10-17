"""Windows resource caps for the tracer subprocess via a Job Object (SPEC-LAUNCH A2).

POSIX children cap themselves with setrlimit (see child.py). Windows has no setrlimit, so the
child puts *itself* into a Job Object before running any user code: a per-process
committed-memory limit, a one-process limit (the traced program can't spawn helpers), and
kill-on-close. (Doing it from the child avoids a race with venv launcher processes, which on
Windows start the real interpreter as a grandchild.)

If any call fails the child says so on stderr (MEMORY_CAP_UNAVAILABLE) and the engine reports
the memory cap as unavailable — never a silent "no limit".
"""

from __future__ import annotations

import sys
from typing import Any

JOB_OBJECT_LIMIT_ACTIVE_PROCESS = 0x00000008
JOB_OBJECT_LIMIT_PROCESS_MEMORY = 0x00000100
JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION = 0x00000400
JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS = 9

# The interpreter itself commits memory before user code runs; allow for it on top of the
# user's budget so the cap measures (roughly) the program, as RLIMIT_AS does on POSIX.
INTERPRETER_OVERHEAD_MB = 96
MEMORY_CAP_UNAVAILABLE = "LEETTRACE_MEMORY_CAP_UNAVAILABLE"


def supported() -> bool:
    return sys.platform == "win32"


class WindowsJob:
    def __init__(self, memory_mb: int) -> None:
        import ctypes
        from ctypes import wintypes

        self._ctypes = ctypes
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)  # type: ignore[attr-defined]
        self._kernel32 = kernel32

        class IO_COUNTERS(ctypes.Structure):  # noqa: N801 — Win32 name
            _fields_ = [
                (n, ctypes.c_ulonglong)
                for n in (
                    "ReadOperationCount",
                    "WriteOperationCount",
                    "OtherOperationCount",
                    "ReadTransferCount",
                    "WriteTransferCount",
                    "OtherTransferCount",
                )
            ]

        class BASIC(ctypes.Structure):
            _fields_ = [
                ("PerProcessUserTimeLimit", ctypes.c_int64),
                ("PerJobUserTimeLimit", ctypes.c_int64),
                ("LimitFlags", wintypes.DWORD),
                ("MinimumWorkingSetSize", ctypes.c_size_t),
                ("MaximumWorkingSetSize", ctypes.c_size_t),
                ("ActiveProcessLimit", wintypes.DWORD),
                ("Affinity", ctypes.c_size_t),
                ("PriorityClass", wintypes.DWORD),
                ("SchedulingClass", wintypes.DWORD),
            ]

        class EXTENDED(ctypes.Structure):
            _fields_ = [
                ("BasicLimitInformation", BASIC),
                ("IoInfo", IO_COUNTERS),
                ("ProcessMemoryLimit", ctypes.c_size_t),
                ("JobMemoryLimit", ctypes.c_size_t),
                ("PeakProcessMemoryUsed", ctypes.c_size_t),
                ("PeakJobMemoryUsed", ctypes.c_size_t),
            ]

        kernel32.CreateJobObjectW.restype = wintypes.HANDLE
        kernel32.CreateJobObjectW.argtypes = [wintypes.LPVOID, wintypes.LPCWSTR]
        kernel32.SetInformationJobObject.argtypes = [
            wintypes.HANDLE,
            ctypes.c_int,
            wintypes.LPVOID,
            wintypes.DWORD,
        ]
        kernel32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        kernel32.GetCurrentProcess.restype = wintypes.HANDLE
        kernel32.CloseHandle.argtypes = [wintypes.HANDLE]

        handle = kernel32.CreateJobObjectW(None, None)
        if not handle:
            raise OSError(ctypes.get_last_error(), "CreateJobObjectW failed")  # type: ignore[attr-defined]
        self.handle = handle
        info = EXTENDED()
        info.BasicLimitInformation.LimitFlags = (
            JOB_OBJECT_LIMIT_PROCESS_MEMORY
            | JOB_OBJECT_LIMIT_ACTIVE_PROCESS
            | JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            | JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION
        )
        info.BasicLimitInformation.ActiveProcessLimit = 1
        info.ProcessMemoryLimit = (memory_mb + INTERPRETER_OVERHEAD_MB) * 1024 * 1024
        ok = kernel32.SetInformationJobObject(
            handle,
            JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
            ctypes.byref(info),
            ctypes.sizeof(info),
        )
        if not ok:
            self.close()
            raise OSError(ctypes.get_last_error(), "SetInformationJobObject failed")  # type: ignore[attr-defined]

    def assign(self, proc: Any) -> bool:
        process_handle = int(proc._handle)  # noqa: SLF001 — Popen's Win32 process handle
        return bool(self._kernel32.AssignProcessToJobObject(self.handle, process_handle))

    def assign_current(self) -> bool:
        """Put the calling process in the job (the job handle stays open for its lifetime)."""
        current = self._kernel32.GetCurrentProcess()
        return bool(self._kernel32.AssignProcessToJobObject(self.handle, current))

    def close(self) -> None:
        if getattr(self, "handle", None):
            self._kernel32.CloseHandle(self.handle)
            self.handle = None


def cap_current_process(memory_mb: int) -> bool:
    """Called by the sandbox child on Windows. Returns False if the cap couldn't be applied."""
    try:
        job = WindowsJob(memory_mb)
        ok = job.assign_current()
    except OSError:
        return False
    # Keep the handle open: closing it would (with kill-on-close) end this very process.
    _KEEP.append(job)
    return ok


_KEEP: list[WindowsJob] = []
