"""
Quantity Calculator

Calculates quantities using rule modules.
Applies only the rules appropriate for the detected drawing type.
"""

from pathlib import Path

from config import (
    GEOMETRY_OUTPUT,
    QUANTITY_OUTPUT,
)

from models import (
    DrawingType,
    QuantityResult,
    QuantityItem,
)

from utils import (
    load_json,
    save_json,
    print_success,
    print_error,
)

from rules import (
    doors,
    windows,
    rooms,
    flooring,
    painting,
    concrete,
    steel,
    columns,
    beams,
    slabs,
)


# ──────────────────────────────────────────────────────
# Rule sets per drawing type
# ──────────────────────────────────────────────────────

ARCHITECTURAL_RULES = [
    doors,
    windows,
    rooms,
    flooring,
    painting,
]

CIVIL_RULES = [
    columns,
    beams,
    slabs,
    concrete,
    steel,
]

MIXED_RULES = ARCHITECTURAL_RULES + CIVIL_RULES


class QuantityCalculator:

    def __init__(self):
        pass

    def _get_rules(self, drawing_type: DrawingType) -> list:
        return {
            DrawingType.ARCHITECTURAL: ARCHITECTURAL_RULES,
            DrawingType.CIVIL:         CIVIL_RULES,
            DrawingType.MIXED:         MIXED_RULES,
        }[drawing_type]

    def _flatten_data(
        self,
        raw: dict,
        drawing_type: DrawingType,
    ) -> dict:
        """
        For mixed drawings, the vision output is nested:
          { "architectural": {...}, "civil": {...} }

        Flatten it into a single dict so rules can find their keys.
        """
        if drawing_type != DrawingType.MIXED:
            return raw

        merged = {}
        merged.update(raw.get("architectural", {}))
        merged.update(raw.get("civil", {}))
        return merged

    def calculate(
        self,
        drawing_type: DrawingType = DrawingType.ARCHITECTURAL,
        geometry_file: str | Path = GEOMETRY_OUTPUT,
    ) -> QuantityResult:

        geometry_file = Path(geometry_file)

        if not geometry_file.exists():
            raise FileNotFoundError(
                f"{geometry_file} does not exist."
            )

        raw_data = load_json(geometry_file)
        data     = self._flatten_data(raw_data, drawing_type)
        rules    = self._get_rules(drawing_type)

        result = QuantityResult(drawing_type=drawing_type)

        for rule in rules:

            try:

                item = rule.calculate(data)

                if item:

                    result.items.append(
                        QuantityItem(
                            name=item["name"],
                            quantity=item["quantity"],
                            unit=item["unit"],
                        )
                    )

            except Exception as exc:

                print_error(
                    f"Rule '{rule.__name__}' failed",
                    exc,
                )

        save_json(
            result.model_dump(),
            QUANTITY_OUTPUT,
        )

        print_success(
            f"Quantity calculation completed — "
            f"{len(result.items)} item(s) for "
            f"[{drawing_type.value}] drawing."
        )

        return result


if __name__ == "__main__":

    import sys

    type_arg = sys.argv[1] if len(sys.argv) > 1 else "architectural"

    try:
        dt = DrawingType(type_arg)
    except ValueError:
        print(f"Unknown drawing type: {type_arg}")
        sys.exit(1)

    try:
        calculator = QuantityCalculator()
        result     = calculator.calculate(drawing_type=dt)
        print(result.model_dump_json(indent=4))

    except Exception as exc:
        print_error("Quantity calculation failed", exc)