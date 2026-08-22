"""
Master Extractor — Executes the ultimate architectural extraction prompt.
"""

from __future__ import annotations

import json
from pathlib import Path
from dataclasses import dataclass

from providers.gemini_provider import GeminiVisionProvider
from config import TEMP_DIR
from utils import print_step, print_success, print_error


MASTER_SCHEMA = {
    "type": "object",
    "properties": {
        "quality_error": {
            "type": "string",
            "description": "If quality is bad, put the Arabic error message here."
        },
        "width": {"type": "integer"},
        "height": {"type": "integer"},
        "scale_ratio": {"type": "number"},
        "elements": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "type": {"type": "string", "enum": ["room", "wall", "door", "staircase", "passage", "space"]},
                    "name": {"type": "string"},
                    "polygon": {
                        "type": "array",
                        "description": "Array of {x, y} integer PIXEL coordinates. Must have >= 4 points.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "x": {"type": "integer"},
                                "y": {"type": "integer"}
                            }
                        }
                    },
                    "label_position": {
                        "type": "object",
                        "properties": {
                            "x": {"type": "integer"},
                            "y": {"type": "integer"}
                        }
                    },
                    "color": {"type": "string"},
                    "metrics": {
                        "type": "object",
                        "properties": {
                            "dimensions": {"type": "string"},
                            "area": {"type": "string"}
                        }
                    }
                }
            }
        }
    }
}

class MasterExtractor:
    def __init__(self):
        self.provider = GeminiVisionProvider()

    def extract(self, image_path: str | Path, img_w: int, img_h: int) -> dict:
        image_path = Path(image_path)
        if not image_path.exists():
            raise FileNotFoundError(f"Image not found: {image_path}")

        prompt = f"""CRITICAL CORRECTION:

The previous output is incorrect because the coordinates were returned as normalized values between 0 and 1.
DO NOT return normalized coordinates.

The final output MUST use actual pixel coordinates based on the original image:
width = {img_w}
height = {img_h}

For example:
0.5 is NOT an acceptable coordinate.
If the detected point is at the center of the image, return:
{{ "x": {img_w//2}, "y": {img_h//2} }}

NOT:
{{ "x": 0.5, "y": 0.5 }}

Before returning the JSON, convert every coordinate to pixel coordinates.
Coordinate conversion:
pixel_x = normalized_x * {img_w}
pixel_y = normalized_y * {img_h}

However, do NOT rely on this conversion alone.
Re-evaluate the actual architectural wall boundaries from the original image and return the final corrected pixel coordinates.

IMPORTANT:
The polygon must represent the actual INTERIOR ROOM BOUNDARY.
Do not create polygons from room labels.
Do not create polygons from approximate bounding boxes.
Do not include corridors, passages, stairs, doors, or neighboring rooms inside a room polygon.

For every room:
1. Detect its actual walls.
2. Trace the interior boundary.
3. Follow irregular corners and wall offsets.
4. Use 4 points for a true rectangle.
5. Use additional points only when the actual room geometry requires them.
6. Verify that the entire polygon is inside the correct room.
7. Verify that the label_position is inside the polygon.

ROOM COMPLETENESS:
Detect ALL labeled spaces visible in the image.
The uploaded image contains, among others:
- BED ROOM-4
- CHILDREN BED ROOM-3
- ATT. TOILET
- DRESS.
- GADLA STORE
- GEN. TOL
- BED ROOM-2
- LIBRARY / STUDY SPACE
- BALCONY

Do not omit any clearly labeled room or space.

IMPORTANT ROOM CORRECTION:
"CUT OUT" is NOT a normal room.
If it is included, use "type": "space" instead of "type": "room".
Do not calculate it as a normal bedroom or living room.

METRIC AREA:
The dimensions shown on the drawing are in FEET and INCHES.
NEVER interpret feet/inches as meters.
Example: 14'-0" × 17'-9" = 14 ft × 17.75 ft = 248.5 sq ft = approx 23.08 m²
Therefore:
- dimensions must remain exactly as written in the drawing
- area must be returned in square meters
- convert square feet to square meters using: 1 sq ft = 0.092903 m²

VALIDATION BEFORE OUTPUT:
For EVERY element verify:
- x is between 0 and {img_w}
- y is between 0 and {img_h}
- coordinates are integers or precise pixel values
- polygon follows actual walls
- polygon does not contain another room
- polygon does not cross walls
- label_position is inside its polygon
- no duplicate rooms
- no missing labeled rooms
- dimensions match the drawing
- area is mathematically consistent with the dimensions
- Balcony is included
- CUT OUT is treated as a space, not a room

Return ONLY the final JSON.
The most important requirement is: PIXEL COORDINATES ONLY — NOT NORMALIZED COORDINATES."""

        print_step("Running Master Extraction AI Prompt with strict JSON schema...")

        response = self.provider.analyze_with_schema(
            prompt=prompt,
            image_paths=[str(image_path)],
            response_schema=MASTER_SCHEMA,
            model="gemini-3.5-flash",  
            thinking_budget=0,
        )

        return response
