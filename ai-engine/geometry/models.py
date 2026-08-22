"""
Geometry Data Models

Pydantic models for spatial/geometric representation of
engineering drawing elements.

All coordinates are normalized (0.0 → 1.0) relative to the image.
Real-world dimensions are in metres.
"""

from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field


# ======================================================
# Primitives
# ======================================================

class Point(BaseModel):
    """A normalized coordinate (0.0 – 1.0 relative to image dimensions)."""
    x: float
    y: float


class BoundingBox(BaseModel):
    """Axis-aligned bounding box in normalized coordinates."""
    x_min: float
    y_min: float
    x_max: float
    y_max: float

    @property
    def width(self) -> float:
        return self.x_max - self.x_min

    @property
    def height(self) -> float:
        return self.y_max - self.y_min

    @property
    def center(self) -> Point:
        return Point(
            x=(self.x_min + self.x_max) / 2,
            y=(self.y_min + self.y_max) / 2,
        )


# ======================================================
# Scale Reference
# ======================================================

class ScaleBar(BaseModel):
    """Drawing scale bar detected from the image."""
    text: str = ""                     # e.g. "1:100" or "scale 1:50"
    ratio: float | None = None         # e.g. 100 for 1:100
    confidence: float = 0.0           # 0.0 → 1.0


# ======================================================
# Architectural Elements
# ======================================================

class SpatialDoor(BaseModel):
    """Door with spatial position."""
    label: str | None = None
    width_text: str | None = None      # exact text from drawing e.g. "0.90 m"
    height_text: str | None = None
    width_m: float | None = None       # resolved real-world width in metres
    height_m: float | None = None
    position: Point | None = None      # center of door symbol
    swing_direction: Literal["in", "out", "both", "unknown"] = "unknown"
    quantity: int = 1


class SpatialWindow(BaseModel):
    """Window with spatial position."""
    label: str | None = None
    width_text: str | None = None
    height_text: str | None = None
    width_m: float | None = None
    height_m: float | None = None
    position: Point | None = None      # center of window symbol
    quantity: int = 1


class SpatialWall(BaseModel):
    """Wall segment defined by two endpoints."""
    start: Point
    end: Point
    thickness_text: str | None = None  # e.g. "25 cm"
    thickness_m: float | None = None
    length_m: float | None = None


class SpatialRoom(BaseModel):
    """A room with its full geometric footprint."""
    id: str                            # e.g. "R1"
    name: str
    polygon: list[Point] = Field(default_factory=list)   # CW polygon
    label_position: Point | None = None
    dimensions_text: str | None = None  # e.g. "3.50 x 4.00 m"
    length_m: float | None = None
    width_m: float | None = None
    height_m: float | None = None
    area_m2: float | None = None
    perimeter_m: float | None = None
    walls: list[SpatialWall] = Field(default_factory=list)
    doors: list[SpatialDoor] = Field(default_factory=list)
    windows: list[SpatialWindow] = Field(default_factory=list)
    adjacent_rooms: list[str] = Field(default_factory=list)  # ids of neighbours


# ======================================================
# Civil / Structural Elements
# ======================================================

class SpatialColumn(BaseModel):
    """Structural column with position."""
    id: str                            # e.g. "C1"
    label: str | None = None
    center: Point
    size_text: str | None = None       # e.g. "30x30 cm"
    length_m: float | None = None
    width_m: float | None = None
    height_m: float | None = None
    volume_m3: float | None = None
    quantity: int = 1


class SpatialBeam(BaseModel):
    """Structural beam with two endpoints."""
    id: str
    label: str | None = None
    start: Point
    end: Point
    size_text: str | None = None       # e.g. "25x50 cm"
    width_m: float | None = None
    height_m: float | None = None
    length_m: float | None = None
    volume_m3: float | None = None
    quantity: int = 1


class SpatialSlab(BaseModel):
    """Concrete slab with polygon footprint."""
    id: str
    label: str | None = None
    polygon: list[Point] = Field(default_factory=list)
    thickness_text: str | None = None  # e.g. "20 cm"
    thickness_m: float | None = None
    area_m2: float | None = None
    volume_m3: float | None = None
    quantity: int = 1


class SpatialSteelBar(BaseModel):
    """Reinforcement bar specification."""
    id: str
    label: str | None = None          # e.g. "T12"
    diameter_mm: float | None = None
    length_m: float | None = None
    quantity: int = 1
    weight_kg: float | None = None


# ======================================================
# Column Grid
# ======================================================

class ColumnGrid(BaseModel):
    """Structural column grid (axes)."""
    x_axes: list[str] = Field(default_factory=list)  # e.g. ["A", "B", "C"]
    y_axes: list[str] = Field(default_factory=list)  # e.g. ["1", "2", "3"]
    columns: list[SpatialColumn] = Field(default_factory=list)


# ======================================================
# Full Drawing Results
# ======================================================

class SpatialArchitecturalResult(BaseModel):
    """Complete spatial model of an architectural drawing."""
    scale_bar: ScaleBar = Field(default_factory=ScaleBar)
    image_width_px: int = 0
    image_height_px: int = 0
    rooms: list[SpatialRoom] = Field(default_factory=list)


class SpatialCivilResult(BaseModel):
    """Complete spatial model of a civil/structural drawing."""
    scale_bar: ScaleBar = Field(default_factory=ScaleBar)
    image_width_px: int = 0
    image_height_px: int = 0
    column_grid: ColumnGrid = Field(default_factory=ColumnGrid)
    beams: list[SpatialBeam] = Field(default_factory=list)
    slabs: list[SpatialSlab] = Field(default_factory=list)
    steel_bars: list[SpatialSteelBar] = Field(default_factory=list)


class SpatialMixedResult(BaseModel):
    """Complete spatial model of a mixed (arch + civil) drawing."""
    scale_bar: ScaleBar = Field(default_factory=ScaleBar)
    image_width_px: int = 0
    image_height_px: int = 0
    architectural: SpatialArchitecturalResult = Field(
        default_factory=SpatialArchitecturalResult
    )
    civil: SpatialCivilResult = Field(default_factory=SpatialCivilResult)
