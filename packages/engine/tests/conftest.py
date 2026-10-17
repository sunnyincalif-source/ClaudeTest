from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

HERE = Path(__file__).parent
PROGRAMS = HERE / "programs"
SNAPSHOTS = HERE / "snapshots"


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--snapshot-update",
        action="store_true",
        help="Rewrite golden trace snapshots. Review the diff before committing!",
    )


@pytest.fixture
def snapshot(request: pytest.FixtureRequest):  # type: ignore[no-untyped-def]
    """Compare a trace to tests/snapshots/<name>.json.

    A missing snapshot is written and the test fails, so new snapshots are always
    reviewed. Existing ones are only rewritten with --snapshot-update.
    """
    update = request.config.getoption("--snapshot-update")

    def check(name: str, data: Any) -> None:
        path = SNAPSHOTS / f"{name}.json"
        text = json.dumps(data, indent=1, ensure_ascii=False) + "\n"  # keep field order
        if update or not path.exists():
            created = not path.exists()
            SNAPSHOTS.mkdir(exist_ok=True)
            path.write_text(text, encoding="utf-8")
            if created and not update:
                pytest.fail(f"snapshot {path.name} created — review it and re-run")
            return
        expected = path.read_text(encoding="utf-8")
        assert text == expected, (
            f"trace snapshot {path.name} changed (review, then --snapshot-update)"
        )

    return check


def program(name: str) -> str:
    return (PROGRAMS / f"{name}.py").read_text(encoding="utf-8")
