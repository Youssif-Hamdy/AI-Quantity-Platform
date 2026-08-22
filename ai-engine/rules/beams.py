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

<<<<<<< HEAD
        volume = beam.get("volume_m3")

        if volume is None:
            W = beam.get("width_m")  or 0.0
            H = beam.get("height_m") or 0.0
            L = beam.get("length_m") or 0.0
=======
        volume = beam.get("volume")

        if volume is None:
            W = beam.get("width")  or 0.0
            H = beam.get("height") or 0.0
            L = beam.get("length") or 0.0
>>>>>>> 0af4b7ca6d930092ac5612f983684d52058d043f
            volume = W * H * L

        total_volume += volume * qty

    return {
        "name":     "Beams — Volume",
        "quantity": round(total_volume, 3),
        "unit":     "m³",
    }
