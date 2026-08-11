"""
AI Quantity Engine — Main Pipeline

Flow:
  1. Validate input file
  2. Normalize PDF → PNG pages
  3. Parse text (OCR)
  4. Detect drawing type (AI) → confirm with user
  5. Analyze drawing (Vision AI) — uses type-specific prompt
  6. Calculate quantities — applies matching rules
  7. Export to Excel
"""

import sys
from pathlib import Path

from utils import (
    print_step,
    print_success,
    print_error,
)


# ──────────────────────────────────────────────────────
# ANSI
# ──────────────────────────────────────────────────────

CYAN  = "\033[96m"
GREEN = "\033[92m"
RED   = "\033[91m"
BOLD  = "\033[1m"
RESET = "\033[0m"


# ──────────────────────────────────────────────────────
# Pipeline
# ──────────────────────────────────────────────────────

def run(pdf_path: str) -> None:

    from validator  import DocumentValidator
    from normalizer import DocumentNormalizer
    from parser     import DocumentParser
    from detector   import DrawingTypeDetector
    from vision     import VisionAnalyzer
    from quantity   import QuantityCalculator
    from exporter   import Exporter

    pdf = Path(pdf_path)

    # ─────────────────────────────────────────────────
    # Step 1 — Validate
    # ─────────────────────────────────────────────────
    print_step("Step 1 / 7 — Validating input file")

    validator  = DocumentValidator()
    validation = validator.validate(pdf)

    if not validation.valid:
        print_error("Validation failed")
        for err in validation.errors:
            print(f"  ✗ {err}")
        sys.exit(1)

    print_success(f"File OK: {validation.file_name}  ({validation.file_size_mb} MB)")

    # ─────────────────────────────────────────────────
    # Step 2 — Normalize (PDF → PNG)
    # ─────────────────────────────────────────────────
    print_step("Step 2 / 7 — Normalizing PDF to images")

    normalizer = DocumentNormalizer()
    pages      = normalizer.normalize(pdf)

    print_success(f"{len(pages)} page(s) converted.")

    # ─────────────────────────────────────────────────
    # Step 3 — Parse text (OCR)
    # ─────────────────────────────────────────────────
    print_step("Step 3 / 7 — Parsing document text")

    parser   = DocumentParser()
    parsed   = parser.parse(pdf)

    print_success(f"{parsed.total_elements} text element(s) extracted.")

    # ─────────────────────────────────────────────────
    # Step 4 — Detect drawing type → confirm with user
    # ─────────────────────────────────────────────────
    print_step("Step 4 / 7 — Detecting drawing type")

    detector     = DrawingTypeDetector()
    drawing_type = detector.detect_and_confirm()

    # ─────────────────────────────────────────────────
    # Step 5 — Vision analysis
    # ─────────────────────────────────────────────────
    print_step(f"Step 5 / 7 — Vision analysis [{drawing_type.value}]")

    analyzer      = VisionAnalyzer()
    vision_result = analyzer.analyze(drawing_type)

    print_success("Vision analysis done.")

    # ─────────────────────────────────────────────────
    # Step 6 — Calculate quantities
    # ─────────────────────────────────────────────────
    print_step(f"Step 6 / 7 — Calculating quantities [{drawing_type.value}]")

    calculator = QuantityCalculator()
    quantities = calculator.calculate(drawing_type=drawing_type)

    print_success(f"{len(quantities.items)} quantity item(s) calculated.")

    # ─────────────────────────────────────────────────
    # Step 7 — Export
    # ─────────────────────────────────────────────────
    print_step("Step 7 / 7 — Exporting to Excel")

    exporter = Exporter()
    exporter.export(quantities)

    # ─────────────────────────────────────────────────
    # Done
    # ─────────────────────────────────────────────────
    print(f"\n{CYAN}{'═' * 60}{RESET}")
    print(f"{GREEN}{BOLD}  [OK] Pipeline completed successfully!{RESET}")
    print(f"{CYAN}{'═' * 60}{RESET}")

    print(f"\n  Drawing type : {BOLD}{drawing_type.value}{RESET}")
    print(f"  Items found  : {BOLD}{len(quantities.items)}{RESET}")
    print()

    for item in quantities.items:
        print(
            f"    • {item.name:<35}"
            f"{item.quantity:>10.2f}  {item.unit}"
        )

    print()


# ──────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────

if __name__ == "__main__":

    if len(sys.argv) < 2:
        print(f"\n{RED}Usage: python main.py <path_to_file>{RESET}\n")
        sys.exit(1)

    try:
        run(sys.argv[1])

    except KeyboardInterrupt:
        print(f"\n{RED}Interrupted by user.{RESET}")
        sys.exit(0)

    except Exception as exc:
        print_error("Pipeline failed", exc)
        sys.exit(1)
