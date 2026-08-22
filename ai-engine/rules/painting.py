"""
Painting Calculator
"""

WALL_HEIGHT = 3.0


def calculate(data):

    rooms = data.get("rooms", [])

    total_area = 0

    for room in rooms:
        perimeter = room.get("perimeter_m") or 0

        total_area += perimeter * WALL_HEIGHT

    return {
        "name": "Painting",
        "quantity": round(total_area, 2),
        "unit": "m²",
    }