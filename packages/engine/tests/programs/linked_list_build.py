class Node:
    def __init__(self, val):
        self.val = val
        self.next = None


head = Node(1)
tail = head
for v in [2, 3, 4]:
    tail.next = Node(v)
    tail = tail.next

cur = head
while cur is not None:
    print(cur.val)
    cur = cur.next
