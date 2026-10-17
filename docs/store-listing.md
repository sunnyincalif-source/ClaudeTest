# Chrome Web Store / Firefox Add-ons listing (draft)

**Name:** LeetTrace

**Summary (132 chars max):** See your Python solution execute on the problem page: call stack, heap, pointer arrows,
and a reason for every step.

**Category:** Developer Tools

**Description:**

LeetTrace shows you how your solution actually runs.

Click **Trace** next to Run on any LeetCode problem. LeetTrace runs your Python code against
the problem's example test cases and lets you step through it:

- **Call stack:** every frame and its local variables, as recursion goes deeper and returns.
- **Heap:** lists, dicts, sets, and your own objects such as ListNode and TreeNode.
- **Pointer arrows:** watch `next` pointers flip while you reverse a linked list, and trees
  draw as real branching structures.
- **A reason for every step:** "Checking if n <= 1 (5 <= 1) → False, so we skip the if
  block."
- **Pass or fail per example case,** plus a timeline you can scrub forward and back.

Your code runs on **your own computer**, in the free LeetTrace engine
(`pipx install leettrace`, then `leettrace start`). Nothing is sent to any server. The
extension only talks to the engine on 127.0.0.1, after a one-time pairing code that you
confirm in your terminal.

v1 traces Python 3.

LeetTrace is an independent tool. It is not affiliated with or endorsed by LeetCode.

**Permissions, explained:**

- _Read and change data on leetcode.com/problems:_ adds the Trace button and side panel,
  reads your editor code and the public example cases.
- _storage:_ remembers the pairing with your local engine.
- _scripting:_ reads the code from the page's editor.
- _127.0.0.1:_ talks to the LeetTrace engine on your own machine.

**Privacy:** no analytics, no remote servers, no account. Code and test cases go only to the
engine on your own computer.

**Screenshots:** `docs/images/extension-panel.png`, `docs/demo/leetcode-overlay.gif`
(first frame), `docs/images/viz-rev_mid.png`, `docs/images/viz-bst.png`.
