def calculate(data):

    rooms = data.get("rooms", [])

    area = 0

    for room in rooms:
        area += room.get("area_m2") or 0

    return {
        "name": "Floor Area",
        "quantity": area,
        "unit": "m²"
    }