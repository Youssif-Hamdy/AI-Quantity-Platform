"""
Smart Extractor — High-Accuracy Coordinate Extraction

Strategy: "AI understands + CV locates"

Phase 1: AI Bounding Box Detection
  → Send full image to Gemini → get bounding boxes per element (NOT polygons)
  → Bounding boxes are much easier for AI to estimate accurately

Phase 2: Region Cropping + CV Precision
  → Crop each detected region from the original image
  → Run OpenCV contour detection on each crop → pixel-exact boundaries
  → Map crop-local coordinates back to full-image normalized coords

Phase 3: AI Verification Pass
  → Send each crop + detected polygon back to Gemini
  → Ask: "Is this polygon correct? Adjust if needed."
  → Working on a small, focused image = much better accuracy

Phase 4: Confidence Scoring & Report
  → Score each element based on AI-CV agreement
  → Flag low-confidence elements for manual review
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from dataclasses import dataclass, field

import cv2
import numpy as np

from geometry.models import (
    Point,
    ScaleBar,
    SpatialRoom,
    SpatialWall,
    SpatialDoor,
    SpatialWindow,
    SpatialArchitecturalResult,
    SpatialCivilResult,
    SpatialMixedResult,
    SpatialColumn,
    SpatialBeam,
    SpatialSlab,
    ColumnGrid,
)
from geometry.grid_overlay import (
    draw_grid,
    crop_region,
    normalized_bbox_to_pixels,
)
from providers.gemini_provider import GeminiVisionProvider
from config import TEMP_DIR, OUTPUT_DIR
from utils import print_step, print_success, print_error, save_json


# ======================================================
# Schemas for Structured Output
# ======================================================

# Phase 1: Bounding box detection schema
BBOX_DETECTION_SCHEMA = {
    "type": "object",
    "properties": {
        "scale_bar": {
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "ratio": {"type": "number"},
            },
        },
        "elements": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id":   {"type": "string"},
                    "name": {"type": "string"},
                    "type": {
                        "type": "string",
                        "enum": ["room", "column", "beam", "slab", "door", "window", "wall"],
                    },
                    "box_2d": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "Bounding box [y_min, x_min, y_max, x_max] on 0-1000 scale",
                    },
                    "dimensions_text": {"type": "string"},
                    "label": {"type": "string"},
                },
                "required": ["id", "name", "type", "box_2d"],
            },
        },
    },
    "required": ["elements"],
}

# Phase 3: Verification schema for a single region
VERIFICATION_SCHEMA = {
    "type": "object",
    "properties": {
        "polygon_correct": {"type": "boolean"},
        "adjusted_polygon": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "x": {"type": "integer"},
                    "y": {"type": "integer"},
                },
                "required": ["x", "y"],
            },
            "description": "Corrected polygon points on 0-1000 scale relative to the cropped region",
        },
        "element_name": {"type": "string"},
        "confidence": {"type": "number"},
    },
    "required": ["polygon_correct", "adjusted_polygon", "element_name", "confidence"],
}


# ======================================================
# Result container
# ======================================================

@dataclass
class SmartElement:
    """A single detected element with full provenance."""
    id: str
    name: str
    element_type: str                    # room, column, beam, etc.
    bbox_norm: list[int]                 # [y_min, x_min, y_max, x_max] 0-1000
    bbox_px: tuple[int, int, int, int]   # (x_min, y_min, x_max, y_max) pixels
    polygon_px: list[tuple[int, int]] = field(default_factory=list)   # pixel coords
    polygon_norm: list[Point] = field(default_factory=list)           # 0.0-1.0
    confidence: float = 0.0
    dimensions_text: str = ""
    ai_verified: bool = False
    crop_path: str = ""


@dataclass
class SmartExtractionResult:
    """Full result from smart extraction."""
    elements: list[SmartElement] = field(default_factory=list)
    scale_bar: ScaleBar = field(default_factory=ScaleBar)
    image_width_px: int = 0
    image_height_px: int = 0
    debug_dir: str = ""


# ======================================================
# Smart Extractor
# ======================================================

class SmartExtractor:
    """
    High-accuracy coordinate extractor using AI+CV hybrid approach.
    """

    def __init__(self):
        self.provider = GeminiVisionProvider()
        self.crops_dir = TEMP_DIR / "crops"
        self.crops_dir.mkdir(parents=True, exist_ok=True)

    # --------------------------------------------------
    # Main entry point
    # --------------------------------------------------

    def extract(
        self,
        image_path: str | Path,
        drawing_type: str = "architectural",
    ) -> SmartExtractionResult:
        """
        Run the full 4-phase extraction pipeline.

        Args:
            image_path:   Path to the drawing image.
            drawing_type: "architectural", "civil", or "mixed".

        Returns:
            SmartExtractionResult with all detected elements.
        """
        image_path = Path(image_path)
        img = cv2.imread(str(image_path))
        if img is None:
            raise FileNotFoundError(f"Cannot read image: {image_path}")

        img_h, img_w = img.shape[:2]

        print_step("Phase 1/4 — AI Bounding Box Detection")
        elements = self._phase1_detect_bboxes(image_path, img_w, img_h, drawing_type)
        print_success(f"Detected {len(elements)} element(s)")

        print_step("Phase 2/4 — Region Cropping + CV Precision")
        elements = self._phase2_cv_precision(image_path, elements, img_w, img_h)
        print_success(f"CV analysis complete for {len(elements)} region(s)")

        print_step("Phase 3/4 — AI Verification Pass")
        elements = self._phase3_verify(elements, img_w, img_h)
        verified = sum(1 for e in elements if e.ai_verified)
        print_success(f"Verified {verified}/{len(elements)} element(s)")

        print_step("Phase 4/4 — Confidence Scoring")
        result = SmartExtractionResult(
            elements=elements,
            image_width_px=img_w,
            image_height_px=img_h,
            debug_dir=str(self.crops_dir),
        )
        self._phase4_score(result)

        return result

    # --------------------------------------------------
    # Phase 1: AI Bounding Box Detection
    # --------------------------------------------------

    def _phase1_detect_bboxes(
        self,
        image_path: Path,
        img_w: int,
        img_h: int,
        drawing_type: str,
    ) -> list[SmartElement]:
        """Send full image to Gemini → get bounding boxes."""

        # Draw grid for reference
        grid_path = draw_grid(
            image_path,
            output_path=self.crops_dir / "full_with_grid.png",
            grid_size=max(img_w, img_h) // 10,
            alpha=0.25,
        )

        prompt = self._bbox_prompt(drawing_type, img_w, img_h)

        response = self.provider.analyze_with_schema(
            prompt=prompt,
            image_paths=[grid_path],
            response_schema=BBOX_DETECTION_SCHEMA,
            thinking_budget=0,
        )

        # Handle raw_response fallback
        if "raw_response" in response:
            print_error("Phase 1: Could not parse structured output, trying raw...")
            try:
                raw = response["raw_response"]
                start = raw.index("{")
                end = raw.rindex("}") + 1
                response = json.loads(raw[start:end])
            except Exception:
                print_error("Phase 1: Failed to parse any response")
                return []

        # Parse scale bar
        scale_raw = response.get("scale_bar") or {}

        elements: list[SmartElement] = []
        for item in response.get("elements", []):
            bbox_norm = item.get("box_2d", [0, 0, 0, 0])

            # Validate bbox
            if len(bbox_norm) != 4:
                continue
            if all(v == 0 for v in bbox_norm):
                continue

            bbox_px = normalized_bbox_to_pixels(bbox_norm, img_w, img_h)

            elements.append(SmartElement(
                id=item.get("id", f"E{len(elements)+1}"),
                name=item.get("name", "Unknown"),
                element_type=item.get("type", "room"),
                bbox_norm=bbox_norm,
                bbox_px=bbox_px,
                dimensions_text=item.get("dimensions_text", ""),
                confidence=0.5,  # Initial confidence
            ))

        return elements

    def _bbox_prompt(self, drawing_type: str, img_w: int, img_h: int) -> str:
        """Build the bounding box detection prompt."""

        type_elements = {
            "architectural": "rooms, doors, windows",
            "civil":         "columns, beams, slabs",
            "mixed":         "rooms, doors, windows, columns, beams, slabs",
        }
        targets = type_elements.get(drawing_type, "rooms, doors, windows")

        return f"""You are an expert engineering drawing analyzer extracting bounding boxes for {targets}.

Image dimensions: {img_w}px × {img_h}px
A numbered grid overlay is drawn for reference.

YOUR TASK:
Detect EVERY {targets} in this drawing.
For each element, return ONLY its bounding box — NOT a polygon.

CRITICAL RULES:
1. COMPLETENESS: Extract EVERY labeled space (bedrooms, bathrooms, stores, passages, staircases, cutouts, balconies). Do not skip small or irregularly shaped spaces.
2. WALL-ACCURATE TRACING: Each bounding box edge must align exactly with a wall line. Do not approximate.
3. SHARED WALLS: If two rooms share a wall, their bounding boxes MUST meet EXACTLY at that wall (no gap, no overlap).
4. NO CROSS-CONTAMINATION: A room's box must only include its own enclosed area. Do NOT extend into neighboring rooms, passages, staircases, or cutouts.
5. USE DIMENSIONS: Verify the box aspect ratio against written dimensions (e.g., 14'-0" X 17'-9").
6. SELF-VERIFY: Mentally overlay your bounding box on the image before returning the result. Fix any gaps or overlaps.
7. COORDINATES: Return boxes as [y_min, x_min, y_max, x_max] on a 0-1000 scale.
8. TRANSLATE all labels to English and copy dimension text exactly.

Return ONLY valid JSON matching the schema."""

    # --------------------------------------------------
    # Phase 2: CV Precision on each crop
    # --------------------------------------------------

    def _phase2_cv_precision(
        self,
        image_path: Path,
        elements: list[SmartElement],
        img_w: int,
        img_h: int,
    ) -> list[SmartElement]:
        """Crop each bounding box region and run OpenCV for precise contours."""

        for i, elem in enumerate(elements):
            x1, y1, x2, y2 = elem.bbox_px

            # Skip tiny or invalid boxes
            if (x2 - x1) < 10 or (y2 - y1) < 10:
                continue

            # Crop the region
            crop_path, actual_bbox = crop_region(
                image_path,
                elem.bbox_px,
                output_path=self.crops_dir / f"crop_{elem.id}.png",
                padding=30,
            )
            elem.crop_path = crop_path
            elem.bbox_px = actual_bbox  # Update with actual (padded) bbox

            # Run CV on the crop
            if elem.element_type in ("room", "slab"):
                polygon_px = self._cv_detect_polygon(crop_path)
            elif elem.element_type in ("column", "door", "window"):
                polygon_px = self._cv_detect_point_element(crop_path)
            elif elem.element_type in ("wall", "beam"):
                polygon_px = self._cv_detect_line(crop_path)
            else:
                polygon_px = self._cv_detect_polygon(crop_path)

            if polygon_px:
                # Convert crop-local pixels → full-image normalized coords
                ax1, ay1, ax2, ay2 = elem.bbox_px
                elem.polygon_px = polygon_px
                elem.polygon_norm = []
                for px, py in polygon_px:
                    # crop-local → full-image pixel
                    full_px = ax1 + px
                    full_py = ay1 + py
                    # full-image pixel → normalized 0.0-1.0
                    elem.polygon_norm.append(Point(
                        x=round(full_px / img_w, 6),
                        y=round(full_py / img_h, 6),
                    ))
                elem.confidence = 0.7  # CV detection boosts confidence

        return elements

    def _cv_detect_polygon(self, crop_path: str) -> list[tuple[int, int]]:
        """Detect the largest closed contour in a cropped region."""
        img = cv2.imread(crop_path)
        if img is None:
            return []

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape

        # Adaptive threshold
        binary = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV, 15, 8,
        )

        # Morphological close to connect gaps
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=2)

        # Find contours
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if not contours:
            # Fallback: return bbox as polygon
            return [(0, 0), (w, 0), (w, h), (0, h)]

        # Find the largest contour
        largest = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(largest)

        # Too small = noise
        if area < (w * h * 0.05):
            return [(0, 0), (w, 0), (w, h), (0, h)]

        # Approximate to polygon
        epsilon = 0.02 * cv2.arcLength(largest, True)
        approx = cv2.approxPolyDP(largest, epsilon, True)

        points = [(int(p[0][0]), int(p[0][1])) for p in approx]

        # Ensure at least 4 points
        if len(points) < 4:
            return [(0, 0), (w, 0), (w, h), (0, h)]

        return points

    def _cv_detect_point_element(self, crop_path: str) -> list[tuple[int, int]]:
        """Detect center of a small element (column, door, window)."""
        img = cv2.imread(crop_path)
        if img is None:
            return []

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape

        # Return center point as a 1-point "polygon"
        return [(w // 2, h // 2)]

    def _cv_detect_line(self, crop_path: str) -> list[tuple[int, int]]:
        """Detect the dominant line in a crop (for walls/beams)."""
        img = cv2.imread(crop_path)
        if img is None:
            return []

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape
        edges = cv2.Canny(gray, 50, 150)

        lines = cv2.HoughLinesP(
            edges, 1, math.pi / 180,
            threshold=30, minLineLength=min(w, h) // 3, maxLineGap=10,
        )

        if lines is None or len(lines) == 0:
            return [(0, h // 2), (w, h // 2)]

        # Find longest line
        best_line = None
        best_length = 0
        for line in lines:
            val = line.ravel()
            if len(val) == 4:
                x1, y1, x2, y2 = val
                length = math.hypot(x2 - x1, y2 - y1)
                if length > best_length:
                    best_length = length
                    best_line = (int(x1), int(y1), int(x2), int(y2))

        if best_line:
            return [(best_line[0], best_line[1]), (best_line[2], best_line[3])]

        return [(0, h // 2), (w, h // 2)]

    # --------------------------------------------------
    # Phase 3: AI Verification
    # --------------------------------------------------

    def _phase3_verify(
        self,
        elements: list[SmartElement],
        img_w: int,
        img_h: int,
    ) -> list[SmartElement]:
        """Send each crop + detected polygon to AI for verification."""

        for elem in elements:
            if not elem.crop_path or not elem.polygon_px:
                continue

            crop_img = cv2.imread(elem.crop_path)
            if crop_img is None:
                continue

            crop_h, crop_w = crop_img.shape[:2]

            # Draw detected polygon on the crop
            if len(elem.polygon_px) >= 3:
                pts = np.array(elem.polygon_px, dtype=np.int32).reshape(-1, 1, 2)
                debug_img = crop_img.copy()
                cv2.polylines(debug_img, [pts], True, (0, 255, 0), 2)
                debug_path = str(self.crops_dir / f"verify_{elem.id}.png")
                cv2.imwrite(debug_path, debug_img)
                verify_image = debug_path
            else:
                verify_image = elem.crop_path

            # Convert polygon to 0-1000 scale relative to crop
            poly_for_ai = []
            for px, py in elem.polygon_px:
                poly_for_ai.append({
                    "x": int(px / crop_w * 1000),
                    "y": int(py / crop_h * 1000),
                })

            prompt = f"""You are extracting and validating room polygons from an architectural floor plan crop.
Crop dimensions: {crop_w}px × {crop_h}px

A GREEN polygon has been drawn on the image showing the detected boundary of a "{elem.name}" ({elem.element_type}).
Current polygon (0-1000 scale relative to this crop):
{json.dumps(poly_for_ai)}

TASK:
1. Is this polygon correctly tracing the {elem.element_type} boundary?
2. If NOT correct, provide the adjusted polygon points on the same 0-1000 scale.
3. If correct, return the same polygon.
4. What is the element name/label?
5. How confident are you (0.0 to 1.0)?

CRITICAL RULES FOR POLYGON ADJUSTMENT:
1. WALL-ACCURATE TRACING: Each polygon vertex must sit exactly on a wall line or corner. Never approximate. The polygon must be the SIMPLEST shape that matches the actual walls (usually a rectangle or a rectangle with 1-2 notches). Do NOT add extra vertices for noise (door swings, text boxes, hatching).
2. NO CROSS-CONTAMINATION: The polygon must only include area enclosed by its own walls. Do NOT extend into a neighboring room, passage, staircase void, or cutout.
3. MANDATORY SELF-VALIDATION STEP: You MUST actually look at the rendered green polygon overlay. Does it sit exactly on the wall? Does it leave gaps, cross walls, or bleed into a neighboring space? If you find ANY mismatch, fix the coordinates.
4. COORDINATES: Use the 0-1000 scale (which provides 3 decimal places of precision when converted to 0.000-1.000).

Return ONLY valid JSON matching the schema."""

            try:
                response = self.provider.analyze_with_schema(
                    prompt=prompt,
                    image_paths=[verify_image],
                    response_schema=VERIFICATION_SCHEMA,
                    thinking_budget=0,
                )

                if "raw_response" not in response:
                    # Update polygon if adjusted
                    adjusted = response.get("adjusted_polygon", [])
                    if adjusted and len(adjusted) >= 3:
                        # Convert back from crop-1000 to crop-pixel to full-pixel
                        new_polygon_px = []
                        new_polygon_norm = []
                        ax1, ay1, _, _ = elem.bbox_px

                        for pt in adjusted:
                            # crop-1000 → crop-pixel
                            cpx = int(pt["x"] / 1000 * crop_w)
                            cpy = int(pt["y"] / 1000 * crop_h)
                            new_polygon_px.append((cpx, cpy))

                            # crop-pixel → full-image-pixel → normalized
                            fpx = ax1 + cpx
                            fpy = ay1 + cpy
                            new_polygon_norm.append(Point(
                                x=round(fpx / img_w, 6),
                                y=round(fpy / img_h, 6),
                            ))

                        elem.polygon_px = new_polygon_px
                        elem.polygon_norm = new_polygon_norm

                    # Update metadata
                    ai_name = response.get("element_name", "")
                    if ai_name:
                        elem.name = ai_name

                    ai_conf = response.get("confidence", 0.5)
                    elem.confidence = max(elem.confidence, ai_conf)
                    elem.ai_verified = True

            except Exception as e:
                print_error(f"Verification failed for {elem.id}", e)

        return elements

    # --------------------------------------------------
    # Phase 4: Confidence Scoring
    # --------------------------------------------------

    def _phase4_score(self, result: SmartExtractionResult) -> None:
        """Calculate overall confidence and print report."""

        if not result.elements:
            print_error("No elements detected!")
            return

        total = len(result.elements)
        high = sum(1 for e in result.elements if e.confidence >= 0.8)
        medium = sum(1 for e in result.elements if 0.5 <= e.confidence < 0.8)
        low = sum(1 for e in result.elements if e.confidence < 0.5)

        avg_conf = sum(e.confidence for e in result.elements) / total

        print(f"\n{'='*50}")
        print(f"  Smart Extraction Report")
        print(f"{'='*50}")
        print(f"  Total elements : {total}")
        print(f"  ✅ High (≥80%)  : {high}")
        print(f"  ⚠️  Medium      : {medium}")
        print(f"  ❌ Low (<50%)   : {low}")
        print(f"  Avg confidence : {avg_conf:.0%}")
        print(f"{'='*50}\n")

        for e in result.elements:
            icon = "✅" if e.confidence >= 0.8 else ("⚠️" if e.confidence >= 0.5 else "❌")
            print(f"  {icon} {e.id:>4} | {e.name:<25} | {e.element_type:<8} | {e.confidence:.0%}")

        print()

    # --------------------------------------------------
    # Convert SmartExtractionResult → Spatial Models
    # --------------------------------------------------

    def to_architectural(self, result: SmartExtractionResult) -> SpatialArchitecturalResult:
        """Convert smart extraction result to SpatialArchitecturalResult."""

        rooms: list[SpatialRoom] = []
        room_idx = 0

        for elem in result.elements:
            if elem.element_type == "room":
                room_idx += 1
                polygon = elem.polygon_norm if elem.polygon_norm else self._bbox_to_polygon(
                    elem.bbox_norm, result.image_width_px, result.image_height_px,
                )

                # Build walls from polygon edges
                walls = []
                for j in range(len(polygon)):
                    next_j = (j + 1) % len(polygon)
                    walls.append(SpatialWall(
                        start=polygon[j],
                        end=polygon[next_j],
                    ))

                rooms.append(SpatialRoom(
                    id=elem.id or f"R{room_idx}",
                    name=elem.name,
                    polygon=polygon,
                    dimensions_text=elem.dimensions_text,
                    walls=walls,
                    doors=self._find_elements_in_bbox(result.elements, elem.bbox_px, "door", result),
                    windows=self._find_elements_in_bbox(result.elements, elem.bbox_px, "window", result),
                ))

        return SpatialArchitecturalResult(
            scale_bar=result.scale_bar,
            image_width_px=result.image_width_px,
            image_height_px=result.image_height_px,
            rooms=rooms,
        )

    def to_civil(self, result: SmartExtractionResult) -> SpatialCivilResult:
        """Convert smart extraction result to SpatialCivilResult."""

        columns = []
        beams = []
        slabs = []

        for elem in result.elements:
            if elem.element_type == "column":
                center = elem.polygon_norm[0] if elem.polygon_norm else self._bbox_center(
                    elem.bbox_norm, result.image_width_px, result.image_height_px,
                )
                columns.append(SpatialColumn(
                    id=elem.id,
                    label=elem.name,
                    center=center,
                    size_text=elem.dimensions_text,
                ))

            elif elem.element_type == "beam":
                if len(elem.polygon_norm) >= 2:
                    start, end = elem.polygon_norm[0], elem.polygon_norm[-1]
                else:
                    start, end = self._bbox_line(
                        elem.bbox_norm, result.image_width_px, result.image_height_px,
                    )
                beams.append(SpatialBeam(
                    id=elem.id,
                    label=elem.name,
                    start=start,
                    end=end,
                    size_text=elem.dimensions_text,
                ))

            elif elem.element_type == "slab":
                polygon = elem.polygon_norm if elem.polygon_norm else self._bbox_to_polygon(
                    elem.bbox_norm, result.image_width_px, result.image_height_px,
                )
                slabs.append(SpatialSlab(
                    id=elem.id,
                    label=elem.name,
                    polygon=polygon,
                    thickness_text=elem.dimensions_text,
                ))

        return SpatialCivilResult(
            scale_bar=result.scale_bar,
            image_width_px=result.image_width_px,
            image_height_px=result.image_height_px,
            column_grid=ColumnGrid(columns=columns),
            beams=beams,
            slabs=slabs,
        )

    # --------------------------------------------------
    # Helpers
    # --------------------------------------------------

    @staticmethod
    def _bbox_to_polygon(
        bbox_norm: list[int],
        img_w: int,
        img_h: int,
    ) -> list[Point]:
        """Convert a bbox [y_min, x_min, y_max, x_max] (0-1000) to a 4-point polygon."""
        y_min, x_min, y_max, x_max = bbox_norm
        return [
            Point(x=x_min / 1000, y=y_min / 1000),
            Point(x=x_max / 1000, y=y_min / 1000),
            Point(x=x_max / 1000, y=y_max / 1000),
            Point(x=x_min / 1000, y=y_max / 1000),
        ]

    @staticmethod
    def _bbox_center(
        bbox_norm: list[int],
        img_w: int,
        img_h: int,
    ) -> Point:
        """Get center point of a bbox."""
        y_min, x_min, y_max, x_max = bbox_norm
        return Point(
            x=(x_min + x_max) / 2 / 1000,
            y=(y_min + y_max) / 2 / 1000,
        )

    @staticmethod
    def _bbox_line(
        bbox_norm: list[int],
        img_w: int,
        img_h: int,
    ) -> tuple[Point, Point]:
        """Get start/end line from a bbox (for beams)."""
        y_min, x_min, y_max, x_max = bbox_norm
        cy = (y_min + y_max) / 2 / 1000
        return (
            Point(x=x_min / 1000, y=cy),
            Point(x=x_max / 1000, y=cy),
        )

    @staticmethod
    def _find_elements_in_bbox(
        all_elements: list[SmartElement],
        parent_bbox: tuple[int, int, int, int],
        element_type: str,
        result: SmartExtractionResult,
    ) -> list:
        """Find child elements (doors/windows) within a parent bbox."""
        px1, py1, px2, py2 = parent_bbox
        found = []

        for elem in all_elements:
            if elem.element_type != element_type:
                continue

            # Check if element center is inside parent bbox
            ex1, ey1, ex2, ey2 = elem.bbox_px
            ecx = (ex1 + ex2) // 2
            ecy = (ey1 + ey2) // 2

            if px1 <= ecx <= px2 and py1 <= ecy <= py2:
                center = elem.polygon_norm[0] if elem.polygon_norm else Point(
                    x=ecx / result.image_width_px,
                    y=ecy / result.image_height_px,
                )
                if element_type == "door":
                    found.append(SpatialDoor(
                        label=elem.name,
                        position=center,
                    ))
                elif element_type == "window":
                    found.append(SpatialWindow(
                        label=elem.name,
                        position=center,
                    ))

        return found


# ──────────────────────────────────────────────────────
# Standalone test
# ──────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python -m geometry.smart_extractor <image_path> [drawing_type]")
        sys.exit(1)

    img = sys.argv[1]
    dtype = sys.argv[2] if len(sys.argv) > 2 else "architectural"

    extractor = SmartExtractor()
    result = extractor.extract(img, dtype)

    # Save result
    if dtype == "architectural":
        spatial = extractor.to_architectural(result)
    else:
        spatial = extractor.to_civil(result)

    out_path = OUTPUT_DIR / "geometry.json"
    save_json(spatial.model_dump(), out_path)
    print_success(f"Saved to {out_path}")
