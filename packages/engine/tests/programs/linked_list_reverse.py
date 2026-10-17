class Node:
    def __init__(self, val, next=None):
        self.val = val
        self.next = next


head = Node(1, Node(2, Node(3, Node(4))))

prev = None
cur = head
while cur:
    nxt = cur.next
    cur.next = prev
    prev = cur
    cur = nxt
head = prev

out = []
node = head
while node:
    out.append(node.val)
    node = node.next
print(out)
