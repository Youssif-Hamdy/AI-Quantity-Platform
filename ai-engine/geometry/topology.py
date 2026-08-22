"""
Topology Builder

Discovers spatial relationships between elements:

  Architectural:
    - Room adjacency (which rooms share a wall?)
    - Room → door mapping (which door belongs to which rooms?)
    - Room → window mapping

  Civil:
    - Column grid connectivity (which columns are on the same axis?)
    - Beam → column endpoint mapping
    - Slab → bounding columns

Uses normalized coordinate overlap tests — no real-world scale required.
"""

from __future__ import annotations

import math

from geometry.models import (
    Point,
    SpatialRoom,
    SpatialColumn,
    SpatialBeam,
    SpatialSlab,
    SpatialArchitecturalResult,
    SpatialCivilResult,
    SpatialMixedResult,
)
from utils import print_success


# ======================================================
# Geometry helpers
# ======================================================

def _dist(a: Point, b: Point) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


def _polygon_bbox(pts: list[Point]) -> tuple[float, float, float, float]:
    """Returns (x_min, y_min, x_max, y_max)."""
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def _bboxes_overlap(
    bb1: tuple[float, float, float, float],
    bb2: tuple[float, float, float, float],
    tol: float = 0.02,
) -> bool:
    """Check if two bounding boxes overlap or are within tolerance."""
    x1_min, y1_min, x1_max, y1_max = bb1
    x2_min, y2_min, x2_max, y2_max = bb2
    return (
        x1_min - tol <= x2_max
        and x1_max + tol >= x2_min
        and y1_min - tol <= y2_max
        and y1_max + tol >= y2_min
    )


def _point_in_bbox(
    p: Point,
    bb: tuple[float, float, float, float],
    tol: float = 0.01,
) -> bool:
    x_min, y_min, x_max, y_max = bb
    return (
        x_min - tol <= p.x <= x_max + tol
        and y_min - tol <= p.y <= y_max + tol
    )


def _segments_share_edge(
    pts1: list[Point],
    pts2: list[Point],
    tol: float = 0.015,
) -> bool:
    """
    Returns True if two polygons share an edge (i.e. are adjacent rooms).
    Checks if any vertex of pts1 is within tol of any vertex of pts2.
    Shared edge = at least 2 near-coincident vertices.
    """
    close = 0
    for p1 in pts1:
        for p2 in pts2:
            if _dist(p1, p2) < tol:
                close += 1
                if close >= 2:
                    return True
    return False


# ======================================================
# Architectural Topology
# ======================================================

def _build_room_adjacency(rooms: list[SpatialRoom]) -> None:
    """Mutates rooms in-place, filling adjacent_rooms list."""
    n = len(rooms)
    for i in range(n):
        for j in range(i + 1, n):
            ri, rj = rooms[i], rooms[j]
            if not ri.polygon or not rj.polygon:
                continue

            # Fast bbox pre-filter
            bbi = _polygon_bbox(ri.polygon)
            bbj = _polygon_bbox(rj.polygon)
            if not _bboxes_overlap(bbi, bbj, tol=0.02):
                continue

            # Detailed edge test
            if _segments_share_edge(ri.polygon, rj.polygon):
                if rj.id not in ri.adjacent_rooms:
                    ri.adjacent_rooms.append(rj.id)
                if ri.id not in rj.adjacent_rooms:
                    rj.adjacent_rooms.append(ri.id)


def build_architectural_topology(
    result: SpatialArchitecturalResult,
) -> SpatialArchitecturalResult:
    """Augment an architectural result with adjacency information."""
    rooms = [r.model_copy(deep=True) for r in result.rooms]
    _build_room_adjacency(rooms)

    adj_count = sum(len(r.adjacent_rooms) for r in rooms) // 2
    print_success(f"Topology: {adj_count} room adjacency pair(s) discovered.")

    return SpatialArchitecturalResult(
        scale_bar=result.scale_bar,
        image_width_px=result.image_width_px,
        image_height_px=result.image_height_px,
        rooms=rooms,
    )


# ======================================================
# Civil Topology
# ======================================================

def _find_column_near(
    pt: Point,
    columns: list[SpatialColumn],
    tol: float = 0.04,
) -> SpatialColumn | None:
    """Return the closest column to a point within tolerance."""
    best: SpatialColumn | None = None
    best_d = tol
    for col in columns:
        d = _dist(pt, col.center)
        if d < best_d:
            best_d = d
            best   = col
    return best


def build_civil_topology(result: SpatialCivilResult) -> SpatialCivilResult:
    """
    Annotate beams with their endpoint columns and slabs with
    their bounding columns (does not mutate models — returns new result).
    Topology data is printed for debugging; models are returned unchanged
    since SpatialBeam/Slab don't have topology fields yet.
    """
    columns = result.column_grid.columns

    # Print beam → column mapping
    beam_mappings = []
    for beam in result.beams:
        start_col = _find_column_near(beam.start, columns)
        end_col   = _find_column_near(beam.end,   columns)
        beam_mappings.append({
            "beam": beam.id,
            "start_column": start_col.id if start_col else None,
            "end_column":   end_col.id   if end_col   else None,
        })

    # Print slab → column mapping
    slab_mappings = []
    for slab in result.slabs:
        if slab.polygon:
            bb = _polygon_bbox(slab.polygon)
            bounded_cols = [
                col.id
                for col in columns
                if _point_in_bbox(col.center, bb, tol=0.02)
            ]
            slab_mappings.append({
                "slab": slab.id,
                "bounded_columns": bounded_cols,
            })

    if beam_mappings or slab_mappings:
        print_success(
            f"Civil topology: "
            f"{len(beam_mappings)} beam(s) mapped to columns, "
            f"{len(slab_mappings)} slab(s) mapped to columns."
        )

    return result   # Civil result is returned as-is (topology is informational)


# ======================================================
# Dispatcher
# ======================================================

def build_topology(
    result: SpatialArchitecturalResult | SpatialCivilResult | SpatialMixedResult,
) -> SpatialArchitecturalResult | SpatialCivilResult | SpatialMixedResult:
    if isinstance(result, SpatialArchitecturalResult):
        return build_architectural_topology(result)
    if isinstance(result, SpatialCivilResult):
        return build_civil_topology(result)
    if isinstance(result, SpatialMixedResult):
        return SpatialMixedResult(
            scale_bar=result.scale_bar,
            image_width_px=result.image_width_px,
            image_height_px=result.image_height_px,
            architectural=build_architectural_topology(result.architectural),
            civil=build_civil_topology(result.civil),
        )
    raise TypeError(f"Unknown result type: {type(result)}")
