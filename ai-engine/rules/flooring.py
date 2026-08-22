"""
Flooring Calculator
"""


def calculate(data):

    rooms = data.get("rooms", [])

    total_area = 0

    for room in rooms:
<<<<<<< HEAD
        area = room.get("area_m2") or 0
=======

        area = room.get("area", 0)
>>>>>>> 0af4b7ca6d930092ac5612f983684d52058d043f

        if area:
            total_area += area

    return {
        "name": "Flooring",
        "quantity": round(total_area, 2),
        "unit": "m²",
    }