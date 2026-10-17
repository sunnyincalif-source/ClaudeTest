# LinkedIn post (draft)

I built a debugger that draws your LeetCode solution while it runs. 🧵

When I practice linked-list or tree problems, the bug is almost always in the pointers, and
print statements are a terrible way to see pointers. So I built **LeetTrace**.

Click **Trace** next to Run on a LeetCode problem. Your Python executes against the
problem's real example cases, and a side panel lets you scrub through every step:

▸ the call stack, frame by frame, through every recursive call
▸ the heap, with real arrows for `next`, `left`, and `right`, so you watch pointers rewire
while the nodes stay put
▸ a plain-English reason for every step ("n <= 1 is True: base case, returning 1")
▸ pass or fail for each example case

[GIF: reversing a linked list]

How it works:

🔹 **It traces real CPython instead of simulating it.** A local engine instruments the
interpreter with `sys.settrace`. At every line it rebuilds the live object graph with a
breadth-first search, and gives each object an id that stays stable over time. That stable
id is why the arrows can move while the nodes don't.

🔹 **One trace contract feeds three front ends.** The engine emits a language-agnostic trace
schema, which is also the localhost wire protocol. The browser extension, a local web UI,
and a terminal UI all render that same schema, so adding JavaScript later means writing one
new producer, not a rewrite.

🔹 **A localhost code runner is a security surface, so I treated it like one.** It binds the
loopback interface only, requires a session token on every request, and allows only
leetcode.com plus its own UI. The Host header is checked to stop DNS rebinding. The
extension pairs once with a code typed from your terminal. Your code runs in a sandboxed
subprocess with caps on steps, time, memory, and recursion depth.

🔹 **The tests are the credibility.** There are golden traces for every sample program,
security tests for the bridge, and a test that checks every narration sentence against the
state the visualizer actually shows.

Stack: Python (Pydantic, FastAPI, Textual), TypeScript/React, a hand-rolled SVG pointer
layer, an MV3 extension, pnpm + Turborepo.

Repo + demo: <link>

#python #leetcode #devtools #softwareengineering #react
