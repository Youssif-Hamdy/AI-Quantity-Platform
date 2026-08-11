"""
Columns Calculator
حساب عدد وحجم الأعمدة الخرسانية.
"""


def calculate(data: dict) -> dict | None:

    columns = data.get("columns", [])

    if not columns:
        return None

    total_count  = 0
    total_volume = 0.0

    for col in columns:

        qty = col.get("quantity", 1)

        total_count += qty

        # استخدام الحجم المعطى أو حسابه
        volume = col.get("volume")

        if volume is None:
            L = col.get("length") or 0.0
            W = col.get("width")  or 0.0
            H = col.get("height") or 0.0
            volume = L * W * H

        total_volume += volume * qty

    return {
        "name":     "Columns — Volume",
        "quantity": round(total_volume, 3),
        "unit":     "m³",
    }
