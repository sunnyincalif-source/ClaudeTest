"""Pydantic mirror of the Trace Schema (packages/schema/src/index.ts, SPEC §3).

The engine validates every Trace against these models at its boundary (after reading the
tracer subprocess's output, before it goes over the wire). Field names and shapes must stay
identical to the TypeScript contract; `test_schema_mirror.py` guards that.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from leettrace import __version__

ENGINE_VERSION = __version__


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


# --- Values ------------------------------------------------------------------------------


class IntV(_Model):
    kind: Literal["int"]
    value: int | float


class FloatV(_Model):
    kind: Literal["float"]
    value: float


class BoolV(_Model):
    kind: Literal["bool"]
    value: bool


class StrV(_Model):
    kind: Literal["str"]
    value: str


class NoneV(_Model):
    kind: Literal["none"]


class UnserializableV(_Model):
    kind: Literal["unserializable"]
    repr: str


class RefV(_Model):
    kind: Literal["ref"]
    id: str


Value = Annotated[
    IntV | FloatV | BoolV | StrV | NoneV | UnserializableV | RefV, Field(discriminator="kind")
]


# --- Heap objects ------------------------------------------------------------------------


class ListObj(_Model):
    type: Literal["list"]
    id: str
    items: list[Value]


class TupleObj(_Model):
    type: Literal["tuple"]
    id: str
    items: list[Value]


class DictEntry(_Model):
    key: Value
    value: Value


class DictObj(_Model):
    type: Literal["dict"]
    id: str
    entries: list[DictEntry]


class SetObj(_Model):
    type: Literal["set"]
    id: str
    items: list[Value]


class InstanceObj(_Model):
    type: Literal["instance"]
    id: str
    class_name: str = Field(alias="className")
    fields: dict[str, Value]


HeapObject = Annotated[
    ListObj | TupleObj | DictObj | SetObj | InstanceObj, Field(discriminator="type")
]


# --- Frames, steps, traces ---------------------------------------------------------------


class Frame(_Model):
    id: str
    func: str
    locals: dict[str, Value]
    order: list[str]
    return_value: Value | None = Field(default=None, alias="returnValue")


class ExceptionInfo(_Model):
    type: str
    message: str


class Step(_Model):
    i: int
    line: int
    event: Literal["line", "call", "return", "exception"]
    stack: list[Frame]
    heap: dict[str, HeapObject]
    stdout: str
    note: str | None = None
    exception: ExceptionInfo | None = None


class TestResult(_Model):
    __test__ = False  # not a pytest class

    index: int
    input: str
    expected: str | None = None
    actual: str | None = None
    passed: bool | None = None
    error: str | None = None


class TraceError(_Model):
    type: str
    message: str
    line: int | None = None


class Trace(_Model):
    language: Literal["python"]
    source: str
    steps: list[Step]
    test: TestResult | None = None
    truncated: bool | None = None
    error: TraceError | None = None
    engine_version: str = Field(alias="engineVersion")


def validate_trace(data: dict[str, Any]) -> dict[str, Any]:
    """Validate a raw trace dict against the schema and return its canonical wire form.

    Optional fields that are unset are omitted (never sent as null), matching the TS
    contract's `field?:` semantics.
    """
    model = Trace.model_validate(data)
    return model.model_dump(by_alias=True, exclude_none=True)
