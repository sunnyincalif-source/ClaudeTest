// Bundled practice problems (SPEC Phase 8). Problem statements are paraphrased in our own
// words; LeetCode-style problems run through the engine's LeetCode adapter, scripts run as-is.
import type { Case } from './api';

export interface Sample {
  id: string;
  title: string;
  blurb: string;
  mode: 'leetcode' | 'script';
  code: string;
  cases?: Case[];
}

export const SAMPLES: Sample[] = [
  {
    id: 'reverse-linked-list',
    title: 'Reverse a linked list',
    blurb: 'Watch the next pointers flip one at a time while the nodes stay put.',
    mode: 'leetcode',
    code: `class Solution:
    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        prev = None
        cur = head
        while cur:
            nxt = cur.next
            cur.next = prev
            prev = cur
            cur = nxt
        return prev
`,
    cases: [{ input: 'head = [1,2,3,4]', expected: '[4,3,2,1]' }],
  },
  {
    id: 'two-sum',
    title: 'Two sum',
    blurb: 'A dict remembers what we have seen; one pass finds the pair.',
    mode: 'leetcode',
    code: `class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, x in enumerate(nums):
            need = target - x
            if need in seen:
                return [seen[need], i]
            seen[x] = i
        return []
`,
    cases: [
      { input: 'nums = [2,7,11,15], target = 9', expected: '[0,1]' },
      { input: 'nums = [3,2,4], target = 6', expected: '[1,2]' },
    ],
  },
  {
    id: 'max-depth',
    title: 'Maximum depth of a binary tree',
    blurb: 'Recursion down both subtrees; the stack shows every pending call.',
    mode: 'leetcode',
    code: `class Solution:
    def maxDepth(self, root: Optional[TreeNode]) -> int:
        if root is None:
            return 0
        left = self.maxDepth(root.left)
        right = self.maxDepth(root.right)
        return 1 + max(left, right)
`,
    cases: [{ input: 'root = [3,9,20,null,null,15,7]', expected: '3' }],
  },
  {
    id: 'merge-two-lists',
    title: 'Merge two sorted lists',
    blurb: 'A dummy head and a tail pointer stitch two chains into one.',
    mode: 'leetcode',
    code: `class Solution:
    def mergeTwoLists(self, list1: Optional[ListNode], list2: Optional[ListNode]) -> Optional[ListNode]:
        dummy = tail = ListNode()
        while list1 and list2:
            if list1.val <= list2.val:
                tail.next = list1
                list1 = list1.next
            else:
                tail.next = list2
                list2 = list2.next
            tail = tail.next
        tail.next = list1 or list2
        return dummy.next
`,
    cases: [{ input: 'list1 = [1,2,4], list2 = [1,3,4]', expected: '[1,1,2,3,4,4]' }],
  },
  {
    id: 'valid-parentheses',
    title: 'Valid parentheses',
    blurb: 'A stack of open brackets, matched as closers arrive.',
    mode: 'leetcode',
    code: `class Solution:
    def isValid(self, s: str) -> bool:
        pairs = {')': '(', ']': '[', '}': '{'}
        stack = []
        for ch in s:
            if ch in pairs:
                if not stack or stack[-1] != pairs[ch]:
                    return False
                stack.pop()
            else:
                stack.append(ch)
        return not stack
`,
    cases: [
      { input: 's = "([]{})"', expected: 'true' },
      { input: 's = "(]"', expected: 'false' },
    ],
  },
  {
    id: 'binary-search',
    title: 'Binary search',
    blurb: 'lo and hi close in on the target, halving the range each loop.',
    mode: 'leetcode',
    code: `class Solution:
    def search(self, nums: List[int], target: int) -> int:
        lo, hi = 0, len(nums) - 1
        while lo <= hi:
            mid = (lo + hi) // 2
            if nums[mid] == target:
                return mid
            if nums[mid] < target:
                lo = mid + 1
            else:
                hi = mid - 1
        return -1
`,
    cases: [{ input: 'nums = [-1,0,3,5,9,12], target = 9', expected: '4' }],
  },
  {
    id: 'fib',
    title: 'Recursive Fibonacci',
    blurb: 'The call tree unfolds on the stack — see why memoization matters.',
    mode: 'script',
    code: `def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)


print(fib(5))
`,
  },
  {
    id: 'bubble-sort',
    title: 'Bubble sort',
    blurb: 'Adjacent swaps bubble the largest value to the end each pass.',
    mode: 'script',
    code: `nums = [5, 1, 4, 2, 8]
n = len(nums)
for i in range(n):
    for j in range(n - i - 1):
        if nums[j] > nums[j + 1]:
            nums[j], nums[j + 1] = nums[j + 1], nums[j]
print(nums)
`,
  },
];
