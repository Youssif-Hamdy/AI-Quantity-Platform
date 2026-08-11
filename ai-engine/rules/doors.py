"""
Doors Calculator
"""


def calculate(data):
    total = 0
    for room in data.get("rooms", []):
        for door in room.get("doors", []):
            total += door.get("quantity", 1)

    return {
        "name": "Doors",
        "quantity": total,
        "unit": "pcs",
    }