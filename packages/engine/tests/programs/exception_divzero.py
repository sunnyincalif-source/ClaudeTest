def average(xs):
    total = sum(xs)
    return total / len(xs)


print(average([4, 8]))
print(average([]))
print("never printed")
