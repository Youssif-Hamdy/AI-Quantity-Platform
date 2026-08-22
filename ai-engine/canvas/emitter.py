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
      "polygon": [{"x": 0.1, "y": 0.1}, ...],
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

from config import OUTPUT_DIR
from geometry.models import (
    SpatialArchitecturalResult,
    SpatialCivilResult,
    SpatialMixedResult,
)
from utils import save_json, print_success

CANVAS_OUTPUT = OUTPUT_DIR / "canvas.json"


class CanvasEmitter:
    
    def __init__(self):
        # Optional color palette for different elements
        self.colors = {
            "room": "rgba(33, 150, 243, 0.2)",
            "column": "rgba(244, 67, 54, 0.6)",
            "beam": "rgba(76, 175, 80, 0.5)",
            "slab": "rgba(156, 39, 176, 0.2)",
            "door": "rgba(255, 152, 0, 0.8)",
            "window": "rgba(3, 169, 244, 0.8)",
        }

    def _emit_architectural(self, arch: SpatialArchitecturalResult) -> list[dict]:
        elements = []
        for room in arch.rooms:
            # Room
            elements.append({
                "id": room.id,
                "type": "room",
                "name": room.name,
                "polygon": [{"x": p.x, "y": p.y} for p in room.polygon],
                "label_position": {"x": room.label_position.x, "y": room.label_position.y} if room.label_position else None,
                "color": self.colors["room"],
                "metrics": {
                    "dimensions": room.dimensions_text or "",
                    "area": f"{room.area_m2:.2f} m²" if room.area_m2 else "",
                }
            })
            
            # Doors
            for i, door in enumerate(room.doors):
                if door.position:
                    elements.append({
                        "id": f"{room.id}_D{i+1}",
                        "type": "door",
                        "label": door.label or "Door",
                        "position": {"x": door.position.x, "y": door.position.y},
                        "color": self.colors["door"],
                        "metrics": {
                            "width": f"{door.width_m} m" if door.width_m else door.width_text,
                        }
                    })
                    
            # Windows
            for i, window in enumerate(room.windows):
                if window.position:
                    elements.append({
                        "id": f"{room.id}_W{i+1}",
                        "type": "window",
                        "label": window.label or "Window",
                        "position": {"x": window.position.x, "y": window.position.y},
                        "color": self.colors["window"],
                        "metrics": {
                            "width": f"{window.width_m} m" if window.width_m else window.width_text,
                        }
                    })
        return elements

    def _emit_civil(self, civil: SpatialCivilResult) -> list[dict]:
        elements = []
        
        # Columns
        for col in civil.column_grid.columns:
            elements.append({
                "id": col.id,
                "type": "column",
                "label": col.label or "Col",
                "center": {"x": col.center.x, "y": col.center.y},
                "color": self.colors["column"],
                "metrics": {
                    "size": col.size_text or "",
                    "volume": f"{col.volume_m3:.3f} m³" if col.volume_m3 else "",
                }
            })
            
        # Beams
        for beam in civil.beams:
            elements.append({
                "id": beam.id,
                "type": "beam",
                "label": beam.label or "Beam",
                "start": {"x": beam.start.x, "y": beam.start.y},
                "end": {"x": beam.end.x, "y": beam.end.y},
                "color": self.colors["beam"],
                "metrics": {
                    "size": beam.size_text or "",
                    "length": f"{beam.length_m:.2f} m" if beam.length_m else "",
                }
            })
            
        # Slabs
        for slab in civil.slabs:
            elements.append({
                "id": slab.id,
                "type": "slab",
                "label": slab.label or "Slab",
                "polygon": [{"x": p.x, "y": p.y} for p in slab.polygon],
                "color": self.colors["slab"],
                "metrics": {
                    "thickness": slab.thickness_text or "",
                    "area": f"{slab.area_m2:.2f} m²" if slab.area_m2 else "",
                }
            })
            
        return elements

    def emit(self, result: SpatialArchitecturalResult | SpatialCivilResult | SpatialMixedResult) -> dict:
        
        canvas_data = {
            "width": result.image_width_px,
            "height": result.image_height_px,
            "scale_ratio": result.scale_bar.ratio,
            "elements": []
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
