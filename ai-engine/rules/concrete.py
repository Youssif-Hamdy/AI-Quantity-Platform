"""
Concrete Volume Calculator
حساب إجمالي حجم الخرسانة = أعمدة + كمرات + بلاطات.
"""


def calculate(data: dict) -> dict | None:

    total = 0.0

    # ─── Columns ─────────────────────────────────────────
    grid = data.get("column_grid", {})
    for col in grid.get("columns", []):
        qty    = col.get("quantity", 1)
        volume = col.get("volume_m3")
        if volume is None:
            L = col.get("length_m") or 0.0
            W = col.get("width_m")  or 0.0
            H = col.get("height_m") or 0.0
            volume = L * W * H
        total += volume * qty

    # ─── Beams ───────────────────────────────────────────
    for beam in data.get("beams", []):
        qty    = beam.get("quantity", 1)
        volume = beam.get("volume_m3")
        if volume is None:
            W = beam.get("width_m")  or 0.0
            H = beam.get("height_m") or 0.0
            L = beam.get("length_m") or 0.0
            volume = W * H * L
        total += volume * qty

    # ─── Slabs ───────────────────────────────────────────
    for slab in data.get("slabs", []):
        qty    = slab.get("quantity", 1)
        volume = slab.get("volume_m3")
        if volume is None:
            area = slab.get("area_m2")
            if area is None:
                Ls = slab.get("length_m") or 0.0
                Ws = slab.get("width_m")  or 0.0
                area = Ls * Ws
            T      = slab.get("thickness_m") or 0.0
            volume = area * T
        total += volume * qty

    if total == 0.0:
        return None

    return {
        "name":     "Concrete — Total Volume",
        "quantity": round(total, 3),
        "unit":     "m³",
    }