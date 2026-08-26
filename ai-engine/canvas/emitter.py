"""
Canvas Emitter

Converts processed spatial geometry into drawing instructions
for the frontend Canvas renderer.

Output format:
{
  "width": 3508,
  "height": 2480,
  "scale_ratio": 100,
  "elements": [
    {
      "id": "R1",
      "type": "room",
      "name": "Living Room",
      "polygon": [{"x": 100, "y": 100}, ...],   # 0-1000 integer space
      "box_2d": [ymin, xmin, ymax, xmax],         # 0-1000 bounding box
      "color": "#e0f7fa",
      "metrics": {
        "area": "12.5 m²",
        "dimensions": "3.5 x 4.0 m"
      }
    },
    ...
  ]
}
"""

from __future__ import annotations
import json
from pathlib import Path
from typing import Any

from config import OUTPUT_DIR
from geometry.models import (
    SpatialArchitecturalResult,
    SpatialCivilResult,
    SpatialMixedResult,
)
from utils import save_json, print_success

CANVAS_OUTPUT = OUTPUT_DIR / "canvas.json"

# ── Coordinate helpers ──────────────────────────────────────────────────────────

def _scale(v: float) -> int:
    """Normalize a 0.0-1.0 coordinate to 0-1000 integer space.
    If the value is already in pixel / 0-1000 space (> 1.0), pass through as int.
    """
    if v > 1.0:
        return int(round(v))
    return int(round(v * 1000))


def _scale_point(p: Any) -> dict:
    return {"x": _scale(p.x), "y": _scale(p.y)}


def _scale_polygon(pts: list) -> list[dict]:
    return [_scale_point(p) for p in pts]


def _box2d_from_polygon(scaled_pts: list[dict]) -> list[int]:
    """Compute [ymin, xmin, ymax, xmax] bounding box from a list of {x, y} dicts."""
    if not scaled_pts:
        return [0, 0, 0, 0]
    xs = [p["x"] for p in scaled_pts]
    ys = [p["y"] for p in scaled_pts]
    return [int(min(ys)), int(min(xs)), int(max(ys)), int(max(xs))]


def _box2d_from_center(cx: int, cy: int, half: int = 15) -> list[int]:
    """Create a small bounding box around a center point."""
    return [cy - half, cx - half, cy + half, cx + half]


class CanvasEmitter:

    def __init__(self):
        self.colors = {
            "room":   "rgba(33, 150, 243, 0.2)",
            "column": "rgba(244, 67, 54, 0.6)",
            "beam":   "rgba(76, 175, 80, 0.5)",
            "slab":   "rgba(156, 39, 176, 0.2)",
            "door":   "rgba(255, 152, 0, 0.8)",
            "window": "rgba(3, 169, 244, 0.8)",
            "wall":   "rgba(100, 116, 139, 0.8)",
        }

    # ── Architectural ────────────────────────────────────────────────────────────

    def _emit_architectural(self, arch: SpatialArchitecturalResult) -> list[dict]:
        elements = []

        for room in arch.rooms:
            scaled_poly = _scale_polygon(room.polygon)
            box = _box2d_from_polygon(scaled_poly)

            elements.append({
                "id":            room.id,
                "type":          "room",
                "name":          room.name,
                "polygon":       scaled_poly,
                "box_2d":        box,
                "label_position": _scale_point(room.label_position) if room.label_position else None,
                "color":         self.colors["room"],
                "metrics": {
                    "dimensions": room.dimensions_text or "",
                    "area":       f"{room.area_m2:.2f} m²" if room.area_m2 else "",
                },
            })

            # Walls embedded in the room
            for i, wall in enumerate(room.walls):
                sp = _scale_point(wall.start)
                ep = _scale_point(wall.end)
                wall_poly = [sp, ep]
                elements.append({
                    "id":        f"{room.id}_wall_{i+1}",
                    "type":      "wall",
                    "name":      f"Wall",
                    "start":     sp,
                    "end":       ep,
                    "box_2d":    _box2d_from_polygon(wall_poly),
                    "color":     self.colors["wall"],
                    "metrics": {
                        "thickness": wall.thickness_text or "",
                    },
                })

            # Doors
            for i, door in enumerate(room.doors):
                if door.position:
                    cp = _scale_point(door.position)
                    elements.append({
                        "id":       f"{room.id}_D{i+1}",
                        "type":     "door",
                        "label":    door.label or "Door",
                        "position": cp,
                        "box_2d":   _box2d_from_center(cp["x"], cp["y"], half=20),
                        "color":    self.colors["door"],
                        "metrics": {
                            "width": f"{door.width_m} m" if getattr(door, "width_m", None) else (door.width_text or ""),
                        },
                    })

            # Windows
            for i, window in enumerate(room.windows):
                if window.position:
                    cp = _scale_point(window.position)
                    elements.append({
                        "id":       f"{room.id}_W{i+1}",
                        "type":     "window",
                        "label":    window.label or "Window",
                        "position": cp,
                        "box_2d":   _box2d_from_center(cp["x"], cp["y"], half=15),
                        "color":    self.colors["window"],
                        "metrics": {
                            "width": f"{window.width_m} m" if getattr(window, "width_m", None) else (window.width_text or ""),
                        },
                    })

        return elements

    # ── Civil ────────────────────────────────────────────────────────────────────

    def _emit_civil(self, civil: SpatialCivilResult) -> list[dict]:
        elements = []

        # Columns
        for col in civil.column_grid.columns:
            cp = _scale_point(col.center)
            elements.append({
                "id":      col.id,
                "type":    "column",
                "label":   col.label or "Col",
                "center":  cp,
                "box_2d":  _box2d_from_center(cp["x"], cp["y"], half=20),
                "color":   self.colors["column"],
                "metrics": {
                    "size":   col.size_text or "",
                    "volume": f"{col.volume_m3:.3f} m³" if getattr(col, "volume_m3", None) else "",
                },
            })

        # Beams
        for beam in civil.beams:
            sp = _scale_point(beam.start)
            ep = _scale_point(beam.end)
            beam_poly = [sp, ep]
            elements.append({
                "id":     beam.id,
                "type":   "beam",
                "label":  beam.label or "Beam",
                "start":  sp,
                "end":    ep,
                "box_2d": _box2d_from_polygon(beam_poly),
                "color":  self.colors["beam"],
                "metrics": {
                    "size":   beam.size_text or "",
                    "length": f"{beam.length_m:.2f} m" if getattr(beam, "length_m", None) else "",
                },
            })

        # Slabs
        for slab in civil.slabs:
            scaled_poly = _scale_polygon(slab.polygon)
            elements.append({
                "id":      slab.id,
                "type":    "slab",
                "label":   slab.label or "Slab",
                "polygon": scaled_poly,
                "box_2d":  _box2d_from_polygon(scaled_poly),
                "color":   self.colors["slab"],
                "metrics": {
                    "thickness": slab.thickness_text or "",
                    "area":      f"{slab.area_m2:.2f} m²" if getattr(slab, "area_m2", None) else "",
                },
            })

        return elements

    # ── Emitter ──────────────────────────────────────────────────────────────────

    def emit(
        self,
        result: SpatialArchitecturalResult | SpatialCivilResult | SpatialMixedResult,
    ) -> dict:

        scale_ratio = None
        if hasattr(result, "scale_bar") and result.scale_bar:
            scale_ratio = result.scale_bar.ratio

        canvas_data: dict = {
            "width":       result.image_width_px,
            "height":      result.image_height_px,
            "scale_ratio": scale_ratio,
            "elements":    [],
        }

        if isinstance(result, SpatialArchitecturalResult):
            canvas_data["elements"].extend(self._emit_architectural(result))

        elif isinstance(result, SpatialCivilResult):
            canvas_data["elements"].extend(self._emit_civil(result))

        elif isinstance(result, SpatialMixedResult):
            canvas_data["elements"].extend(self._emit_architectural(result.architectural))
            canvas_data["elements"].extend(self._emit_civil(result.civil))

        save_json(canvas_data, CANVAS_OUTPUT)
        print_success(f"Canvas JSON generated with {len(canvas_data['elements'])} elements.")

        return canvas_data
