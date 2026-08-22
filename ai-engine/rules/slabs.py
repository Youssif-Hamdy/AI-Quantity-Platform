"""
Slabs Calculator
حساب مساحة وحجم البلاطات الخرسانية.
"""


def calculate(data: dict) -> dict | None:

    slabs = data.get("slabs", [])

    if not slabs:
        return None

    total_area   = 0.0
    total_volume = 0.0

    for slab in slabs:

        qty = slab.get("quantity", 1)

        # ─── Area ──────────────────────────────────────────
        area = slab.get("area_m2")

        if area is None:
            L = slab.get("length_m") or 0.0
            W = slab.get("width_m")  or 0.0
            area = L * W

        total_area += area * qty

        # ─── Volume ────────────────────────────────────────
        volume = slab.get("volume_m3")

        if volume is None:
            T = slab.get("thickness_m") or 0.0
            volume = area * T

        total_volume += volume * qty

    # Return volume as the primary quantity
    return {
        "name":     "Slabs — Volume",
        "quantity": round(total_volume, 3),
        "unit":     "m³",
    }
