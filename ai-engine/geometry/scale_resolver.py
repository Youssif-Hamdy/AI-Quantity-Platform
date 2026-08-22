"""
Scale Resolver

Converts normalized coordinates → real-world metres.

Resolution priority:
  1. Scale bar detected in the image (e.g. "1:100")
  2. Dimension text in the drawing (e.g. "3.50 x 4.00 m")
  3. Column size text (e.g. "30x30 cm") cross-checked with pixel distance
  4. Fallback: estimate from image DPI and paper size

After scale is resolved every polygon is annotated with:
  - Real-world length and width (metres)
  - Area (m²) and perimeter (m) for rooms
  - Volume (m³) for columns, beams and slabs
"""

from __future__ import annotations

import math
import re

from geometry.models import (
    Point,
    ScaleBar,
    SpatialRoom,
    SpatialColumn,
    SpatialBeam,
    SpatialSlab,
    SpatialSteelBar,
    SpatialWall,
    SpatialDoor,
    SpatialWindow,
    SpatialArchitecturalResult,
    SpatialCivilResult,
    SpatialMixedResult,
)
from utils import print_success


# ======================================================
# Scale Detection
# ======================================================

# Common paper widths in metres (A0..A4 landscape)
_PAPER_WIDTHS_M = {
    "A0": 1.189,
    "A1": 0.841,
    "A2": 0.594,
    "A3": 0.420,
    "A4": 0.297,
}

_SCALE_PATTERN = re.compile(
    r"(?:scale\s*)?1\s*[:/]\s*(\d+)",
    re.IGNORECASE,
)

_DIM_PATTERN = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*(m|cm|mm)?",
)


def _parse_scale_ratio(text: str) -> float | None:
    """Extract the denominator from a '1:N' or '1/N' string."""
    m = _SCALE_PATTERN.search(text)
    if m:
        return float(m.group(1))
    return None


def _parse_dim_text(text: str) -> tuple[float, float] | None:
    """
    Parse a dimension string like '3.50 x 4.00 m' or '350 x 400'.
    Returns (val1_m, val2_m) in metres, or None if unparseable.
    """
    m = _DIM_PATTERN.search(text)
    if not m:
        return None
    v1 = float(m.group(1).replace(",", "."))
    v2 = float(m.group(2).replace(",", "."))
    unit = (m.group(3) or "").lower()
    if unit == "cm":
        v1 /= 100
        v2 /= 100
    elif unit == "mm":
        v1 /= 1000
        v2 /= 1000
    elif unit == "" and max(v1, v2) > 20:
        # Bare numbers > 20 are likely centimetres
        v1 /= 100
        v2 /= 100
    return v1, v2


def _parse_size_text(text: str) -> tuple[float, float] | None:
    """
    Parse a size string like '30x30 cm' or '25x50'.
    Returns (dim1_m, dim2_m) in metres.
    """
    return _parse_dim_text(text)


def _pixel_distance(a: Point, b: Point, img_w: int, img_h: int) -> float:
    """Euclidean distance between two pixel points."""
    dx = b.x - a.x
    dy = b.y - a.y
    return math.hypot(dx, dy)


def _normalized_to_m(
    pixels_val: float,
    img_pixels: int,
    scale_ratio: float,
    dpi: int = 300,
) -> float:
    """
    Convert a pixel dimension to metres.
    pixels_val = dimension in pixels
    img_pixels = image dimension in pixels
    scale_ratio = denominator of drawing scale (e.g. 100 for 1:100)
    dpi = dots per inch of the image
    """
    inches = pixels_val / dpi
    metres_on_paper = inches * 0.0254        # 1 inch = 0.0254 m
    metres_real     = metres_on_paper * scale_ratio
    return metres_real


def _polygon_perimeter_m(
    pts: list[Point],
    img_w: int,
    img_h: int,
    scale_ratio: float,
    dpi: int = 300,
) -> float:
    total = 0.0
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        px_dist = _pixel_distance(pts[i], pts[j], img_w, img_h)
        inches  = px_dist / dpi
        total  += inches * 0.0254 * scale_ratio
    return total


def _polygon_area_m2(
    pts: list[Point],
    img_w: int,
    img_h: int,
    scale_ratio: float,
    dpi: int = 300,
) -> float:
    """Shoelace in pixel-space then convert to m²."""
    n = len(pts)
    if n < 3:
        return 0.0
    area_px2 = 0.0
    for i in range(n):
        j = (i + 1) % n
        px_i = pts[i].x, pts[i].y
        px_j = pts[j].x, pts[j].y
        area_px2 += px_i[0] * px_j[1]
        area_px2 -= px_j[0] * px_i[1]
    area_px2 = abs(area_px2) / 2.0
    m_per_px = (0.0254 / dpi) * scale_ratio
    return area_px2 * (m_per_px ** 2)


# ======================================================
# Scale Resolver Class
# ======================================================

class ScaleResolver:
    """
    Resolves the drawing scale and annotates every element
    with real-world dimensions in metres.
    """

    def __init__(self, dpi: int = 300):
        self.dpi = dpi

    # --------------------------------------------------
    # Scale detection
    # --------------------------------------------------

    def _resolve_scale(
        self,
        scale_bar: ScaleBar,
        rooms_or_columns: list,
        img_w: int,
        img_h: int,
    ) -> float:
        """
        Return the drawing scale ratio (e.g. 100 for 1:100).
        Tries multiple strategies.
        """

        # Strategy 1 — scale bar text
        if scale_bar.text:
            ratio = _parse_scale_ratio(scale_bar.text)
            if ratio:
                print(f"  [ScaleResolver] Using scale bar: 1:{ratio:.0f}")
                return ratio

        # Strategy 2 — dimension text on the first room
        if rooms_or_columns:
            first = rooms_or_columns[0]
            dim_text = getattr(first, "dimensions_text", None)
            if dim_text:
                dims = _parse_dim_text(dim_text)
                if dims and getattr(first, "polygon", None):
                    # Estimate from bounding box of room polygon
                    pts  = first.polygon
                    xs   = [p.x for p in pts]
                    ys   = [p.y for p in pts]
                    bb_w = (max(xs) - min(xs)) * img_w   # pixels
                    bb_h = (max(ys) - min(ys)) * img_h
                    bb_w_m = (bb_w / self.dpi) * 0.0254
                    bb_h_m = (bb_h / self.dpi) * 0.0254

                    real_w, real_h = dims
                    if bb_w_m > 0:
                        ratio_w = real_w / bb_w_m
                        ratio_h = real_h / bb_h_m if bb_h_m > 0 else ratio_w
                        ratio   = (ratio_w + ratio_h) / 2
                        print(
                            f"  [ScaleResolver] Inferred scale 1:{ratio:.0f} "
                            f"from dimension text '{dim_text}'"
                        )
                        return ratio

        # Strategy 3 — column size + pixel footprint
        if rooms_or_columns:
            for elem in rooms_or_columns:
                size_text = getattr(elem, "size_text", None)
                if not size_text:
                    continue
                dims = _parse_size_text(size_text)
                if not dims:
                    continue
                col_w_m = dims[0]
                # Estimate column footprint from nearby columns
                # (we compare first two if available)
                if hasattr(elem, "center") and len(rooms_or_columns) > 1:
                    next_elem = rooms_or_columns[1]
                    if hasattr(next_elem, "center"):
                        px_dist = _pixel_distance(
                            elem.center, next_elem.center, img_w, img_h
                        )
                        if px_dist > 0:
                            paper_m = (px_dist / self.dpi) * 0.0254
                            # Assume typical bay spacing ≈ 5 m, ratio ≈ real/paper
                            # But better to use the column size itself:
                            # col_w_m (real) = ? × paper_col_w_m
                            # We need col size in pixels, skip for now.
                            pass

        # Strategy 4 — A1 paper fallback
        paper_w_m  = _PAPER_WIDTHS_M["A1"]
        paper_w_px = img_w
        paper_m    = (paper_w_px / self.dpi) * 0.0254
        ratio      = paper_w_m / paper_m
        # Snap to nearest common scale
        common_scales = [20, 25, 50, 100, 200, 500]
        ratio = min(common_scales, key=lambda s: abs(s - ratio))
        print(
            f"  [ScaleResolver] Using paper-size fallback: "
            f"1:{ratio} (estimated from image dimensions)"
        )
        return float(ratio)

    # --------------------------------------------------
    # Architectural resolution
    # --------------------------------------------------

    def resolve_architectural(
        self, result: SpatialArchitecturalResult
    ) -> SpatialArchitecturalResult:
        img_w = result.image_width_px or 3508
        img_h = result.image_height_px or 2480

        scale = self._resolve_scale(
            result.scale_bar, result.rooms, img_w, img_h
        )

        resolved_rooms: list[SpatialRoom] = []
        for room in result.rooms:
            pts = room.polygon

            # Prefer dimension text if available
            dim_override = _parse_dim_text(room.dimensions_text or "")
            if dim_override:
                length_m, width_m = dim_override
                area_calc = length_m * width_m
                perim_calc = 2 * (length_m + width_m)
            elif pts:
                xs = [p.x for p in pts]
                ys = [p.y for p in pts]
                length_m = _normalized_to_m(max(xs) - min(xs), img_w, scale, self.dpi)
                width_m = _normalized_to_m(max(ys) - min(ys), img_h, scale, self.dpi)
                area_calc = _polygon_area_m2(pts, img_w, img_h, scale, self.dpi)
                perim_calc = _polygon_perimeter_m(pts, img_w, img_h, scale, self.dpi)
            else:
                length_m = width_m = area_calc = perim_calc = None

            # CRITICAL: If AI already provided area_m2 (from parsing printed text directly),
            # DO NOT overwrite it with a calculated/polygon area.
            final_area = room.area_m2 if room.area_m2 is not None else area_calc
            final_perim = room.perimeter_m if room.perimeter_m is not None else perim_calc

            # Resolve door widths
            resolved_doors = []
            for door in room.doors:
                dw = _parse_dim_text(door.width_text or "")
                dh = _parse_dim_text(door.height_text or "")
                resolved_doors.append(
                    SpatialDoor(
                        label=door.label,
                        width_text=door.width_text,
                        height_text=door.height_text,
                        width_m=dw[0] if dw else None,
                        height_m=dh[0] if dh else None,
                        position=door.position,
                        swing_direction=door.swing_direction,
                        quantity=door.quantity,
                    )
                )

            # Resolve window widths
            resolved_windows = []
            for win in room.windows:
                ww = _parse_dim_text(win.width_text or "")
                wh = _parse_dim_text(win.height_text or "")
                resolved_windows.append(
                    SpatialWindow(
                        label=win.label,
                        width_text=win.width_text,
                        height_text=win.height_text,
                        width_m=ww[0] if ww else None,
                        height_m=wh[0] if wh else None,
                        position=win.position,
                        quantity=win.quantity,
                    )
                )

            # Resolve wall lengths
            resolved_walls = []
            for wall in room.walls:
                wall_len = None
                if wall.start and wall.end:
                    px_d   = _pixel_distance(wall.start, wall.end, img_w, img_h)
                    wall_len = (px_d / self.dpi) * 0.0254 * scale
                resolved_walls.append(
                    SpatialWall(
                        start=wall.start,
                        end=wall.end,
                        thickness_text=wall.thickness_text,
                        length_m=wall_len,
                    )
                )

            resolved_rooms.append(
                SpatialRoom(
                    id=room.id,
                    name=room.name,
                    polygon=pts,
                    label_position=room.label_position,
                    dimensions_text=room.dimensions_text,
                    length_m=round(length_m, 3) if length_m else None,
                    width_m=round(width_m, 3)  if width_m  else None,
                    area_m2=round(final_area, 3)  if final_area  else None,
                    perimeter_m=round(final_perim, 3) if final_perim else None,
                    walls=resolved_walls,
                    doors=resolved_doors,
                    windows=resolved_windows,
                    adjacent_rooms=room.adjacent_rooms,
                )
            )

        print_success(
            f"Scale resolved (1:{scale:.0f}) — "
            f"{len(resolved_rooms)} room(s) annotated."
        )

        return SpatialArchitecturalResult(
            scale_bar=result.scale_bar,
            image_width_px=img_w,
            image_height_px=img_h,
            rooms=resolved_rooms,
        )

    # --------------------------------------------------
    # Civil resolution
    # --------------------------------------------------

    def resolve_civil(
        self, result: SpatialCivilResult
    ) -> SpatialCivilResult:
        img_w = result.image_width_px or 3508
        img_h = result.image_height_px or 2480

        scale = self._resolve_scale(
            result.scale_bar,
            result.column_grid.columns,
            img_w,
            img_h,
        )

        from geometry.models import ColumnGrid

        resolved_columns = []
        for col in result.column_grid.columns:
            dims = _parse_size_text(col.size_text or "")
            l_m = dims[0] if dims else None
            w_m = dims[1] if dims else None
            h_m = col.height_m  # from drawing schedule
            vol = (l_m * w_m * h_m) if (l_m and w_m and h_m) else None
            resolved_columns.append(
                SpatialColumn(
                    id=col.id,
                    label=col.label,
                    center=col.center,
                    size_text=col.size_text,
                    length_m=round(l_m, 3) if l_m else None,
                    width_m=round(w_m, 3)  if w_m  else None,
                    height_m=h_m,
                    volume_m3=round(vol, 4) if vol else None,
                    quantity=col.quantity,
                )
            )

        resolved_beams = []
        for beam in result.beams:
            dims = _parse_size_text(beam.size_text or "")
            bw_m = dims[0] if dims else None
            bh_m = dims[1] if dims else None
            bl_m: float | None = None
            if beam.start and beam.end:
                px_d = _pixel_distance(beam.start, beam.end, img_w, img_h)
                bl_m = round((px_d / self.dpi) * 0.0254 * scale, 3)
            vol = (bw_m * bh_m * bl_m) if (bw_m and bh_m and bl_m) else None
            resolved_beams.append(
                SpatialBeam(
                    id=beam.id,
                    label=beam.label,
                    start=beam.start,
                    end=beam.end,
                    size_text=beam.size_text,
                    width_m=round(bw_m, 3)  if bw_m  else None,
                    height_m=round(bh_m, 3) if bh_m  else None,
                    length_m=bl_m,
                    volume_m3=round(vol, 4) if vol else None,
                    quantity=beam.quantity,
                )
            )

        resolved_slabs = []
        for slab in result.slabs:
            area_m2 = _polygon_area_m2(slab.polygon, img_w, img_h, scale, self.dpi)
            t_raw   = _parse_dim_text(slab.thickness_text or "")
            t_m     = t_raw[0] if t_raw else slab.thickness_m
            vol     = (area_m2 * t_m) if (area_m2 and t_m) else None
            resolved_slabs.append(
                SpatialSlab(
                    id=slab.id,
                    label=slab.label,
                    polygon=slab.polygon,
                    thickness_text=slab.thickness_text,
                    thickness_m=round(t_m, 3) if t_m else None,
                    area_m2=round(area_m2, 3) if area_m2 else None,
                    volume_m3=round(vol, 4) if vol else None,
                    quantity=slab.quantity,
                )
            )

        # Steel bars — weight from formula
        resolved_bars = []
        for bar in result.steel_bars:
            d  = bar.diameter_mm
            l  = bar.length_m
            q  = bar.quantity
            wt = ((d ** 2) / 162) * l * q if (d and l) else None
            resolved_bars.append(
                SpatialSteelBar(
                    id=bar.id,
                    label=bar.label,
                    diameter_mm=d,
                    length_m=l,
                    quantity=q,
                    weight_kg=round(wt, 3) if wt else None,
                )
            )

        print_success(
            f"Scale resolved (1:{scale:.0f}) — "
            f"{len(resolved_columns)} column(s), "
            f"{len(resolved_beams)} beam(s), "
            f"{len(resolved_slabs)} slab(s) annotated."
        )

        return SpatialCivilResult(
            scale_bar=result.scale_bar,
            image_width_px=img_w,
            image_height_px=img_h,
            column_grid=ColumnGrid(
                x_axes=result.column_grid.x_axes,
                y_axes=result.column_grid.y_axes,
                columns=resolved_columns,
            ),
            beams=resolved_beams,
            slabs=resolved_slabs,
            steel_bars=resolved_bars,
        )

    # --------------------------------------------------
    # Mixed
    # --------------------------------------------------

    def resolve_mixed(self, result: SpatialMixedResult) -> SpatialMixedResult:
        return SpatialMixedResult(
            scale_bar=result.scale_bar,
            image_width_px=result.image_width_px,
            image_height_px=result.image_height_px,
            architectural=self.resolve_architectural(result.architectural),
            civil=self.resolve_civil(result.civil),
        )

    # --------------------------------------------------
    # Dispatcher
    # --------------------------------------------------

    def resolve(
        self,
        result: SpatialArchitecturalResult | SpatialCivilResult | SpatialMixedResult,
    ) -> SpatialArchitecturalResult | SpatialCivilResult | SpatialMixedResult:
        if isinstance(result, SpatialArchitecturalResult):
            return self.resolve_architectural(result)
        if isinstance(result, SpatialCivilResult):
            return self.resolve_civil(result)
        if isinstance(result, SpatialMixedResult):
            return self.resolve_mixed(result)
        raise TypeError(f"Unknown result type: {type(result)}")
