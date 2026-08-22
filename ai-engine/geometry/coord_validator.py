"""
Coordinate Validator

Cross-validates coordinates from two sources:
  1. AI Vision (Gemini) — good at understanding semantics
  2. Computer Vision (OpenCV) — precise pixel coordinates

Produces a merged, confidence-scored result where:
  - Both agree → HIGH confidence (✅)
  - Small difference → MEDIUM, take weighted average
  - Large difference → LOW, flag for manual review (⚠️)
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum

from geometry.models import (
    Point,
    SpatialRoom,
    SpatialWall,
    SpatialDoor,
    SpatialWindow,
    SpatialColumn,
    SpatialBeam,
    SpatialSlab,
    SpatialArchitecturalResult,
    SpatialCivilResult,
    SpatialMixedResult,
    ScaleBar,
    ColumnGrid,
)

from utils import print_success, print_error


# ======================================================
# Confidence Levels
# ======================================================

class Confidence(str, Enum):
    HIGH   = "high"      # Both sources agree (<2% deviation)
    MEDIUM = "medium"    # Minor discrepancy (2-10%), averaged
    LOW    = "low"       # Large discrepancy (>10%), needs review
    AI_ONLY = "ai_only"  # Only AI source available
    CV_ONLY = "cv_only"  # Only CV source available


# ======================================================
# Validation Report
# ======================================================

@dataclass
class ElementValidation:
    """Validation result for a single element."""
    element_id: str
    element_type: str           # "room", "wall", "door", etc.
    confidence: Confidence
    deviation_pct: float = 0.0  # Percentage deviation between sources
    notes: str = ""


@dataclass
class ValidationReport:
    """Full validation report for a drawing."""
    total_elements: int = 0
    high_confidence: int = 0
    medium_confidence: int = 0
    low_confidence: int = 0
    ai_only: int = 0
    cv_only: int = 0
    overall_accuracy_pct: float = 0.0
    elements: list[ElementValidation] = field(default_factory=list)

    def summary(self) -> str:
        lines = [
            f"╔══════════════════════════════════════════╗",
            f"║      Coordinate Validation Report        ║",
            f"╠══════════════════════════════════════════╣",
            f"║  Total elements : {self.total_elements:>5}                  ║",
            f"║  ✅ High conf.  : {self.high_confidence:>5}  ({self._pct(self.high_confidence)})     ║",
            f"║  ⚠️  Medium conf.: {self.medium_confidence:>5}  ({self._pct(self.medium_confidence)})     ║",
            f"║  ❌ Low conf.   : {self.low_confidence:>5}  ({self._pct(self.low_confidence)})     ║",
            f"║  🔵 AI only     : {self.ai_only:>5}                  ║",
            f"║  🟢 CV only     : {self.cv_only:>5}                  ║",
            f"║  Overall acc.   : {self.overall_accuracy_pct:>5.1f}%               ║",
            f"╚══════════════════════════════════════════╝",
        ]
        return "\n".join(lines)

    def _pct(self, count: int) -> str:
        if self.total_elements == 0:
            return "  0%"
        return f"{count / self.total_elements * 100:>4.0f}%"


# ======================================================
# Thresholds
# ======================================================

# Deviation between normalized coordinates (0.0 – 1.0)
THRESHOLD_HIGH   = 0.02   # <2% deviation → HIGH
THRESHOLD_MEDIUM = 0.10   # 2-10% → MEDIUM, >10% → LOW

# Weight: how much to trust AI vs CV when averaging
AI_WEIGHT = 0.4
CV_WEIGHT = 0.6


# ======================================================
# Core Validator
# ======================================================

class CoordinateValidator:
    """
    Merges and validates coordinates from AI and CV sources.

    Usage:
        validator = CoordinateValidator()
        merged, report = validator.validate_architectural(ai_result, cv_result)
    """

    def __init__(
        self,
        ai_weight: float = AI_WEIGHT,
        cv_weight: float = CV_WEIGHT,
    ):
        self.ai_weight = ai_weight
        self.cv_weight = cv_weight

    # --------------------------------------------------
    # Point-level operations
    # --------------------------------------------------

    @staticmethod
    def _point_deviation(a: Point, b: Point) -> float:
        """Euclidean distance between two normalized points."""
        return math.hypot(a.x - b.x, a.y - b.y)

    def _merge_points(self, ai_pt: Point, cv_pt: Point) -> Point:
        """Weighted average of two points."""
        return Point(
            x=round(ai_pt.x * self.ai_weight + cv_pt.x * self.cv_weight, 6),
            y=round(ai_pt.y * self.ai_weight + cv_pt.y * self.cv_weight, 6),
        )

    def _classify_deviation(self, deviation: float) -> Confidence:
        if deviation < THRESHOLD_HIGH:
            return Confidence.HIGH
        elif deviation < THRESHOLD_MEDIUM:
            return Confidence.MEDIUM
        else:
            return Confidence.LOW

    # --------------------------------------------------
    # Polygon matching
    # --------------------------------------------------

    @staticmethod
    def _polygon_centroid(pts: list[Point]) -> Point:
        if not pts:
            return Point(x=0.5, y=0.5)
        return Point(
            x=sum(p.x for p in pts) / len(pts),
            y=sum(p.y for p in pts) / len(pts),
        )

    def _match_rooms(
        self,
        ai_rooms: list[SpatialRoom],
        cv_rooms: list[SpatialRoom],
    ) -> list[tuple[SpatialRoom | None, SpatialRoom | None]]:
        """
        Match AI rooms to CV rooms by centroid proximity.
        Returns pairs of (ai_room, cv_room). Either may be None.
        """
        pairs: list[tuple[SpatialRoom | None, SpatialRoom | None]] = []
        used_cv: set[int] = set()

        for ai_room in ai_rooms:
            ai_centroid = self._polygon_centroid(ai_room.polygon)
            best_idx = -1
            best_dist = float("inf")

            for j, cv_room in enumerate(cv_rooms):
                if j in used_cv:
                    continue
                cv_centroid = self._polygon_centroid(cv_room.polygon)
                dist = self._point_deviation(ai_centroid, cv_centroid)
                if dist < best_dist:
                    best_dist = dist
                    best_idx = j

            if best_idx >= 0 and best_dist < 0.3:  # Max 30% apart
                used_cv.add(best_idx)
                pairs.append((ai_room, cv_rooms[best_idx]))
            else:
                pairs.append((ai_room, None))

        # Add unmatched CV rooms
        for j, cv_room in enumerate(cv_rooms):
            if j not in used_cv:
                pairs.append((None, cv_room))

        return pairs

    # --------------------------------------------------
    # Room-level merge
    # --------------------------------------------------

    def _merge_room(
        self,
        ai_room: SpatialRoom | None,
        cv_room: SpatialRoom | None,
        room_idx: int,
    ) -> tuple[SpatialRoom, ElementValidation]:
        """Merge a single room from both sources."""

        room_id = f"R{room_idx + 1}"

        # AI only
        if ai_room and not cv_room:
            return ai_room, ElementValidation(
                element_id=room_id,
                element_type="room",
                confidence=Confidence.AI_ONLY,
                notes=f"'{ai_room.name}' — AI only, no CV match.",
            )

        # CV only
        if cv_room and not ai_room:
            return cv_room, ElementValidation(
                element_id=room_id,
                element_type="room",
                confidence=Confidence.CV_ONLY,
                notes="CV only, no AI match.",
            )

        # Both available — merge polygons
        assert ai_room is not None and cv_room is not None

        # Compare centroids
        ai_centroid = self._polygon_centroid(ai_room.polygon)
        cv_centroid = self._polygon_centroid(cv_room.polygon)
        deviation = self._point_deviation(ai_centroid, cv_centroid)
        confidence = self._classify_deviation(deviation)

        # Merge polygon — take CV polygon (more precise) but keep AI metadata
        if confidence == Confidence.HIGH:
            merged_polygon = cv_room.polygon  # Trust CV
        elif confidence == Confidence.MEDIUM:
            # Average the polygons if same vertex count
            if len(ai_room.polygon) == len(cv_room.polygon):
                merged_polygon = [
                    self._merge_points(ai_pt, cv_pt)
                    for ai_pt, cv_pt in zip(ai_room.polygon, cv_room.polygon)
                ]
            else:
                merged_polygon = cv_room.polygon
        else:
            # LOW — keep both, but prefer CV for coordinates
            merged_polygon = cv_room.polygon

        merged_room = SpatialRoom(
            id=room_id,
            name=ai_room.name,  # AI is better at naming
            polygon=merged_polygon,
            label_position=cv_room.label_position or ai_room.label_position,
            dimensions_text=ai_room.dimensions_text,  # AI reads text
            length_m=ai_room.length_m,
            width_m=ai_room.width_m,
            height_m=ai_room.height_m,
            area_m2=ai_room.area_m2,
            perimeter_m=ai_room.perimeter_m,
            walls=cv_room.walls if cv_room.walls else ai_room.walls,
            doors=ai_room.doors,  # AI better at classifying
            windows=ai_room.windows,
            adjacent_rooms=ai_room.adjacent_rooms,
        )

        validation = ElementValidation(
            element_id=room_id,
            element_type="room",
            confidence=confidence,
            deviation_pct=round(deviation * 100, 2),
            notes=f"'{ai_room.name}' — {confidence.value} ({deviation*100:.1f}% dev)",
        )

        return merged_room, validation

    # --------------------------------------------------
    # Architectural validation
    # --------------------------------------------------

    def validate_architectural(
        self,
        ai_result: SpatialArchitecturalResult,
        cv_result: SpatialArchitecturalResult,
    ) -> tuple[SpatialArchitecturalResult, ValidationReport]:
        """
        Merge and validate AI and CV architectural results.
        Returns (merged_result, validation_report).
        """
        pairs = self._match_rooms(ai_result.rooms, cv_result.rooms)

        report = ValidationReport()
        merged_rooms: list[SpatialRoom] = []

        for idx, (ai_room, cv_room) in enumerate(pairs):
            merged_room, validation = self._merge_room(ai_room, cv_room, idx)
            merged_rooms.append(merged_room)
            report.elements.append(validation)

            report.total_elements += 1
            if validation.confidence == Confidence.HIGH:
                report.high_confidence += 1
            elif validation.confidence == Confidence.MEDIUM:
                report.medium_confidence += 1
            elif validation.confidence == Confidence.LOW:
                report.low_confidence += 1
            elif validation.confidence == Confidence.AI_ONLY:
                report.ai_only += 1
            elif validation.confidence == Confidence.CV_ONLY:
                report.cv_only += 1

        # Count walls, doors, windows
        for room in merged_rooms:
            for wall in room.walls:
                report.total_elements += 1
                report.high_confidence += 1  # walls from CV are precise
            for door in room.doors:
                report.total_elements += 1
                report.ai_only += 1  # doors from AI
            for win in room.windows:
                report.total_elements += 1
                report.ai_only += 1

        # Overall accuracy
        if report.total_elements > 0:
            confident = report.high_confidence + report.medium_confidence
            report.overall_accuracy_pct = round(
                confident / report.total_elements * 100, 1
            )

        merged_result = SpatialArchitecturalResult(
            scale_bar=ai_result.scale_bar,  # AI reads scale text better
            image_width_px=ai_result.image_width_px or cv_result.image_width_px,
            image_height_px=ai_result.image_height_px or cv_result.image_height_px,
            rooms=merged_rooms,
        )

        print_success(
            f"Validation complete — {report.overall_accuracy_pct:.0f}% confident "
            f"({report.high_confidence} high, {report.medium_confidence} medium, "
            f"{report.low_confidence} low)"
        )

        return merged_result, report

    # --------------------------------------------------
    # Civil validation
    # --------------------------------------------------

    def validate_civil(
        self,
        ai_result: SpatialCivilResult,
        cv_result: SpatialCivilResult,
    ) -> tuple[SpatialCivilResult, ValidationReport]:
        """Merge and validate civil results."""
        report = ValidationReport()

        # Columns: match by center proximity
        merged_columns = self._merge_columns(
            ai_result.column_grid.columns,
            cv_result.column_grid.columns,
            report,
        )

        # Beams: match by start/end proximity
        merged_beams = self._merge_beams(
            ai_result.beams, cv_result.beams, report,
        )

        # Slabs: match by centroid
        merged_slabs = self._merge_slabs(
            ai_result.slabs, cv_result.slabs, report,
        )

        # Steel bars: take AI (CV can't detect bar specs)
        merged_bars = ai_result.steel_bars
        for bar in merged_bars:
            report.total_elements += 1
            report.ai_only += 1

        if report.total_elements > 0:
            confident = report.high_confidence + report.medium_confidence
            report.overall_accuracy_pct = round(
                confident / report.total_elements * 100, 1
            )

        merged_result = SpatialCivilResult(
            scale_bar=ai_result.scale_bar,
            image_width_px=ai_result.image_width_px or cv_result.image_width_px,
            image_height_px=ai_result.image_height_px or cv_result.image_height_px,
            column_grid=ColumnGrid(
                x_axes=ai_result.column_grid.x_axes,
                y_axes=ai_result.column_grid.y_axes,
                columns=merged_columns,
            ),
            beams=merged_beams,
            slabs=merged_slabs,
            steel_bars=merged_bars,
        )

        print_success(
            f"Civil validation — {report.overall_accuracy_pct:.0f}% confident"
        )

        return merged_result, report

    def _merge_columns(
        self,
        ai_cols: list[SpatialColumn],
        cv_cols: list[SpatialColumn],
        report: ValidationReport,
    ) -> list[SpatialColumn]:
        merged = []
        used_cv: set[int] = set()

        for ai_col in ai_cols:
            best_j = -1
            best_dist = float("inf")

            for j, cv_col in enumerate(cv_cols):
                if j in used_cv:
                    continue
                dist = self._point_deviation(ai_col.center, cv_col.center)
                if dist < best_dist:
                    best_dist = dist
                    best_j = j

            report.total_elements += 1

            if best_j >= 0 and best_dist < 0.15:
                used_cv.add(best_j)
                cv_col = cv_cols[best_j]
                confidence = self._classify_deviation(best_dist)

                center = (
                    cv_col.center if confidence == Confidence.HIGH
                    else self._merge_points(ai_col.center, cv_col.center)
                )

                merged.append(SpatialColumn(
                    id=ai_col.id,
                    label=ai_col.label,
                    center=center,
                    size_text=ai_col.size_text,
                    length_m=ai_col.length_m,
                    width_m=ai_col.width_m,
                    height_m=ai_col.height_m,
                    volume_m3=ai_col.volume_m3,
                    quantity=ai_col.quantity,
                ))

                if confidence == Confidence.HIGH:
                    report.high_confidence += 1
                elif confidence == Confidence.MEDIUM:
                    report.medium_confidence += 1
                else:
                    report.low_confidence += 1
            else:
                merged.append(ai_col)
                report.ai_only += 1

        for j, cv_col in enumerate(cv_cols):
            if j not in used_cv:
                merged.append(cv_col)
                report.total_elements += 1
                report.cv_only += 1

        return merged

    def _merge_beams(
        self,
        ai_beams: list[SpatialBeam],
        cv_beams: list[SpatialBeam],
        report: ValidationReport,
    ) -> list[SpatialBeam]:
        merged = []
        used_cv: set[int] = set()

        for ai_beam in ai_beams:
            best_j = -1
            best_dist = float("inf")

            ai_mid = Point(
                x=(ai_beam.start.x + ai_beam.end.x) / 2,
                y=(ai_beam.start.y + ai_beam.end.y) / 2,
            )

            for j, cv_beam in enumerate(cv_beams):
                if j in used_cv:
                    continue
                cv_mid = Point(
                    x=(cv_beam.start.x + cv_beam.end.x) / 2,
                    y=(cv_beam.start.y + cv_beam.end.y) / 2,
                )
                dist = self._point_deviation(ai_mid, cv_mid)
                if dist < best_dist:
                    best_dist = dist
                    best_j = j

            report.total_elements += 1

            if best_j >= 0 and best_dist < 0.15:
                used_cv.add(best_j)
                cv_beam = cv_beams[best_j]
                confidence = self._classify_deviation(best_dist)

                start = (
                    cv_beam.start if confidence == Confidence.HIGH
                    else self._merge_points(ai_beam.start, cv_beam.start)
                )
                end = (
                    cv_beam.end if confidence == Confidence.HIGH
                    else self._merge_points(ai_beam.end, cv_beam.end)
                )

                merged.append(SpatialBeam(
                    id=ai_beam.id,
                    label=ai_beam.label,
                    start=start,
                    end=end,
                    size_text=ai_beam.size_text,
                    width_m=ai_beam.width_m,
                    height_m=ai_beam.height_m,
                    length_m=ai_beam.length_m,
                    volume_m3=ai_beam.volume_m3,
                    quantity=ai_beam.quantity,
                ))

                if confidence == Confidence.HIGH:
                    report.high_confidence += 1
                elif confidence == Confidence.MEDIUM:
                    report.medium_confidence += 1
                else:
                    report.low_confidence += 1
            else:
                merged.append(ai_beam)
                report.ai_only += 1

        for j, cv_beam in enumerate(cv_beams):
            if j not in used_cv:
                merged.append(cv_beam)
                report.total_elements += 1
                report.cv_only += 1

        return merged

    def _merge_slabs(
        self,
        ai_slabs: list[SpatialSlab],
        cv_slabs: list[SpatialSlab],
        report: ValidationReport,
    ) -> list[SpatialSlab]:
        merged = []
        used_cv: set[int] = set()

        for ai_slab in ai_slabs:
            ai_centroid = self._polygon_centroid(ai_slab.polygon)
            best_j = -1
            best_dist = float("inf")

            for j, cv_slab in enumerate(cv_slabs):
                if j in used_cv:
                    continue
                cv_centroid = self._polygon_centroid(cv_slab.polygon)
                dist = self._point_deviation(ai_centroid, cv_centroid)
                if dist < best_dist:
                    best_dist = dist
                    best_j = j

            report.total_elements += 1

            if best_j >= 0 and best_dist < 0.2:
                used_cv.add(best_j)
                cv_slab = cv_slabs[best_j]
                confidence = self._classify_deviation(best_dist)

                polygon = (
                    cv_slab.polygon if confidence == Confidence.HIGH
                    else cv_slab.polygon  # CV is always more precise for shapes
                )

                merged.append(SpatialSlab(
                    id=ai_slab.id,
                    label=ai_slab.label,
                    polygon=polygon,
                    thickness_text=ai_slab.thickness_text,
                    thickness_m=ai_slab.thickness_m,
                    area_m2=ai_slab.area_m2,
                    volume_m3=ai_slab.volume_m3,
                    quantity=ai_slab.quantity,
                ))

                if confidence == Confidence.HIGH:
                    report.high_confidence += 1
                elif confidence == Confidence.MEDIUM:
                    report.medium_confidence += 1
                else:
                    report.low_confidence += 1
            else:
                merged.append(ai_slab)
                report.ai_only += 1

        for j, cv_slab in enumerate(cv_slabs):
            if j not in used_cv:
                merged.append(cv_slab)
                report.total_elements += 1
                report.cv_only += 1

        return merged


# ──────────────────────────────────────────────────────
# Standalone test
# ──────────────────────────────────────────────────────

if __name__ == "__main__":
    print("CoordinateValidator — import and use programmatically.")
    print("See tools/coord_editor.py for interactive usage.")
