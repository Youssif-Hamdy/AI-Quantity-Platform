"""
Vision Analyzer

Uses Gemini Vision to analyze normalized drawing pages
and extract engineering entities.

Supports three drawing types:
  - architectural  →  rooms, walls, doors, windows
  - civil          →  columns, beams, slabs, steel bars
  - mixed          →  both of the above
"""

import json
from pathlib import Path

from config import (
    PARSER_OUTPUT,
    VISION_OUTPUT,
    TEMP_DIR,
)

from providers.gemini_provider import GeminiVisionProvider

from models import (
    DrawingType,
    VisionResult,
    CivilResult,
    MixedResult,
)

from utils import (
    load_json,
    save_json,
    print_success,
    print_error,
)


class VisionAnalyzer:

    def __init__(self):
        self.provider  = GeminiVisionProvider()
        self.pages_dir = TEMP_DIR / "pages"

    # --------------------------------------------------
    # Helpers
    # --------------------------------------------------

    def _collect_images(self) -> list[str]:
        if not self.pages_dir.exists():
            return []
        return [str(p) for p in sorted(self.pages_dir.glob("*.png"))]

    def _load_ocr(self) -> dict:
        if Path(PARSER_OUTPUT).exists():
            return load_json(PARSER_OUTPUT)
        return {}

    # --------------------------------------------------
    # Prompts
    # --------------------------------------------------

    def _prompt_architectural(self, ocr_data: dict) -> str:
        return f"""
You are an expert Quantity Surveyor and Architect.

Analyze the attached architectural shop drawing.

OCR Result:
{json.dumps(ocr_data, indent=2)}

Return ONLY valid JSON — no markdown, no explanation.

Schema:
{{
    "rooms": [
        {{
            "id": "room_1",
            "name": "Room Name",
            "box_2d": [ymin, xmin, ymax, xmax],
            "length": 0.0,
            "width": 0.0,
            "height": 0.0,
            "area": 0.0,
            "perimeter": 0.0,
            "unit": "m",
            "walls": [
                {{
                    "name": "Wall Name",
                    "length": 0.0,
                    "height": 0.0,
                    "area": 0.0
                }}
            ],
            "doors": [
                {{
                    "id": "door_1",
                    "label": "D1",
                    "box_2d": [ymin, xmin, ymax, xmax],
                    "width": 0.0,
                    "height": 0.0,
                    "area": 0.0,
                    "quantity": 1
                }}
            ],
            "windows": [
                {{
                    "id": "win_1",
                    "label": "W1",
                    "box_2d": [ymin, xmin, ymax, xmax],
                    "width": 0.0,
                    "height": 0.0,
                    "area": 0.0,
                    "quantity": 1
                }}
            ]
        }}
    ]
}}

CRITICAL:
1. TRANSLATE ALL TEXT (names, labels, notes) TO ENGLISH. No Arabic allowed.
2. Structure output hierarchically by room.
3. Every element (room, door, window) MUST include a unique "id" string and a "box_2d" array [ymin, xmin, ymax, xmax] normalized on a 0 to 1000 scale representing its position on the page.
4. Nest walls, doors, and windows INSIDE each room.
5. Do NOT return top-level arrays outside rooms.
6. Return JSON only.
"""

    def _prompt_civil(self, ocr_data: dict) -> str:
        return f"""
You are an expert Quantity Surveyor and Structural Engineer.

Analyze the attached civil/structural shop drawing.

OCR Result:
{json.dumps(ocr_data, indent=2)}

Return ONLY valid JSON — no markdown, no explanation.

Schema:
{{
    "columns": [
        {{
            "id": "col_1",
            "label": "C1",
            "box_2d": [ymin, xmin, ymax, xmax],
            "length": 0.0,
            "width": 0.0,
            "height": 0.0,
            "volume": 0.0,
            "quantity": 1
        }}
    ],
    "beams": [
        {{
            "id": "beam_1",
            "label": "B1",
            "box_2d": [ymin, xmin, ymax, xmax],
            "width": 0.0,
            "height": 0.0,
            "length": 0.0,
            "volume": 0.0,
            "quantity": 1
        }}
    ],
    "slabs": [
        {{
            "id": "slab_1",
            "label": "S1",
            "box_2d": [ymin, xmin, ymax, xmax],
            "length": 0.0,
            "width": 0.0,
            "thickness": 0.0,
            "area": 0.0,
            "volume": 0.0,
            "quantity": 1
        }}
    ],
    "steel_bars": [
        {{
            "id": "steel_1",
            "label": "T10",
            "box_2d": [ymin, xmin, ymax, xmax],
            "diameter": 10.0,
            "length": 0.0,
            "quantity": 1,
            "weight": 0.0
        }}
    ]
}}

CRITICAL:
1. TRANSLATE ALL TEXT TO ENGLISH. No Arabic allowed.
2. Extract ALL structural elements (columns, beams, slabs, steel bars).
3. Every element MUST include a unique "id" string and a "box_2d" array [ymin, xmin, ymax, xmax] normalized on a 0 to 1000 scale.
4. Compute volume = length × width × height for columns and beams.
5. Compute slab volume = length × width × thickness.
6. Steel bar weight = (diameter² / 162) × length × quantity  (kg).
7. All dimensions must be in metres; diameter in mm.
8. Return JSON only.
"""

    def _prompt_mixed(self, ocr_data: dict) -> str:
        return f"""
You are an expert Quantity Surveyor, Architect, and Structural Engineer.

Analyze the attached mixed (architectural + structural) shop drawing.

OCR Result:
{json.dumps(ocr_data, indent=2)}

Return ONLY valid JSON — no markdown, no explanation.

Schema:
{{
    "architectural": {{
        "rooms": [
            {{
                "id": "room_1",
                "name": "Room Name",
                "box_2d": [ymin, xmin, ymax, xmax],
                "length": 0.0,
                "width": 0.0,
                "height": 0.0,
                "area": 0.0,
                "perimeter": 0.0,
                "unit": "m",
                "walls": [
                    {{"name": "Wall Name", "length": 0.0, "height": 0.0, "area": 0.0}}
                ],
                "doors": [
                    {{"id": "door_1", "label": "D1", "box_2d": [ymin, xmin, ymax, xmax], "width": 0.0, "height": 0.0, "area": 0.0, "quantity": 1}}
                ],
                "windows": [
                    {{"id": "win_1", "label": "W1", "box_2d": [ymin, xmin, ymax, xmax], "width": 0.0, "height": 0.0, "area": 0.0, "quantity": 1}}
                ]
            }}
        ]
    }},
    "civil": {{
        "columns":   [{{"id": "col_1", "label": "C1", "box_2d": [ymin, xmin, ymax, xmax], "length": 0.0, "width": 0.0, "height": 0.0, "volume": 0.0, "quantity": 1}}],
        "beams":     [{{"id": "beam_1", "label": "B1", "box_2d": [ymin, xmin, ymax, xmax], "width": 0.0, "height": 0.0, "length": 0.0, "volume": 0.0, "quantity": 1}}],
        "slabs":     [{{"id": "slab_1", "label": "S1", "box_2d": [ymin, xmin, ymax, xmax], "length": 0.0, "width": 0.0, "thickness": 0.0, "area": 0.0, "volume": 0.0, "quantity": 1}}],
        "steel_bars":[{{"id": "steel_1", "label": "T10", "box_2d": [ymin, xmin, ymax, xmax], "diameter": 10.0, "length": 0.0, "quantity": 1, "weight": 0.0}}]
    }}
}}

CRITICAL:
1. TRANSLATE ALL TEXT TO ENGLISH. No Arabic allowed.
2. Populate BOTH "architectural" and "civil" sections from the drawing.
3. Every element MUST include a unique "id" string and a "box_2d" array [ymin, xmin, ymax, xmax] normalized on a 0 to 1000 scale.
4. Compute all volumes and weights as described in the schemas.
5. Return JSON only.
"""

    # --------------------------------------------------
    # Analyze methods
    # --------------------------------------------------

    def analyze_architectural(self) -> VisionResult:
        ocr_data = self._load_ocr()
        images   = self._collect_images()

        if not images:
            raise RuntimeError("No normalized images found.")

        prompt   = self._prompt_architectural(ocr_data)
        response = self.provider.analyze(prompt=prompt, image_paths=images)

        save_json(response, VISION_OUTPUT)
        print_success("Architectural vision analysis completed.")
        return VisionResult.model_validate(response)

    def analyze_civil(self) -> CivilResult:
        ocr_data = self._load_ocr()
        images   = self._collect_images()

        if not images:
            raise RuntimeError("No normalized images found.")

        prompt   = self._prompt_civil(ocr_data)
        response = self.provider.analyze(prompt=prompt, image_paths=images)

        save_json(response, VISION_OUTPUT)
        print_success("Civil vision analysis completed.")
        return CivilResult.model_validate(response)

    def analyze_mixed(self) -> MixedResult:
        ocr_data = self._load_ocr()
        images   = self._collect_images()

        if not images:
            raise RuntimeError("No normalized images found.")

        prompt   = self._prompt_mixed(ocr_data)
        response = self.provider.analyze(prompt=prompt, image_paths=images)

        save_json(response, VISION_OUTPUT)
        print_success("Mixed vision analysis completed.")
        return MixedResult.model_validate(response)

    # --------------------------------------------------
    # Main dispatcher
    # --------------------------------------------------

    def analyze(
        self,
        drawing_type: DrawingType = DrawingType.ARCHITECTURAL,
    ) -> VisionResult | CivilResult | MixedResult:
        """
        Dispatcher — picks the right prompt based on drawing_type.
        Returns the appropriate result model.
        """

        dispatch = {
            DrawingType.ARCHITECTURAL: self.analyze_architectural,
            DrawingType.CIVIL:         self.analyze_civil,
            DrawingType.MIXED:         self.analyze_mixed,
        }

        return dispatch[drawing_type]()


# ──────────────────────────────────────────────────────
# Standalone test
# ──────────────────────────────────────────────────────

if __name__ == "__main__":

    import sys

    type_arg = sys.argv[1] if len(sys.argv) > 1 else "architectural"

    try:
        drawing_type = DrawingType(type_arg)
    except ValueError:
        print(f"Unknown drawing type: {type_arg}")
        print("Valid: architectural | civil | mixed")
        sys.exit(1)

    try:
        analyzer = VisionAnalyzer()
        result   = analyzer.analyze(drawing_type)
        print(result.model_dump_json(indent=4))

    except Exception as exc:
        print_error("Vision failed", exc)