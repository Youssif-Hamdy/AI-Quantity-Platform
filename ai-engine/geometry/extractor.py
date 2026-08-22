"""
Geometry Extractor

Sends a spatial-aware prompt to Gemini Vision and extracts
normalized polygon coordinates for every element in the drawing.

Key differences from the old VisionAnalyzer:
  - Asks for POLYGONS / POINTS, not just lengths and widths
  - Coordinates are normalized (0.0 → 1.0) relative to image size
  - Dimension TEXT is copied verbatim from the drawing
  - Image dimensions are detected first and injected into the prompt
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image  # pip install Pillow

from config import (
    PARSER_OUTPUT,
    TEMP_DIR,
)
from providers.gemini_provider import GeminiVisionProvider
from models import DrawingType
from geometry.models import (
    ScaleBar,
    Point,
    SpatialRoom,
    SpatialWall,
    SpatialDoor,
    SpatialWindow,
    SpatialColumn,
    SpatialBeam,
    SpatialSlab,
    SpatialSteelBar,
    ColumnGrid,
    SpatialArchitecturalResult,
    SpatialCivilResult,
    SpatialMixedResult,
)
from utils import load_json, save_json, print_success, print_error


# ──────────────────────────────────────────────────────
# Output path
# ──────────────────────────────────────────────────────

from config import OUTPUT_DIR
GEOMETRY_OUTPUT = OUTPUT_DIR / "geometry.json"


# ======================================================
# Extractor
# ======================================================

class GeometryExtractor:
    """
    Extracts spatial geometry from engineering drawings using
    Gemini Vision with a coordinate-aware prompt.
    """

    def __init__(self):
        self.provider  = GeminiVisionProvider()
        self.pages_dir = TEMP_DIR / "pages"

    # --------------------------------------------------
    # Helpers
    # --------------------------------------------------

    def _collect_images(self) -> list[str]:
        if not self.pages_dir.exists():
            return []
        images = sorted(self.pages_dir.glob("*.*"))
        return [str(p) for p in images if p.suffix.lower() in {".png", ".jpg", ".jpeg"}]

    def _load_ocr(self) -> dict:
        if Path(PARSER_OUTPUT).exists():
            return load_json(PARSER_OUTPUT)
        return {}

    def _get_image_dimensions(self, image_path: str) -> tuple[int, int]:
        """Return (width, height) of the first page image in pixels."""
        try:
            with Image.open(image_path) as img:
                return img.width, img.height
        except Exception:
            return 3508, 2480  # A3 @ 300 DPI fallback

    # --------------------------------------------------
    # Prompts
    # --------------------------------------------------

    def _prompt_architectural(
        self,
        ocr_data: dict,
        img_w: int,
        img_h: int,
    ) -> str:
        return f"""
You are a precision architectural drawing parser and coordinate extractor.

Image dimensions: {img_w}px wide × {img_h}px tall.

OCR text extracted from the drawing:
{json.dumps(ocr_data, indent=2)}

YOUR TASK:
Identify every room, wall, door and window in this floor plan.
For each element return its EXACT spatial location.
Use a normalized 0 to 1000 integer scale for all coordinates (0 is top/left, 1000 is bottom/right).

RULES:
0. IGNORE computer UI, toolbars, red dimension lines, or background boxes. Only trace the physical architecture walls.
1. Polygon points must trace the room interior boundary CLOCKWISE.
2. Copy dimension text EXACTLY as it appears in the drawing
   (e.g. "3.50 x 4.00 m", "350 x 400", "L=5.0m").
3. If a scale bar is visible, record its text and estimated ratio.
4. Walls are line segments — give start and end points.
5. Doors: give the center of the door symbol.
6. Windows: give the center of the window opening.
7. TRANSLATE all names / labels to English.
8. Return ONLY valid JSON — no markdown, no explanation.

JSON schema:
{{
  "scale_bar": {{
    "text": "1:100",
    "ratio": 100,
    "confidence": 0.9
  }},
  "rooms": [
    {{
      "id": "R1",
      "name": "Living Room",
      "polygon": [
        {{"x": 50, "y": 100}},
        {{"x": 450, "y": 100}},
        {{"x": 450, "y": 550}},
        {{"x": 50, "y": 550}}
      ],
      "label_position": {{"x": 250, "y": 320}},
      "dimensions_text": "3.50 x 4.00 m",
      "walls": [
        {{
          "start": {{"x": 50, "y": 100}},
          "end":   {{"x": 450, "y": 100}},
          "thickness_text": "25 cm"
        }}
      ],
      "doors": [
        {{
          "label": "D1",
          "position": {{"x": 60, "y": 300}},
          "width_text": "0.90 m",
          "height_text": "2.10 m",
          "swing_direction": "in"
        }}
      ],
      "windows": [
        {{
          "label": "W1",
          "position": {{"x": 250, "y": 100}},
          "width_text": "1.20 m",
          "height_text": "1.20 m"
        }}
      ]
    }}
  ]
}}
"""

    def _prompt_civil(
        self,
        ocr_data: dict,
        img_w: int,
        img_h: int,
    ) -> str:
        return f"""
You are a precision structural drawing parser and coordinate extractor.

Image dimensions: {img_w}px wide × {img_h}px tall.

OCR text extracted from the drawing:
{json.dumps(ocr_data, indent=2)}

YOUR TASK:
Identify every column, beam, slab and steel bar in this structural drawing.
For each element return its EXACT spatial location.
Use a normalized 0 to 1000 integer scale for all coordinates (0 is top/left, 1000 is bottom/right).

RULES:
0. IGNORE computer UI, toolbars, or dimension lines. Trace the actual elements.
1. Columns: give the CENTER point of the column symbol.
2. Beams: give start and end points (center-line of beam).
3. Slabs: trace the slab boundary as a CLOCKWISE polygon.
4. Copy size text EXACTLY (e.g. "30x30 cm", "25x50", "T=20cm").
5. If a scale bar is visible, record its text and estimated ratio.
6. If a column grid (axes A-B-C / 1-2-3) is present, record axis labels.
7. TRANSLATE all labels to English.
8. Return ONLY valid JSON — no markdown, no explanation.

JSON schema:
{{
  "scale_bar": {{
    "text": "1:100",
    "ratio": 100,
    "confidence": 0.9
  }},
  "column_grid": {{
    "x_axes": ["A", "B", "C"],
    "y_axes": ["1", "2", "3"],
    "columns": [
      {{
        "id": "C1",
        "label": "C1",
        "center": {{"x": 100, "y": 120}},
        "size_text": "30x30 cm"
      }}
    ]
  }},
  "beams": [
    {{
      "id": "B1",
      "label": "B1",
      "start": {{"x": 100, "y": 120}},
      "end":   {{"x": 400, "y": 120}},
      "size_text": "25x50 cm"
    }}
  ],
  "slabs": [
    {{
      "id": "S1",
      "label": "S1",
      "polygon": [
        {{"x": 100, "y": 120}},
        {{"x": 400, "y": 120}},
        {{"x": 400, "y": 450}},
        {{"x": 100, "y": 450}}
      ],
      "thickness_text": "20 cm"
    }}
  ],
  "steel_bars": [
    {{
      "id": "ST1",
      "label": "T12",
      "diameter_mm": 12.0,
      "length_m": 6.0,
      "quantity": 10
    }}
  ]
}}
"""

    def _prompt_mixed(
        self,
        ocr_data: dict,
        img_w: int,
        img_h: int,
    ) -> str:
        return f"""
You are a precision engineering drawing parser and coordinate extractor.

Image dimensions: {img_w}px wide × {img_h}px tall.

OCR text extracted from the drawing:
{json.dumps(ocr_data, indent=2)}

YOUR TASK:
This drawing contains BOTH architectural and structural elements.
Extract ALL elements with their spatial locations.
Use a normalized 0 to 1000 integer scale for all coordinates (0 is top/left, 1000 is bottom/right).

RULES:
0. IGNORE computer UI, toolbars, or dimension lines. Trace the actual building elements.
1. Separate elements into "architectural" and "civil" sections.
2. Rooms → clockwise polygon.  Columns → center point.
3. Beams → start + end points.  Slabs → clockwise polygon.
4. Copy dimension/size text EXACTLY as written.
5. If a scale bar is visible, record its text and estimated ratio.
6. TRANSLATE all labels to English.
7. Return ONLY valid JSON — no markdown, no explanation.

JSON schema:
{{
  "scale_bar": {{
    "text": "1:100",
    "ratio": 100,
    "confidence": 0.9
  }},
  "architectural": {{
    "rooms": [
      {{
        "id": "R1",
        "name": "Living Room",
        "polygon": [{{"x": 0.05, "y": 0.10}}, {{"x": 0.45, "y": 0.10}},
                    {{"x": 0.45, "y": 0.55}}, {{"x": 0.05, "y": 0.55}}],
        "label_position": {{"x": 0.25, "y": 0.32}},
        "dimensions_text": "3.50 x 4.00 m",
        "walls": [
          {{"start": {{"x": 0.05, "y": 0.10}}, "end": {{"x": 0.45, "y": 0.10}},
            "thickness_text": "25 cm"}}
        ],
        "doors":   [{{"label": "D1", "position": {{"x": 0.06, "y": 0.30}},
                      "width_text": "0.90 m", "swing_direction": "in"}}],
        "windows": [{{"label": "W1", "position": {{"x": 0.25, "y": 0.10}},
                      "width_text": "1.20 m"}}]
      }}
    ]
  }},
  "civil": {{
    "column_grid": {{
      "x_axes": ["A", "B", "C"],
      "y_axes": ["1", "2", "3"],
      "columns": [
        {{"id": "C1", "label": "C1", "center": {{"x": 0.10, "y": 0.12}},
          "size_text": "30x30 cm"}}
      ]
    }},
    "beams": [{{"id": "B1", "label": "B1",
                "start": {{"x": 0.10, "y": 0.12}}, "end": {{"x": 0.40, "y": 0.12}},
                "size_text": "25x50 cm"}}],
    "slabs": [{{"id": "S1", "label": "S1",
                "polygon": [{{"x": 0.10, "y": 0.12}}, {{"x": 0.40, "y": 0.12}},
                             {{"x": 0.40, "y": 0.45}}, {{"x": 0.10, "y": 0.45}}],
                "thickness_text": "20 cm"}}],
    "steel_bars": [{{"id": "ST1", "label": "T12", "diameter_mm": 12.0,
                     "length_m": 6.0, "quantity": 10}}]
  }}
}}
"""

    # --------------------------------------------------
    # Parsers (raw AI dict → typed models)
    # --------------------------------------------------

    def _parse_point(self, raw: dict | None) -> Point | None:
        if not raw:
            return None
        x_val = float(raw.get("x", 0))
        y_val = float(raw.get("y", 0))
        if x_val > 1.0 or y_val > 1.0:
            x_val /= 1000.0
            y_val /= 1000.0
        return Point(x=x_val, y=y_val)

    def _parse_polygon(self, raw_list: list[dict]) -> list[Point]:
        pts = []
        for p in (raw_list or []):
            x_val = float(p.get("x", 0))
            y_val = float(p.get("y", 0))
            if x_val > 1.0 or y_val > 1.0:
                x_val /= 1000.0
                y_val /= 1000.0
            pts.append(Point(x=x_val, y=y_val))
        return pts

    def _parse_scale_bar(self, raw: dict) -> ScaleBar:
        return ScaleBar(
            text=str(raw.get("text", "")),
            ratio=float(raw["ratio"]) if raw.get("ratio") else None,
            confidence=float(raw.get("confidence", 0.0)),
        )

    def _parse_architectural(
        self,
        raw: dict,
        img_w: int,
        img_h: int,
    ) -> SpatialArchitecturalResult:
        scale_bar = self._parse_scale_bar(raw.get("scale_bar") or {})
        rooms: list[SpatialRoom] = []

        for i, r in enumerate(raw.get("rooms") or []):
            walls = [
                SpatialWall(
                    start=self._parse_point(w.get("start")) or Point(x=0, y=0),
                    end=self._parse_point(w.get("end")) or Point(x=0, y=0),
                    thickness_text=w.get("thickness_text"),
                )
                for w in (r.get("walls") or [])
            ]
            doors = [
                SpatialDoor(
                    label=d.get("label"),
                    width_text=d.get("width_text"),
                    height_text=d.get("height_text"),
                    position=self._parse_point(d.get("position")),
                    swing_direction=d.get("swing_direction", "unknown"),
                )
                for d in (r.get("doors") or [])
            ]
            windows = [
                SpatialWindow(
                    label=w.get("label"),
                    width_text=w.get("width_text"),
                    height_text=w.get("height_text"),
                    position=self._parse_point(w.get("position")),
                )
                for w in (r.get("windows") or [])
            ]
            rooms.append(
                SpatialRoom(
                    id=r.get("id") or f"R{i + 1}",
                    name=r.get("name") or f"Room {i + 1}",
                    polygon=self._parse_polygon(r.get("polygon") or []),
                    label_position=self._parse_point(r.get("label_position")),
                    dimensions_text=r.get("dimensions_text"),
                    walls=walls,
                    doors=doors,
                    windows=windows,
                )
            )

        return SpatialArchitecturalResult(
            scale_bar=scale_bar,
            image_width_px=img_w,
            image_height_px=img_h,
            rooms=rooms,
        )

    def _parse_civil(
        self,
        raw: dict,
        img_w: int,
        img_h: int,
    ) -> SpatialCivilResult:
        scale_bar  = self._parse_scale_bar(raw.get("scale_bar") or {})
        grid_raw   = raw.get("column_grid") or {}
        columns    = [
            SpatialColumn(
                id=c.get("id") or f"C{i + 1}",
                label=c.get("label"),
                center=self._parse_point(c.get("center")) or Point(x=0, y=0),
                size_text=c.get("size_text"),
            )
            for i, c in enumerate(grid_raw.get("columns") or [])
        ]
        column_grid = ColumnGrid(
            x_axes=grid_raw.get("x_axes") or [],
            y_axes=grid_raw.get("y_axes") or [],
            columns=columns,
        )
        beams = [
            SpatialBeam(
                id=b.get("id") or f"B{i + 1}",
                label=b.get("label"),
                start=self._parse_point(b.get("start")) or Point(x=0, y=0),
                end=self._parse_point(b.get("end")) or Point(x=0, y=0),
                size_text=b.get("size_text"),
            )
            for i, b in enumerate(raw.get("beams") or [])
        ]
        slabs = [
            SpatialSlab(
                id=s.get("id") or f"S{i + 1}",
                label=s.get("label"),
                polygon=self._parse_polygon(s.get("polygon") or []),
                thickness_text=s.get("thickness_text"),
            )
            for i, s in enumerate(raw.get("slabs") or [])
        ]
        steel_bars = [
            SpatialSteelBar(
                id=st.get("id") or f"ST{i + 1}",
                label=st.get("label"),
                diameter_mm=float(st["diameter_mm"]) if st.get("diameter_mm") else None,
                length_m=float(st["length_m"]) if st.get("length_m") else None,
                quantity=int(st.get("quantity") or 1),
            )
            for i, st in enumerate(raw.get("steel_bars") or [])
        ]

        return SpatialCivilResult(
            scale_bar=scale_bar,
            image_width_px=img_w,
            image_height_px=img_h,
            column_grid=column_grid,
            beams=beams,
            slabs=slabs,
            steel_bars=steel_bars,
        )

    # --------------------------------------------------
    # Public extraction methods
    # --------------------------------------------------

    # --------------------------------------------------
    # Public extraction methods
    # --------------------------------------------------

    def extract_architectural(self) -> SpatialArchitecturalResult:
        images = self._collect_images()
        if not images:
            raise RuntimeError("No normalized images found. Run normalizer first.")
            
        from geometry.master_extractor import MasterExtractor
        master_ext = MasterExtractor()
        
        # We need the actual image dimensions to populate the JSON properly
        img_w, img_h = self._get_image_dimensions(images[0])
        
        result_dict = master_ext.extract(images[0], img_w, img_h)
        
        if result_dict.get("quality_error"):
            print_error(result_dict["quality_error"])
            save_json(result_dict, GEOMETRY_OUTPUT)
            import sys
            sys.exit(1)
            
        # Map back to SpatialArchitecturalResult
        from geometry.models import SpatialArchitecturalResult, SpatialRoom, Point
        
        rooms = []
        for elem in result_dict.get("elements", []):
            if elem.get("type") == "room" or not elem.get("type"):
                # Convert PIXEL coordinates back to NORMALIZED 0-1 for the internal pipeline
                poly = []
                for p in elem.get("polygon", []):
                    px = p.get("x", 0)
                    py = p.get("y", 0)
                    poly.append(Point(x=px, y=py))
                        
                metrics = elem.get("metrics", {})
                
                # Try to parse area if it exists
                area_m2 = None
                area_str = metrics.get("area", "")
                if area_str:
                    try:
                        import re
                        num = re.sub(r'[^\d.]', '', area_str)
                        if num: area_m2 = float(num)
                    except Exception:
                        pass

                # Parse and normalize label_position
                label_pos = None
                lp = elem.get("label_position")
                if lp and isinstance(lp, dict):
                    lx, ly = lp.get("x", 0), lp.get("y", 0)
                    label_pos = Point(x=lx, y=ly)

                rooms.append(SpatialRoom(
                    id=elem.get("id", f"R{len(rooms)}"),
                    name=elem.get("name", ""),
                    polygon=poly,
                    label_position=label_pos,
                    dimensions_text=metrics.get("dimensions", ""),
                    area_m2=area_m2,
                ))
                
        result = SpatialArchitecturalResult(
            image_width_px=img_w,
            image_height_px=img_h,
            rooms=rooms
        )
        
        save_json(result.model_dump(), GEOMETRY_OUTPUT)
        
        print_success(f"Architectural geometry extracted — {len(rooms)} room(s).")
        
        # 4. Generate Visual Preview
        try:
            from tools.coord_editor import preview_static
            preview_static(images[0], GEOMETRY_OUTPUT, OUTPUT_DIR / "preview.png")
            print_success(f"Visual preview generated at {OUTPUT_DIR / 'preview.png'}")
        except Exception as e:
            print_error("Failed to generate static preview image", e)
            
        return result

    def extract_civil(self) -> SpatialCivilResult:
        images = self._collect_images()
        if not images:
            raise RuntimeError("No normalized images found. Run normalizer first.")
            
        from geometry.smart_extractor import SmartExtractor
        smart_ext = SmartExtractor()
        smart_res = smart_ext.extract(images[0], "civil")
        result = smart_ext.to_civil(smart_res)
        
        save_json(result.model_dump(), GEOMETRY_OUTPUT)
        print_success(f"Civil geometry extracted — {len(result.column_grid.columns)} column(s).")
        
        # 4. Generate Visual Preview
        try:
            from tools.coord_editor import preview_static
            preview_static(images[0], GEOMETRY_OUTPUT, OUTPUT_DIR / "preview.png")
            print_success(f"Visual preview generated at {OUTPUT_DIR / 'preview.png'}")
        except Exception as e:
            print_error("Failed to generate static preview image", e)
            
        return result

    def extract_mixed(self) -> SpatialMixedResult:
        images = self._collect_images()
        if not images:
            raise RuntimeError("No normalized images found. Run normalizer first.")
            
        # For mixed, we just run both and combine them
        from geometry.smart_extractor import SmartExtractor
        smart_ext = SmartExtractor()
        
        print_step("Extracting Architectural Elements")
        smart_arch = smart_ext.extract(images[0], "architectural")
        arch_res = smart_ext.to_architectural(smart_arch)
        
        print_step("Extracting Civil Elements")
        smart_civil = smart_ext.extract(images[0], "civil")
        civil_res = smart_ext.to_civil(smart_civil)
        
        result = SpatialMixedResult(
            scale_bar=arch_res.scale_bar,
            image_width_px=arch_res.image_width_px,
            image_height_px=arch_res.image_height_px,
            architectural=arch_res,
            civil=civil_res,
        )
        
        save_json(result.model_dump(), GEOMETRY_OUTPUT)
        print_success("Mixed geometry extracted.")
        
        # 4. Generate Visual Preview
        try:
            from tools.coord_editor import preview_static
            preview_static(images[0], GEOMETRY_OUTPUT, OUTPUT_DIR / "preview.png")
            print_success(f"Visual preview generated at {OUTPUT_DIR / 'preview.png'}")
        except Exception as e:
            print_error("Failed to generate static preview image", e)
            
        return result

    # --------------------------------------------------
    # Dispatcher
    # --------------------------------------------------

    def extract(
        self,
        drawing_type: DrawingType = DrawingType.ARCHITECTURAL,
    ) -> SpatialArchitecturalResult | SpatialCivilResult | SpatialMixedResult:
        dispatch = {
            DrawingType.ARCHITECTURAL: self.extract_architectural,
            DrawingType.CIVIL:         self.extract_civil,
            DrawingType.MIXED:         self.extract_mixed,
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
        sys.exit(1)

    try:
        extractor = GeometryExtractor()
        result    = extractor.extract(drawing_type)
        print(result.model_dump_json(indent=4))
    except Exception as exc:
        print_error("Extraction failed", exc)
