"""
Columns Calculator
حساب عدد وحجم الأعمدة الخرسانية.
"""


def calculate(data: dict) -> dict | None:
<<<<<<< HEAD
    grid = data.get("column_grid", {})
    columns = grid.get("columns", [])
=======

    columns = data.get("columns", [])
>>>>>>> 0af4b7ca6d930092ac5612f983684d52058d043f

    if not columns:
        return None

    total_count  = 0
    total_volume = 0.0

    for col in columns:

        qty = col.get("quantity", 1)

        total_count += qty

<<<<<<< HEAD
        volume = col.get("volume_m3")

        if volume is None:
            L = col.get("length_m") or 0.0
            W = col.get("width_m")  or 0.0
            H = col.get("height_m") or 0.0
=======
        # استخدام الحجم المعطى أو حسابه
        volume = col.get("volume")

        if volume is None:
            L = col.get("length") or 0.0
            W = col.get("width")  or 0.0
            H = col.get("height") or 0.0
>>>>>>> 0af4b7ca6d930092ac5612f983684d52058d043f
            volume = L * W * H

        total_volume += volume * qty

    return {
        "name":     "Columns — Volume",
        "quantity": round(total_volume, 3),
        "unit":     "m³",
    }
