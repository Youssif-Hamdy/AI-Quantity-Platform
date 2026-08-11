def calculate(data):

    total = 0

    for room in data.get("rooms", []):
        for window in room.get("windows", []):
            total += window.get("quantity", 1)

    return {
        "name": "Windows",
        "quantity": total,
        "unit": "pcs"
    }