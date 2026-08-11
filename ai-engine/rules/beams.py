"""
Beams Calculator
حساب عدد وحجم الكمرات الخرسانية.
"""


def calculate(data: dict) -> dict | None:

    beams = data.get("beams", [])

    if not beams:
        return None

    total_volume = 0.0

    for beam in beams:

        qty = beam.get("quantity", 1)

        volume = beam.get("volume")

        if volume is None:
            W = beam.get("width")  or 0.0
            H = beam.get("height") or 0.0
            L = beam.get("length") or 0.0
            volume = W * H * L

        total_volume += volume * qty

    return {
        "name":     "Beams — Volume",
        "quantity": round(total_volume, 3),
        "unit":     "m³",
    }
