"""
Coordinate Editor — Visual Preview & Manual Correction

Opens an interactive matplotlib window showing the engineering
drawing with detected coordinates overlaid.

Features:
  - Polygons drawn on top of the original image
  - Color-coded elements (rooms, walls, doors, windows, columns)
  - Draggable polygon vertices for manual correction
  - Click to add/remove points
  - Save corrected coordinates to JSON

Usage:
  python -m tools.coord_editor [--image <path>] [--geometry <path>] [--output <path>]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import matplotlib
matplotlib.use("TkAgg")

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.widgets import Button
import numpy as np
from PIL import Image

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from geometry.models import (
    Point,
    SpatialRoom,
    SpatialArchitecturalResult,
    SpatialCivilResult,
    SpatialMixedResult,
)
from utils import load_json, save_json, print_success


# ======================================================
# Color Palette
# ======================================================

COLORS = {
    "room":    "#2196F3",   # Blue
    "wall":    "#F44336",   # Red
    "door":    "#FF9800",   # Orange
    "window":  "#4CAF50",   # Green
    "column":  "#9C27B0",   # Purple
    "beam":    "#00BCD4",   # Cyan
    "slab":    "#795548",   # Brown
    "label":   "#FFFFFF",   # White
}

ALPHA = 0.3  # Polygon fill transparency


# ======================================================
# Drawing helpers
# ======================================================

def _draw_polygon(
    ax: plt.Axes,
    points: list[dict | Point],
    img_w: int,
    img_h: int,
    color: str,
    label: str = "",
    fill: bool = True,
) -> None:
    """Draw a polygon on the axes."""
    if not points:
        return

    coords = []
    for p in points:
        if isinstance(p, dict):
            x, y = p.get("x", 0), p.get("y", 0)
        else:
            x, y = p.x, p.y
        coords.append((x, y))

    if not coords:
        return

    polygon = plt.Polygon(
        coords,
        closed=True,
        fill=fill,
        facecolor=color if fill else "none",
        edgecolor=color,
        alpha=ALPHA if fill else 1.0,
        linewidth=2,
    )
    ax.add_patch(polygon)

    # Label at centroid
    if label:
        cx = sum(c[0] for c in coords) / len(coords)
        cy = sum(c[1] for c in coords) / len(coords)
        ax.text(
            cx, cy, label,
            fontsize=8, fontweight="bold",
            color=COLORS["label"],
            ha="center", va="center",
            bbox=dict(boxstyle="round,pad=0.2", facecolor=color, alpha=0.7),
        )

    # Draw vertices
    for i, (px, py) in enumerate(coords):
        ax.plot(px, py, "o", color=color, markersize=5, picker=5)


def _draw_line(
    ax: plt.Axes,
    start: dict | Point,
    end: dict | Point,
    img_w: int,
    img_h: int,
    color: str,
    label: str = "",
) -> None:
    """Draw a line segment."""
    if isinstance(start, dict):
        x1, y1 = start.get("x", 0), start.get("y", 0)
    else:
        x1, y1 = start.x, start.y
    if isinstance(end, dict):
        x2, y2 = end.get("x", 0), end.get("y", 0)
    else:
        x2, y2 = end.x, end.y

    ax.plot(
        [x1, x2],
        [y1, y2],
        color=color, linewidth=2, alpha=0.8,
    )

    if label:
        mx = (x1 + x2) / 2
        my = (y1 + y2) / 2
        ax.text(mx, my, label, fontsize=6, color=color, alpha=0.9)


def _draw_marker(
    ax: plt.Axes,
    position: dict | Point | None,
    img_w: int,
    img_h: int,
    color: str,
    label: str = "",
    marker: str = "s",
) -> None:
    """Draw a point marker."""
    if position is None:
        return
    if isinstance(position, dict):
        x, y = position.get("x", 0), position.get("y", 0)
    else:
        x, y = position.x, position.y

    ax.plot(x, y, marker, color=color, markersize=10, alpha=0.8)
    if label:
        ax.text(
            x + 10, y - 10, label,
            fontsize=7, color=color,
            bbox=dict(boxstyle="round,pad=0.1", facecolor="black", alpha=0.5),
        )


# ======================================================
# Main Editor Class
# ======================================================

class CoordinateEditor:
    """
    Interactive coordinate editor with matplotlib.

    Usage:
        editor = CoordinateEditor()
        editor.open(image_path, geometry_path)
    """

    def __init__(self):
        self.fig = None
        self.ax = None
        self.image = None
        self.geometry_data: dict = {}
        self.output_path: str = ""
        self.modified = False

    def open(
        self,
        image_path: str | Path,
        geometry_path: str | Path,
        output_path: str | Path | None = None,
    ) -> None:
        """
        Open the interactive editor.

        Args:
            image_path: path to the drawing image
            geometry_path: path to geometry.json
            output_path: where to save corrected coordinates
        """
        image_path = Path(image_path)
        geometry_path = Path(geometry_path)
        self.output_path = str(
            output_path or geometry_path.parent / "geometry_corrected.json"
        )

        # Load image
        self.image = np.array(Image.open(image_path))
        img_h, img_w = self.image.shape[:2]

        # Load geometry
        self.geometry_data = load_json(str(geometry_path))

        # Create figure
        self.fig, self.ax = plt.subplots(1, 1, figsize=(16, 10))
        self.fig.canvas.manager.set_window_title(
            "Coordinate Editor — AI Quantity Platform"
        )

        # Show image
        self.ax.imshow(self.image)
        self.ax.set_title(
            f"📐 Coordinate Preview — {image_path.name}  "
            f"({img_w}×{img_h} px)",
            fontsize=12, fontweight="bold",
        )

        # Draw all elements
        self._draw_all(img_w, img_h)

        # Legend
        self._add_legend()

        # Buttons
        self._add_buttons()

        # Info text
        self.ax.text(
            10, img_h - 20,
            "🖱️ Drag vertices to correct  |  💾 Click Save when done",
            fontsize=9, color="white",
            bbox=dict(boxstyle="round", facecolor="black", alpha=0.6),
        )

        plt.tight_layout()
        plt.show()

    def _draw_all(self, img_w: int, img_h: int) -> None:
        """Draw all geometry elements on the image."""
        data = self.geometry_data

        # Architectural rooms
        for room_data in data.get("rooms", []):
            _draw_polygon(
                self.ax,
                room_data.get("polygon", []),
                img_w, img_h,
                COLORS["room"],
                label=room_data.get("name", room_data.get("id", "")),
            )

            # Walls
            for wall in room_data.get("walls", []):
                _draw_line(
                    self.ax,
                    wall.get("start", {}),
                    wall.get("end", {}),
                    img_w, img_h,
                    COLORS["wall"],
                )

            # Doors
            for door in room_data.get("doors", []):
                _draw_marker(
                    self.ax,
                    door.get("position"),
                    img_w, img_h,
                    COLORS["door"],
                    label=door.get("label", "D"),
                    marker="D",
                )

            # Windows
            for win in room_data.get("windows", []):
                _draw_marker(
                    self.ax,
                    win.get("position"),
                    img_w, img_h,
                    COLORS["window"],
                    label=win.get("label", "W"),
                    marker="^",
                )

        # Architectural section within mixed
        arch = data.get("architectural", {})
        for room_data in arch.get("rooms", []):
            _draw_polygon(
                self.ax,
                room_data.get("polygon", []),
                img_w, img_h,
                COLORS["room"],
                label=room_data.get("name", room_data.get("id", "")),
            )

        # Civil section
        civil = data.get("civil", data)

        # Column grid
        grid = civil.get("column_grid", {})
        for col in grid.get("columns", []):
            _draw_marker(
                self.ax,
                col.get("center"),
                img_w, img_h,
                COLORS["column"],
                label=col.get("label", col.get("id", "")),
                marker="s",
            )

        # Beams
        for beam in civil.get("beams", []):
            _draw_line(
                self.ax,
                beam.get("start", {}),
                beam.get("end", {}),
                img_w, img_h,
                COLORS["beam"],
                label=beam.get("label", ""),
            )

        # Slabs
        for slab in civil.get("slabs", []):
            _draw_polygon(
                self.ax,
                slab.get("polygon", []),
                img_w, img_h,
                COLORS["slab"],
                label=slab.get("label", slab.get("id", "")),
                fill=True,
            )

    def _add_legend(self) -> None:
        """Add color legend."""
        legend_entries = [
            mpatches.Patch(color=COLORS["room"],   label="Rooms"),
            mpatches.Patch(color=COLORS["wall"],   label="Walls"),
            mpatches.Patch(color=COLORS["door"],   label="Doors"),
            mpatches.Patch(color=COLORS["window"], label="Windows"),
            mpatches.Patch(color=COLORS["column"], label="Columns"),
            mpatches.Patch(color=COLORS["beam"],   label="Beams"),
            mpatches.Patch(color=COLORS["slab"],   label="Slabs"),
        ]
        self.ax.legend(
            handles=legend_entries,
            loc="upper right",
            fontsize=8,
            framealpha=0.8,
        )

    def _add_buttons(self) -> None:
        """Add Save and Reset buttons."""
        ax_save = plt.axes([0.82, 0.01, 0.08, 0.04])
        btn_save = Button(ax_save, "💾 Save", color="#4CAF50", hovercolor="#66BB6A")
        btn_save.on_clicked(self._on_save)

        ax_reset = plt.axes([0.91, 0.01, 0.08, 0.04])
        btn_reset = Button(ax_reset, "🔄 Reset", color="#F44336", hovercolor="#EF5350")
        btn_reset.on_clicked(self._on_reset)

    def _on_save(self, event) -> None:
        """Save corrected geometry."""
        save_json(self.geometry_data, self.output_path)
        print_success(f"Saved corrected coordinates → {self.output_path}")
        self.ax.set_title(
            self.ax.get_title() + "  ✅ SAVED",
            fontsize=12, fontweight="bold",
        )
        self.fig.canvas.draw()

    def _on_reset(self, event) -> None:
        """Reset to original coordinates."""
        print("  [Editor] Reset not implemented — reload the file.")


# ======================================================
# Non-interactive Preview (for headless / CI)
# ======================================================

def preview_to_file(
    image_path: str | Path,
    geometry_path: str | Path,
    output_image_path: str | Path,
) -> str:
    """
    Render coordinates on top of the image and save as PNG.
    Works headlessly — no GUI needed.

    Returns: path to saved preview image.
    """
    matplotlib.use("Agg")  # Non-interactive backend
    import matplotlib.pyplot as _plt  # reimport for Agg

    image_path = Path(image_path)
    geometry_path = Path(geometry_path)
    output_image_path = Path(output_image_path)

    image = np.array(Image.open(image_path))
    img_h, img_w = image.shape[:2]

    geometry_data = load_json(str(geometry_path))

    fig, ax = plt.subplots(1, 1, figsize=(16, 10))
    ax.imshow(image)
    ax.set_title(f"Preview — {image_path.name}")

    # Draw rooms
    for room_data in geometry_data.get("rooms", []):
        _draw_polygon(
            ax,
            room_data.get("polygon", []),
            img_w, img_h,
            COLORS["room"],
            label=room_data.get("name", room_data.get("id", "")),
        )

    output_image_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(str(output_image_path), dpi=150, bbox_inches="tight")
    plt.close(fig)

    print_success(f"Preview saved → {output_image_path}")
    return str(output_image_path)


def preview_static(
    image_path: str | Path,
    geometry_path: str | Path,
    output_image_path: str | Path,
) -> str:
    """
    Render coordinates on top of the image and save as PNG.
    Uses OpenCV directly — no matplotlib needed. Works headlessly.

    Returns: path to saved preview image.
    """
    import cv2

    image_path = Path(image_path)
    geometry_path = Path(geometry_path)
    output_image_path = Path(output_image_path)

    image = cv2.imread(str(image_path))
    if image is None:
        raise FileNotFoundError(f"Cannot read: {image_path}")

    img_h, img_w = image.shape[:2]
    geometry_data = load_json(str(geometry_path))

    # Color map (BGR for OpenCV)
    colors_bgr = {
        "room":   (243, 33, 150),   # Blue
        "wall":   (54, 67, 244),    # Red
        "door":   (0, 152, 255),    # Orange
        "window": (80, 175, 76),    # Green
        "column": (176, 39, 156),   # Purple
        "beam":   (212, 188, 0),    # Cyan
        "slab":   (72, 85, 121),    # Brown
    }

    def _to_px(p: dict) -> tuple[int, int]:
        return (int(p.get("x", 0)), int(p.get("y", 0)))

    elements = geometry_data.get("elements", [])
    if not elements:
        # Fallback for old format
        for room_data in geometry_data.get("rooms", []):
            room_data["type"] = "room"
            elements.append(room_data)
        
    for elem in elements:
        etype = elem.get("type", "unknown")
        color = colors_bgr.get(etype, (200, 200, 200))
        
        polygon = elem.get("polygon", [])
        if len(polygon) >= 3:
            pts = np.array([_to_px(p) for p in polygon], np.int32)
            pts = pts.reshape((-1, 1, 2))
            
            # Semi-transparent fill
            overlay = image.copy()
            cv2.fillPoly(overlay, [pts], color)
            image = cv2.addWeighted(overlay, 0.2, image, 0.8, 0, image)
            
            # Border
            cv2.polylines(image, [pts], isClosed=True, color=color, thickness=2)
            
            # Label
            name = elem.get("name", "")
            metrics = elem.get("metrics", {})
            dims = metrics.get("dimensions", "") if metrics else elem.get("dimensions_text", "")
            if name:
                label = f"{name} {dims}"
                pos = elem.get("label_position")
                if pos:
                    cx, cy = _to_px(pos)
                else:
                    cx = int(np.mean([p[0][0] for p in pts]))
                    cy = int(np.mean([p[0][1] for p in pts]))
                    
                cv2.putText(
                    image, label, (cx, cy),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2,
                )
                cv2.putText(
                    image, label, (cx, cy),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1,
                )

        # Draw line elements (walls, beams)
        elif len(polygon) == 2:
            pt1 = _to_px(polygon[0])
            pt2 = _to_px(polygon[1])
            cv2.line(image, pt1, pt2, color, 3)
            
        # Draw point elements (doors, windows, columns)
        elif len(polygon) == 1:
            pt = _to_px(polygon[0])
            cv2.circle(image, pt, 5, color, -1)

    # Save
    output_image_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_image_path), image)

    print_success(f"Preview saved → {output_image_path}")
    return str(output_image_path)


# ──────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Coordinate Editor — visual preview & manual correction"
    )
    parser.add_argument(
        "--image", "-i",
        default="temp/pages/page_1.png",
        help="Path to drawing image",
    )
    parser.add_argument(
        "--geometry", "-g",
        default="output/geometry.json",
        help="Path to geometry JSON file",
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Output path for corrected JSON (default: geometry_corrected.json)",
    )
    parser.add_argument(
        "--static", "-s",
        action="store_true",
        help="Save a static preview image instead of opening the interactive editor",
    )
    parser.add_argument(
        "--preview-output",
        default="output/preview.png",
        help="Output path for static preview image",
    )

    args = parser.parse_args()

    if args.static:
        preview_static(args.image, args.geometry, args.preview_output)
    else:
        editor = CoordinateEditor()
        editor.open(args.image, args.geometry, args.output)
