"""
Steel Weight Calculator
حساب الوزن الكلي للحديد.

المعادلة:
  وزن السيخ (kg) = (d² / 162) × L × n
  حيث:
    d = قطر السيخ بالـ mm
    L = الطول بالـ m
    n = العدد
"""


def calculate(data: dict) -> dict | None:

    bars  = data.get("steel_bars", [])

    if not bars:
        return None

    total_weight = 0.0

    for bar in bars:

        qty = bar.get("quantity", 1)
        weight = bar.get("weight_kg")

        if weight is None:
            D = bar.get("diameter_mm") or 0.0
            L = bar.get("length_m") or 0.0
            # Standard formula: kg/m = d² / 162
            weight = ((D ** 2) / 162) * L * qty

        total_weight += weight

    if total_weight == 0.0:
        return None

    return {
        "name":     "Steel — Total Weight",
        "quantity": round(total_weight, 2),
        "unit":     "kg",
    }