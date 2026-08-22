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

def run(pdf_path: str, preset_drawing_type: str | None = None) -> None:

    from validator  import DocumentValidator
    from normalizer import DocumentNormalizer
    from parser     import DocumentParser
    from detector   import DrawingTypeDetector
    from geometry.extractor import GeometryExtractor
    from geometry.processor import process as process_geometry
    from geometry.scale_resolver import ScaleResolver
    from geometry.topology import build_topology
    from canvas.emitter import CanvasEmitter
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
    print_step("Step 2 / 8 — Normalizing PDF to images")

    normalizer = DocumentNormalizer()
    pages      = normalizer.normalize(pdf)

    print_success(f"{len(pages)} page(s) converted.")

    # ─────────────────────────────────────────────────
    # Step 3 — Parse text (OCR)
    # ─────────────────────────────────────────────────
    print_step("Step 3 / 8 — Parsing document text")

    parser   = DocumentParser()
    parsed   = parser.parse(pdf)

    print_success(f"{parsed.total_elements} text element(s) extracted.")

    # ─────────────────────────────────────────────────
    # Step 4 — Detect drawing type → confirm with user
    # ─────────────────────────────────────────────────
    print_step("Step 4 / 8 — Detecting drawing type")

    detector     = DrawingTypeDetector()
    drawing_type = detector.detect_and_confirm(preset_type=preset_drawing_type)

    # ─────────────────────────────────────────────────
    # Step 5 — Geometry Extraction
    # ─────────────────────────────────────────────────
    print_step(f"Step 5 / 8 — Spatial Geometry Extraction [{drawing_type.value}]")

    extractor = GeometryExtractor()
    raw_geom  = extractor.extract(drawing_type)

    # ─────────────────────────────────────────────────
    # Step 6 — Geometry Processing & Topology
    # ─────────────────────────────────────────────────
    print_step(f"Step 6 / 8 — Processing Geometry & Scale [{drawing_type.value}]")
    
    clean_geom = process_geometry(raw_geom)
    
    resolver = ScaleResolver()
    scaled_geom = resolver.resolve(clean_geom)
    
    final_geom = build_topology(scaled_geom)

    # ─────────────────────────────────────────────────
    # Step 7 — Emit Canvas JSON
    # ─────────────────────────────────────────────────
    print_step("Step 7 / 8 — Generating Canvas JSON")
    
    emitter = CanvasEmitter()
    canvas_data = emitter.emit(final_geom)

    # ─────────────────────────────────────────────────
    # Step 8 — Calculate quantities
    # ─────────────────────────────────────────────────
    print_step(f"Step 8 / 8 — Calculating quantities [{drawing_type.value}]")

    calculator = QuantityCalculator()
    quantities = calculator.calculate(drawing_type=drawing_type)

    print_success(f"{len(quantities.items)} quantity item(s) calculated.")

    # ─────────────────────────────────────────────────
    # Step 9 — Export
    # ─────────────────────────────────────────────────
    print_step("Step 9 / 9 — Exporting to Excel")

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
        print(f"\n{RED}Usage: python main.py <path_to_file> [drawing_type]{RESET}")
        print(f"  drawing_type: architectural | civil | mixed  (optional, skips interactive prompt)\n")
        sys.exit(1)

    _pdf_path          = sys.argv[1]
    _preset_type       = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        run(_pdf_path, preset_drawing_type=_preset_type)

    except KeyboardInterrupt:
        print(f"\n{RED}Interrupted by user.{RESET}")
        sys.exit(0)

    except Exception as exc:
        print_error("Pipeline failed", exc)
        sys.exit(1)
