"""
Flooring Calculator
"""


def calculate(data):

    rooms = data.get("rooms", [])

    total_area = 0

    for room in rooms:
        area = room.get("area_m2") or 0

        if area:
            total_area += area

    return {
        "name": "Flooring",
        "quantity": round(total_area, 2),
        "unit": "m²",
    }