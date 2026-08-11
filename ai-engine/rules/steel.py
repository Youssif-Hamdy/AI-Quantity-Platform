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

        weight = bar.get("weight")

        if weight is None:
            d   = bar.get("diameter") or 0.0    # mm
            L   = bar.get("length")   or 0.0    # m
            n   = bar.get("quantity") or 1
            # Standard formula: kg/m = d² / 162
            weight = (d ** 2 / 162) * L * n

        total_weight += weight

    if total_weight == 0.0:
        return None

    return {
        "name":     "Steel — Total Weight",
        "quantity": round(total_weight, 2),
        "unit":     "kg",
    }