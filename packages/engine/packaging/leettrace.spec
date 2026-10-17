# PyInstaller spec for the desktop app (SPEC-PRODUCT §5). Build from packages/engine:
#   uv run pyinstaller --noconfirm --clean --distpath dist-bin --workpath build/pyi packaging/leettrace.spec
# Produces, per OS (LT_TARGET overrides the detected one):
#   windows: dist-bin/LeetTrace/  LeetTrace.exe (no console: the app) + leettrace-cli.exe (the CLI;
#            Windows file names are case-insensitive, so it can't be "leettrace.exe")
#   macos:   dist-bin/LeetTrace.app  (menu-bar only, no Dock icon; CLI: Contents/MacOS/LeetTrace)
#   linux:   dist-bin/LeetTrace/leettrace  (wrapped into an AppImage by linux/build_appimage.sh)
import os
import re
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

HERE = Path(SPECPATH)  # noqa: F821 — provided by PyInstaller
ENGINE = HERE.parent
TARGET = os.environ.get("LT_TARGET") or {"win32": "windows", "darwin": "macos"}.get(
    sys.platform, "linux"
)
VERSION = re.search(
    r'__version__ = "([^"]+)"', (ENGINE / "src/leettrace/__init__.py").read_text()
).group(1)
ICONS = HERE / "icons"

a = Analysis(  # noqa: F821
    [str(HERE / "entry.py")],
    pathex=[str(ENGINE / "src")],
    datas=collect_data_files("leettrace") + collect_data_files("textual"),
    hiddenimports=[
        *collect_submodules("leettrace"),
        *collect_submodules("uvicorn"),
        *collect_submodules("websockets"),
        *collect_submodules("pystray"),
        "watchfiles",
    ],
    excludes=["tkinter"],
)
pyz = PYZ(a.pure)  # noqa: F821


def exe(name, console, icon):
    return EXE(  # noqa: F821
        pyz,
        a.scripts,
        [],
        exclude_binaries=True,
        name=name,
        console=console,
        icon=str(icon) if icon else None,
        upx=False,
    )


if TARGET == "windows":
    ico = ICONS / "leettrace.ico"
    coll = COLLECT(  # noqa: F821
        exe("LeetTrace", False, ico),
        exe("leettrace-cli", True, ico),
        a.binaries,
        a.datas,
        name="LeetTrace",
    )
elif TARGET == "macos":
    coll = COLLECT(exe("LeetTrace", False, None), a.binaries, a.datas, name="LeetTrace")  # noqa: F821
    app = BUNDLE(  # noqa: F821
        coll,
        name="LeetTrace.app",
        icon=str(ICONS / "leettrace.icns"),
        bundle_identifier="dev.leettrace.app",
        version=VERSION,
        info_plist={
            "CFBundleName": "LeetTrace",
            "CFBundleDisplayName": "LeetTrace",
            "CFBundleShortVersionString": VERSION,
            "CFBundleVersion": VERSION,
            "LSUIElement": True,  # menu-bar app: no Dock icon
            "NSHighResolutionCapable": True,
            "LSMinimumSystemVersion": "11.0",
        },
    )
else:
    coll = COLLECT(exe("leettrace", True, None), a.binaries, a.datas, name="LeetTrace")  # noqa: F821
