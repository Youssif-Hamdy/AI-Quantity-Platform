"""
Geometry Processor

Cleans and validates the raw spatial output from the AI extractor.

Responsibilities:
  1. Clamp coordinates to [0.0, 1.0]
  2. Remove degenerate polygons (< 3 points, zero area)
  3. Ensure polygons are clockwise (canvas y-axis goes downward)
  4. Deduplicate nearly-identical points (snap grid)
  5. Sort rooms spatially (top-left → bottom-right reading order)
  6. Sort column grid by axis position
  7. Compute bounding boxes for all elements
"""

from __future__ import annotations

import math
from typing import TypeVar

from geometry.models import (
    Point,
    BoundingBox,
    SpatialRoom,
    SpatialColumn,
    SpatialBeam,
    SpatialSlab,
    SpatialArchitecturalResult,
    SpatialCivilResult,
    SpatialMixedResult,
    ColumnGrid,
)

from utils import print_success

# Snap tolerance — points closer than this (normalized) are merged
SNAP_TOLERANCE = 0.005

# Minimum polygon area (normalized units²) to keep
MIN_POLYGON_AREA = 0.001


# ======================================================
# Low-level helpers
# ======================================================

def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def _clamp_point(p: Point) -> Point:
    return Point(x=_clamp(p.x), y=_clamp(p.y))


def _clamp_polygon(pts: list[Point]) -> list[Point]:
    return [_clamp_point(p) for p in pts]


def _signed_area(pts: list[Point]) -> float:
    """
    Shoelace formula — positive = counter-clockwise, negative = clockwise
    (in canvas/screen coords where Y increases downward).
    """
    n = len(pts)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += pts[i].x * pts[j].y
        area -= pts[j].x * pts[i].y
    return area / 2.0


def _polygon_area(pts: list[Point]) -> float:
    return abs(_signed_area(pts))


def _ensure_clockwise(pts: list[Point]) -> list[Point]:
    """
    Canvas Y-axis goes downward, so clockwise = negative signed area.
    If signed_area > 0 (CCW), reverse the polygon.
    """
    if _signed_area(pts) > 0:
        return list(reversed(pts))
    return pts


def _polygon_centroid(pts: list[Point]) -> Point:
    if not pts:
        return Point(x=0.5, y=0.5)
    cx = sum(p.x for p in pts) / len(pts)
    cy = sum(p.y for p in pts) / len(pts)
    return Point(x=cx, y=cy)


def _bounding_box(pts: list[Point]) -> BoundingBox:
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    return BoundingBox(
        x_min=min(xs), y_min=min(ys),
        x_max=max(xs), y_max=max(ys),
    )


def _snap_deduplicate(pts: list[Point], tol: float = SNAP_TOLERANCE) -> list[Point]:
    """Remove points that are closer than `tol` to the previous point."""
    if not pts:
        return pts
    result = [pts[0]]
    for p in pts[1:]:
        prev = result[-1]
        dist = math.hypot(p.x - prev.x, p.y - prev.y)
        if dist >= tol:
            result.append(p)
    return result


def _is_valid_polygon(pts: list[Point]) -> bool:
    cleaned = _snap_deduplicate(pts)
    if len(cleaned) < 3:
        return False
    return _polygon_area(cleaned) >= MIN_POLYGON_AREA


# ======================================================
# Architectural processor
# ======================================================

def _process_room(room: SpatialRoom) -> SpatialRoom:
    polygon = _clamp_polygon(room.polygon)
    polygon = _snap_deduplicate(polygon)
    if len(polygon) >= 3:
        polygon = _ensure_clockwise(polygon)

    return SpatialRoom(
        id=room.id,
        name=room.name,
        polygon=polygon,
        label_position=(
            _clamp_point(room.label_position)
            if room.label_position
            else _polygon_centroid(polygon)
        ),
        dimensions_text=room.dimensions_text,
        length_m=room.length_m,
        width_m=room.width_m,
        height_m=room.height_m,
        area_m2=room.area_m2,
        perimeter_m=room.perimeter_m,
        walls=room.walls,
        doors=room.doors,
        windows=room.windows,
        adjacent_rooms=room.adjacent_rooms,
    )


def _sort_rooms(rooms: list[SpatialRoom]) -> list[SpatialRoom]:
    """Sort by top-left corner of bounding box (reading order)."""
    def _sort_key(r: SpatialRoom):
        if r.polygon:
            bb = _bounding_box(r.polygon)
            # Bucket into rows (0.1 tolerance), then sort left-to-right
            row = round(bb.y_min / 0.1)
            return (row, bb.x_min)
        if r.label_position:
            row = round(r.label_position.y / 0.1)
            return (row, r.label_position.x)
        return (999, 999)
    return sorted(rooms, key=_sort_key)


def process_architectural(
    result: SpatialArchitecturalResult,
) -> SpatialArchitecturalResult:
    """Clean and validate an architectural extraction result."""

    # Filter degenerate polygons, then clean each room
    valid_rooms = [r for r in result.rooms if _is_valid_polygon(r.polygon)]
    if len(valid_rooms) < len(result.rooms):
        dropped = len(result.rooms) - len(valid_rooms)
        print(f"  [Processor] Dropped {dropped} degenerate room polygon(s).")

    processed_rooms = [_process_room(r) for r in valid_rooms]
    sorted_rooms    = _sort_rooms(processed_rooms)

    print_success(
        f"Architectural geometry processed — {len(sorted_rooms)} valid room(s)."
    )

    return SpatialArchitecturalResult(
        scale_bar=result.scale_bar,
        image_width_px=result.image_width_px,
        image_height_px=result.image_height_px,
        rooms=sorted_rooms,
    )


# ======================================================
# Civil processor
# ======================================================

def _sort_columns(columns: list[SpatialColumn]) -> list[SpatialColumn]:
    """Sort columns top-left → bottom-right (grid reading order)."""
    return sorted(
        columns,
        key=lambda c: (round(c.center.y / 0.05), c.center.x),
    )


def _process_slab(slab: SpatialSlab) -> SpatialSlab:
    polygon = _clamp_polygon(slab.polygon)
    polygon = _snap_deduplicate(polygon)
    if len(polygon) >= 3:
        polygon = _ensure_clockwise(polygon)

    return SpatialSlab(
        id=slab.id,
        label=slab.label,
        polygon=polygon,
        thickness_text=slab.thickness_text,
        thickness_m=slab.thickness_m,
        area_m2=slab.area_m2,
        volume_m3=slab.volume_m3,
        quantity=slab.quantity,
    )


def _process_beam(beam: SpatialBeam) -> SpatialBeam:
    return SpatialBeam(
        id=beam.id,
        label=beam.label,
        start=_clamp_point(beam.start),
        end=_clamp_point(beam.end),
        size_text=beam.size_text,
        width_m=beam.width_m,
        height_m=beam.height_m,
        length_m=beam.length_m,
        volume_m3=beam.volume_m3,
        quantity=beam.quantity,
    )


def process_civil(result: SpatialCivilResult) -> SpatialCivilResult:
    """Clean and validate a civil extraction result."""

    columns = [
        SpatialColumn(
            id=c.id,
            label=c.label,
            center=_clamp_point(c.center),
            size_text=c.size_text,
            length_m=c.length_m,
            width_m=c.width_m,
            height_m=c.height_m,
            volume_m3=c.volume_m3,
            quantity=c.quantity,
        )
        for c in result.column_grid.columns
    ]
    columns = _sort_columns(columns)

    valid_slabs = [s for s in result.slabs if _is_valid_polygon(s.polygon)]
    processed_slabs = [_process_slab(s) for s in valid_slabs]

    processed_beams = [_process_beam(b) for b in result.beams]

    print_success(
        f"Civil geometry processed — "
        f"{len(columns)} column(s), "
        f"{len(processed_beams)} beam(s), "
        f"{len(processed_slabs)} slab(s)."
    )

    return SpatialCivilResult(
        scale_bar=result.scale_bar,
        image_width_px=result.image_width_px,
        image_height_px=result.image_height_px,
        column_grid=ColumnGrid(
            x_axes=result.column_grid.x_axes,
            y_axes=result.column_grid.y_axes,
            columns=columns,
        ),
        beams=processed_beams,
        slabs=processed_slabs,
        steel_bars=result.steel_bars,
    )


# ======================================================
# Mixed processor
# ======================================================

def process_mixed(result: SpatialMixedResult) -> SpatialMixedResult:
    return SpatialMixedResult(
        scale_bar=result.scale_bar,
        image_width_px=result.image_width_px,
        image_height_px=result.image_height_px,
        architectural=process_architectural(result.architectural),
        civil=process_civil(result.civil),
    )


# ======================================================
# Dispatcher
# ======================================================

def process(
    result: SpatialArchitecturalResult | SpatialCivilResult | SpatialMixedResult,
) -> SpatialArchitecturalResult | SpatialCivilResult | SpatialMixedResult:
    if isinstance(result, SpatialArchitecturalResult):
        return process_architectural(result)
    if isinstance(result, SpatialCivilResult):
        return process_civil(result)
    if isinstance(result, SpatialMixedResult):
        return process_mixed(result)
    raise TypeError(f"Unknown result type: {type(result)}")
