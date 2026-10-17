"""LeetCode adapter tests (SPEC §4.5, §4.7)."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from leettrace.leetcode import codec
from leettrace.leetcode.harness import PRELUDE
from leettrace.server.app import create_app
from leettrace.tracer.runner import RunLimits, run_request


def lc(code: str, case: str, expected: str | None = None, **kw: Any) -> dict[str, Any]:
    req = {"mode": "leetcode", "source": code, "input": case, "expected": expected, "caseIndex": 0}
    req.update(kw)
    return run_request(req, kw.pop("limits", None) if "limits" in kw else None)


def prelude_ns() -> dict[str, Any]:
    ns: dict[str, Any] = {"__name__": "__main__"}
    exec(PRELUDE, ns)
    return ns


# ------------------------------------------------------------------ codec


def test_parse_named_case() -> None:
    assert codec.parse_case("nums = [2,7,11,15], target = 9") == [
        ("nums", [2, 7, 11, 15]),
        ("target", 9),
    ]
    assert codec.parse_case('s = "a,b=c", k = 2') == [("s", "a,b=c"), ("k", 2)]
    assert codec.parse_case("grid = [[1,0],[0,1]]") == [("grid", [[1, 0], [0, 1]])]


def test_parse_positional_lines() -> None:
    assert codec.parse_case("[2,7,11,15]\n9") == [(None, [2, 7, 11, 15]), (None, 9)]
    assert codec.parse_case("true") == [(None, True)]


def test_tree_decoding_matches_leetcode() -> None:
    ns = prelude_ns()
    root = codec.build_tree([1, 2, 3, None, 4], ns["TreeNode"])
    assert root.val == 1
    assert root.left.val == 2 and root.right.val == 3
    assert root.left.left is None and root.left.right.val == 4
    assert root.right.left is None and root.right.right is None
    assert codec.to_leetcode(root) == "[1,2,3,null,4]"
    assert codec.build_tree([], ns["TreeNode"]) is None


def test_linked_list_roundtrip() -> None:
    ns = prelude_ns()
    head = codec.build_linked_list([1, 2, 3], ns["ListNode"])
    assert codec.to_leetcode(head) == "[1,2,3]"
    assert codec.build_linked_list([], ns["ListNode"]) is None


def test_output_comparison() -> None:
    assert codec.outputs_equal([0, 1], "[0, 1]")
    assert codec.outputs_equal(True, "true")
    assert not codec.outputs_equal(1, "true")
    assert codec.outputs_equal(2.0000001, "2.00000")
    assert not codec.outputs_equal([1, 0], "[0,1]")


# ------------------------------------------------------------------ harness

TWO_SUM = """class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, x in enumerate(nums):
            if target - x in seen:
                return [seen[target - x], i]
            seen[x] = i
        return []
"""


def test_two_sum_passes_and_shows_only_user_frames() -> None:
    t = lc(TWO_SUM, "nums = [2,7,11,15], target = 9", "[0,1]")
    assert t["test"] == {
        "index": 0,
        "input": "nums = [2,7,11,15], target = 9",
        "expected": "[0,1]",
        "actual": "[0,1]",
        "passed": True,
    }
    funcs = {f["func"] for s in t["steps"] for f in s["stack"]}
    assert funcs == {"twoSum"}  # no harness, no <module>, no prelude
    first = t["steps"][0]
    assert first["event"] == "call"
    assert "self" not in first["stack"][0]["locals"]  # empty Solution() hidden
    assert first["stack"][0]["order"] == ["nums", "target"]


def test_wrong_answer_reports_fail() -> None:
    t = lc(TWO_SUM, "nums = [3,2,4], target = 6", "[0,2]")
    assert t["test"]["passed"] is False
    assert t["test"]["actual"] == "[1,2]"


MAX_DEPTH = """class Solution:
    def maxDepth(self, root: Optional[TreeNode]) -> int:
        if not root:
            return 0
        return 1 + max(self.maxDepth(root.left), self.maxDepth(root.right))
"""


def test_tree_problem() -> None:
    t = lc(MAX_DEPTH, "root = [3,9,20,null,null,15,7]", "3")
    assert t["test"]["passed"] is True
    first = t["steps"][0]
    root_ref = first["stack"][0]["locals"]["root"]
    node = first["heap"][root_ref["id"]]
    assert node["className"] == "TreeNode" and node["fields"]["val"]["value"] == 3
    assert len(first["heap"]) == 5  # the whole decoded tree is reachable
    assert {f["func"] for s in t["steps"] for f in s["stack"]} == {"maxDepth"}


REVERSE = """class Solution:
    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        prev = None
        while head:
            head.next, prev, head = prev, head, head.next
        return prev
"""


def test_linked_list_problem() -> None:
    t = lc(REVERSE, "head = [1,2,3,4,5]", "[5,4,3,2,1]")
    assert t["test"]["passed"] is True


INPLACE = """class Solution:
    def moveZeroes(self, nums: List[int]) -> None:
        j = 0
        for i in range(len(nums)):
            if nums[i]:
                nums[i], nums[j] = nums[j], nums[i]
                j += 1
"""


def test_in_place_problem_compares_first_argument() -> None:
    t = lc(INPLACE, "nums = [0,1,0,3,12]", "[1,3,12,0,0]")
    assert t["test"]["actual"] == "[1,3,12,0,0]"
    assert t["test"]["passed"] is True


def test_merge_k_lists_list_of_linked_lists() -> None:
    code = """class Solution:
    def mergeKLists(self, lists: List[Optional[ListNode]]) -> Optional[ListNode]:
        vals = []
        for node in lists:
            while node:
                vals.append(node.val)
                node = node.next
        dummy = tail = ListNode()
        for v in sorted(vals):
            tail.next = ListNode(v)
            tail = tail.next
        return dummy.next
"""
    t = lc(code, "lists = [[1,4,5],[1,3,4],[2,6]]", "[1,1,2,3,4,4,5,6]")
    assert t["test"]["passed"] is True


def test_self_state_is_shown_when_used() -> None:
    code = """class Solution:
    def count(self, n: int) -> int:
        self.total = 0
        for i in range(n):
            self.total += i
        return self.total
"""
    t = lc(code, "n = 3", "3")
    last_line = [s for s in t["steps"] if s["event"] == "return"][-1]
    assert "self" in last_line["stack"][0]["locals"]


def test_runtime_error_in_solution() -> None:
    code = """class Solution:
    def f(self, nums: List[int]) -> int:
        return nums[10]
"""
    t = lc(code, "nums = [1]", "1")
    assert t["error"]["type"] == "IndexError"
    assert t["test"]["error"].startswith("IndexError")
    assert t["steps"][-1]["event"] == "exception"


def test_syntax_error() -> None:
    t = lc("class Solution:\n    def f(self:\n", "x = 1")
    assert t["error"]["type"] == "SyntaxError"
    assert "SyntaxError" in t["test"]["error"]


def test_missing_solution_class() -> None:
    t = lc("def f(x):\n    return x\n", "x = 1")
    assert t["error"]["type"] == "TestCaseError"
    assert "class Solution" in t["error"]["message"]


def test_bad_case_input() -> None:
    t = lc(TWO_SUM, "nums = [2,7", "[0,1]")
    assert t["error"]["type"] == "TestCaseError"


def test_infinite_loop_in_solution_truncates() -> None:
    code = "class Solution:\n    def f(self, n: int) -> int:\n        while True:\n            n += 1\n"
    t = run_request(
        {"mode": "leetcode", "source": code, "input": "n = 1", "caseIndex": 0},
        RunLimits(max_steps=200),
    )
    assert t["truncated"] is True
    assert "Stopped" in t["test"]["error"]


def test_function_name_selects_method() -> None:
    code = TWO_SUM + "\n    def helper(self, x: int) -> int:\n        return x * 2\n"
    t = lc(code, "x = 21", "42", functionName="helper")
    assert t["test"]["passed"] is True


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app(token="tok", port=47998), base_url="http://127.0.0.1:47998")


def test_leetcode_endpoint_one_trace_per_case(client: TestClient) -> None:
    body = {
        "code": TWO_SUM,
        "language": "python3",
        "slug": "two-sum",
        "cases": [
            {"input": "nums = [2,7,11,15], target = 9", "expected": "[0,1]"},
            {"input": "nums = [3,3], target = 6", "expected": "[0,1]"},
        ],
    }
    r = client.post(
        "/leetcode/trace",
        json=body,
        headers={"Authorization": "Bearer tok", "Origin": "https://leetcode.com"},
    )
    assert r.status_code == 200
    traces = r.json()["traces"]
    assert [t["test"]["index"] for t in traces] == [0, 1]
    assert all(t["test"]["passed"] for t in traces)


def test_leetcode_endpoint_rejects_other_languages(client: TestClient) -> None:
    body = {"code": "class Solution {}", "language": "cpp", "cases": [{"input": "x = 1"}]}
    r = client.post("/leetcode/trace", json=body, headers={"Authorization": "Bearer tok"})
    assert r.status_code == 422
    assert "Python only" in r.json()["error"]


def test_golden_leetcode_traces(snapshot: Any) -> None:
    snapshot("lc_two_sum", lc(TWO_SUM, "nums = [2,7,11,15], target = 9", "[0,1]"))
    snapshot("lc_max_depth", lc(MAX_DEPTH, "root = [3,9,20,null,null,15,7]", "3"))
