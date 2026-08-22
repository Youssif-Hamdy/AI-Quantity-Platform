"""
CV Detector — Computer Vision Coordinate Extractor

Uses OpenCV to detect structural and architectural elements
from engineering drawings with pixel-level accuracy.

Pipeline:
  1. Preprocessing (grayscale, denoise, threshold)
  2. Line Detection (HoughLinesP) → walls
  3. Contour Detection → rooms / slabs
  4. Small-contour Detection → doors / windows / columns
  5. Normalize all coordinates to 0.0–1.0

This provides a ground-truth-quality alternative to
pure AI-based coordinate extraction.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import cv2
import numpy as np

from geometry.models import (
    Point,
    ScaleBar,
    SpatialRoom,
    SpatialWall,
    SpatialDoor,
    SpatialWindow,
    SpatialColumn,
    SpatialBeam,
    SpatialSlab,
    SpatialArchitecturalResult,
    SpatialCivilResult,
    ColumnGrid,
)

from utils import print_success, print_error


# ======================================================
# Configuration
# ======================================================

@dataclass
class CVConfig:
    """Tuneable parameters for detection."""

    # Preprocessing
    blur_kernel: int = 5
    adaptive_block_size: int = 15
    adaptive_c: int = 8

    # Line detection (walls)
    hough_rho: float = 1.0
    hough_theta: float = math.pi / 180
    hough_threshold: int = 80
    hough_min_line_length: int = 50
    hough_max_line_gap: int = 15

    # Contour filtering (rooms)
    min_room_area_ratio: float = 0.005     # min 0.5% of image area
    max_room_area_ratio: float = 0.60      # max 60% of image area
    min_room_vertices: int = 4

    # Small elements (doors, windows, columns)
    min_small_area_ratio: float = 0.0003   # 0.03% of image
    max_small_area_ratio: float = 0.005    # 0.5% of image

    # Wall merging
    wall_merge_angle_deg: float = 5.0      # merge lines within 5°
    wall_merge_dist_px: float = 20.0       # merge endpoints within 20px

    # Morphological operations
    morph_kernel_size: int = 3
    morph_iterations: int = 2


# ======================================================
# Result Containers
# ======================================================

@dataclass
class CVLine:
    """A detected line segment in pixel coords."""
    x1: int
    y1: int
    x2: int
    y2: int
    angle: float = 0.0
    length: float = 0.0


@dataclass
class CVContour:
    """A detected contour with properties."""
    points: list[tuple[int, int]]
    area: float = 0.0
    perimeter: float = 0.0
    bounding_rect: tuple[int, int, int, int] = (0, 0, 0, 0)  # x,y,w,h
    approx_vertices: int = 0
    is_convex: bool = False
    aspect_ratio: float = 1.0


@dataclass
class CVDetectionResult:
    """Raw CV detection results (pixel coordinates)."""
    image_width: int = 0
    image_height: int = 0
    walls: list[CVLine] = field(default_factory=list)
    room_contours: list[CVContour] = field(default_factory=list)
    small_contours: list[CVContour] = field(default_factory=list)
    debug_images: dict[str, np.ndarray] = field(default_factory=dict)


# ======================================================
# CV Detector
# ======================================================

class CVDetector:
    """
    Detects elements in engineering drawings using OpenCV.

    Usage:
        detector = CVDetector()
        result = detector.detect("path/to/page.png")
        spatial = detector.to_spatial_architectural(result)
    """

    def __init__(self, config: CVConfig | None = None):
        self.config = config or CVConfig()

    # --------------------------------------------------
    # Preprocessing
    # --------------------------------------------------

    def _preprocess(self, image: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """
        Convert to grayscale, denoise, and create binary image.
        Returns (grayscale, binary).
        """
        # Convert to grayscale
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()

        # Denoise
        denoised = cv2.fastNlMeansDenoising(
            gray, None, h=10, templateWindowSize=7, searchWindowSize=21
        )

        # Adaptive threshold — works well on drawings with varying lighting
        binary = cv2.adaptiveThreshold(
            denoised,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            self.config.adaptive_block_size,
            self.config.adaptive_c,
        )

        # Morphological close to fill small gaps in lines
        kernel = np.ones(
            (self.config.morph_kernel_size, self.config.morph_kernel_size),
            np.uint8,
        )
        binary = cv2.morphologyEx(
            binary, cv2.MORPH_CLOSE, kernel,
            iterations=self.config.morph_iterations,
        )

        return gray, binary

    # --------------------------------------------------
    # Line Detection (Walls)
    # --------------------------------------------------

    def _detect_lines(self, binary: np.ndarray) -> list[CVLine]:
        """Detect straight lines using Probabilistic Hough Transform."""
        cfg = self.config

        lines_raw = cv2.HoughLinesP(
            binary,
            rho=cfg.hough_rho,
            theta=cfg.hough_theta,
            threshold=cfg.hough_threshold,
            minLineLength=cfg.hough_min_line_length,
            maxLineGap=cfg.hough_max_line_gap,
        )

        if lines_raw is None:
            return []

        lines: list[CVLine] = []
        for segment in lines_raw:
            val = segment.ravel()
            if len(val) == 4:
                x1, y1, x2, y2 = val
                angle = math.degrees(math.atan2(y2 - y1, x2 - x1)) % 180
                length = math.hypot(x2 - x1, y2 - y1)
                lines.append(CVLine(
                    x1=int(x1), y1=int(y1), x2=int(x2), y2=int(y2),
                    angle=angle, length=length,
                ))

        return self._merge_lines(lines)

    def _merge_lines(self, lines: list[CVLine]) -> list[CVLine]:
        """
        Merge collinear line segments that are close together.
        This reduces duplicate wall detections.
        """
        if not lines:
            return lines

        cfg = self.config
        merged: list[CVLine] = []
        used = [False] * len(lines)

        for i, line_a in enumerate(lines):
            if used[i]:
                continue

            # Collect all lines that should merge with line_a
            group = [line_a]
            used[i] = True

            for j in range(i + 1, len(lines)):
                if used[j]:
                    continue

                line_b = lines[j]

                # Check angle similarity
                angle_diff = abs(line_a.angle - line_b.angle)
                if angle_diff > 90:
                    angle_diff = 180 - angle_diff
                if angle_diff > cfg.wall_merge_angle_deg:
                    continue

                # Check endpoint proximity
                min_dist = min(
                    math.hypot(line_a.x1 - line_b.x1, line_a.y1 - line_b.y1),
                    math.hypot(line_a.x1 - line_b.x2, line_a.y1 - line_b.y2),
                    math.hypot(line_a.x2 - line_b.x1, line_a.y2 - line_b.y1),
                    math.hypot(line_a.x2 - line_b.x2, line_a.y2 - line_b.y2),
                )
                if min_dist > cfg.wall_merge_dist_px:
                    continue

                group.append(line_b)
                used[j] = True

            # Merge group into one line spanning the full extent
            all_points = []
            for ln in group:
                all_points.append((ln.x1, ln.y1))
                all_points.append((ln.x2, ln.y2))

            # Find the two most distant points
            max_dist = 0
            best_pair = (all_points[0], all_points[-1])
            for p1 in all_points:
                for p2 in all_points:
                    d = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
                    if d > max_dist:
                        max_dist = d
                        best_pair = (p1, p2)

            p1, p2 = best_pair
            angle = math.degrees(math.atan2(p2[1] - p1[1], p2[0] - p1[0])) % 180
            merged.append(CVLine(
                x1=p1[0], y1=p1[1], x2=p2[0], y2=p2[1],
                angle=angle, length=max_dist,
            ))

        return merged

    # --------------------------------------------------
    # Contour Detection (Rooms, Slabs)
    # --------------------------------------------------

    def _detect_contours(
        self, binary: np.ndarray
    ) -> tuple[list[CVContour], list[CVContour]]:
        """
        Detect and classify contours into:
          - room_contours: large closed areas (rooms / slabs)
          - small_contours: small elements (doors, windows, columns)
        """
        img_area = binary.shape[0] * binary.shape[1]

        # Invert for findContours (we want white areas = rooms)
        inverted = cv2.bitwise_not(binary)

        contours, hierarchy = cv2.findContours(
            inverted, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE,
        )

        rooms: list[CVContour] = []
        smalls: list[CVContour] = []

        for cnt in contours:
            area = cv2.contourArea(cnt)
            ratio = area / img_area

            # Skip too small or too big
            if ratio < self.config.min_small_area_ratio:
                continue
            if ratio > self.config.max_room_area_ratio:
                continue

            perimeter = cv2.arcLength(cnt, True)
            # Approximate polygon with accuracy proportional to perimeter
            epsilon = 0.02 * perimeter
            approx = cv2.approxPolyDP(cnt, epsilon, True)

            x, y, w, h = cv2.boundingRect(cnt)
            aspect = w / h if h > 0 else 1.0

            contour = CVContour(
                points=[(int(p[0][0]), int(p[0][1])) for p in approx],
                area=area,
                perimeter=perimeter,
                bounding_rect=(x, y, w, h),
                approx_vertices=len(approx),
                is_convex=cv2.isContourConvex(approx),
                aspect_ratio=aspect,
            )

            if ratio >= self.config.min_room_area_ratio:
                if contour.approx_vertices >= self.config.min_room_vertices:
                    rooms.append(contour)
            elif ratio >= self.config.min_small_area_ratio:
                smalls.append(contour)

        return rooms, smalls

    # --------------------------------------------------
    # Main Detection
    # --------------------------------------------------

    def detect(
        self,
        image_path: str | Path,
        save_debug: bool = False,
    ) -> CVDetectionResult:
        """
        Run full CV detection on an image.

        Args:
            image_path: path to the PNG/JPG image
            save_debug: if True, save annotated debug images

        Returns:
            CVDetectionResult with all detections in pixel coordinates
        """
        image_path = str(image_path)
        image = cv2.imread(image_path)

        if image is None:
            raise FileNotFoundError(f"Cannot read image: {image_path}")

        h, w = image.shape[:2]

        # Step 1 — Preprocess
        gray, binary = self._preprocess(image)

        # Step 2 — Detect lines (walls)
        walls = self._detect_lines(binary)

        # Step 3 — Detect contours (rooms + small elements)
        room_contours, small_contours = self._detect_contours(binary)

        result = CVDetectionResult(
            image_width=w,
            image_height=h,
            walls=walls,
            room_contours=room_contours,
            small_contours=small_contours,
        )

        # Save debug images
        if save_debug:
            result.debug_images = self._create_debug_images(
                image, walls, room_contours, small_contours
            )

        print_success(
            f"CV Detection: {len(walls)} wall(s), "
            f"{len(room_contours)} room(s), "
            f"{len(small_contours)} small element(s)"
        )

        return result

    def _create_debug_images(
        self,
        original: np.ndarray,
        walls: list[CVLine],
        rooms: list[CVContour],
        smalls: list[CVContour],
    ) -> dict[str, np.ndarray]:
        """Create annotated images for debugging."""
        debug = {}

        # Walls overlay
        wall_img = original.copy()
        for wall in walls:
            cv2.line(wall_img,
                     (wall.x1, wall.y1), (wall.x2, wall.y2),
                     (0, 0, 255), 2)
        debug["walls"] = wall_img

        # Rooms overlay
        room_img = original.copy()
        colors = [
            (255, 0, 0), (0, 255, 0), (0, 0, 255),
            (255, 255, 0), (0, 255, 255), (255, 0, 255),
            (128, 255, 0), (0, 128, 255), (255, 128, 0),
        ]
        for i, room in enumerate(rooms):
            color = colors[i % len(colors)]
            pts = np.array(room.points, dtype=np.int32).reshape(-1, 1, 2)
            cv2.polylines(room_img, [pts], True, color, 3)
            # Label
            cx = sum(p[0] for p in room.points) // len(room.points)
            cy = sum(p[1] for p in room.points) // len(room.points)
            cv2.putText(room_img, f"R{i + 1}", (cx, cy),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, color, 2)
        debug["rooms"] = room_img

        # All elements overlay
        combined = original.copy()
        for wall in walls:
            cv2.line(combined,
                     (wall.x1, wall.y1), (wall.x2, wall.y2),
                     (0, 0, 255), 1)
        for i, room in enumerate(rooms):
            color = colors[i % len(colors)]
            pts = np.array(room.points, dtype=np.int32).reshape(-1, 1, 2)
            cv2.polylines(combined, [pts], True, color, 2)
        for small in smalls:
            x, y, w, h = small.bounding_rect
            cv2.rectangle(combined, (x, y), (x + w, y + h), (0, 255, 255), 2)
        debug["combined"] = combined

        return debug

    # --------------------------------------------------
    # Convert to Spatial Models
    # --------------------------------------------------

    def _normalize_point(self, x: int, y: int, w: int, h: int) -> Point:
        """Convert pixel coords to normalized 0.0–1.0."""
        return Point(
            x=round(x / w, 6) if w > 0 else 0.0,
            y=round(y / h, 6) if h > 0 else 0.0,
        )

    def to_spatial_architectural(
        self,
        cv_result: CVDetectionResult,
    ) -> SpatialArchitecturalResult:
        """Convert CV detection results to spatial architectural format."""
        w = cv_result.image_width
        h = cv_result.image_height

        rooms: list[SpatialRoom] = []
        for i, contour in enumerate(cv_result.room_contours):
            polygon = [
                self._normalize_point(px, py, w, h)
                for px, py in contour.points
            ]

            # Build walls from polygon edges
            walls: list[SpatialWall] = []
            for j in range(len(polygon)):
                k = (j + 1) % len(polygon)
                walls.append(SpatialWall(
                    start=polygon[j],
                    end=polygon[k],
                ))

            # Centroid for label
            cx = sum(p.x for p in polygon) / len(polygon) if polygon else 0.5
            cy = sum(p.y for p in polygon) / len(polygon) if polygon else 0.5

            rooms.append(SpatialRoom(
                id=f"R{i + 1}",
                name=f"Room {i + 1}",
                polygon=polygon,
                label_position=Point(x=cx, y=cy),
                walls=walls,
            ))

        # Small contours → classify as doors or windows based on shape
        for contour in cv_result.small_contours:
            # Assign to nearest room
            cx = contour.bounding_rect[0] + contour.bounding_rect[2] / 2
            cy = contour.bounding_rect[1] + contour.bounding_rect[3] / 2
            pos = self._normalize_point(int(cx), int(cy), w, h)

            nearest_room = self._find_nearest_room(pos, rooms)
            if nearest_room is None:
                continue

            # Classify: aspect ratio > 2 likely a window, else a door
            if contour.aspect_ratio > 2.0 or contour.aspect_ratio < 0.5:
                nearest_room.windows.append(SpatialWindow(
                    label=f"W{len(nearest_room.windows) + 1}",
                    position=pos,
                ))
            else:
                nearest_room.doors.append(SpatialDoor(
                    label=f"D{len(nearest_room.doors) + 1}",
                    position=pos,
                ))

        return SpatialArchitecturalResult(
            scale_bar=ScaleBar(),
            image_width_px=w,
            image_height_px=h,
            rooms=rooms,
        )

    def to_spatial_civil(
        self,
        cv_result: CVDetectionResult,
    ) -> SpatialCivilResult:
        """Convert CV detection results to spatial civil format."""
        w = cv_result.image_width
        h = cv_result.image_height

        # Small square contours → columns
        columns: list[SpatialColumn] = []
        for i, contour in enumerate(cv_result.small_contours):
            # Roughly square → likely a column
            if 0.6 < contour.aspect_ratio < 1.6:
                cx = contour.bounding_rect[0] + contour.bounding_rect[2] / 2
                cy = contour.bounding_rect[1] + contour.bounding_rect[3] / 2
                columns.append(SpatialColumn(
                    id=f"C{i + 1}",
                    label=f"C{i + 1}",
                    center=self._normalize_point(int(cx), int(cy), w, h),
                ))

        # Lines → beams
        beams: list[SpatialBeam] = []
        for i, line in enumerate(cv_result.walls):
            beams.append(SpatialBeam(
                id=f"B{i + 1}",
                label=f"B{i + 1}",
                start=self._normalize_point(line.x1, line.y1, w, h),
                end=self._normalize_point(line.x2, line.y2, w, h),
            ))

        # Large contours → slabs
        slabs: list[SpatialSlab] = []
        for i, contour in enumerate(cv_result.room_contours):
            polygon = [
                self._normalize_point(px, py, w, h)
                for px, py in contour.points
            ]
            slabs.append(SpatialSlab(
                id=f"S{i + 1}",
                label=f"S{i + 1}",
                polygon=polygon,
            ))

        return SpatialCivilResult(
            scale_bar=ScaleBar(),
            image_width_px=w,
            image_height_px=h,
            column_grid=ColumnGrid(columns=columns),
            beams=beams,
            slabs=slabs,
        )

    @staticmethod
    def _find_nearest_room(
        point: Point, rooms: list[SpatialRoom]
    ) -> SpatialRoom | None:
        """Find the room whose centroid is closest to the given point."""
        if not rooms:
            return None

        best_room = rooms[0]
        best_dist = float("inf")

        for room in rooms:
            if not room.polygon:
                continue
            cx = sum(p.x for p in room.polygon) / len(room.polygon)
            cy = sum(p.y for p in room.polygon) / len(room.polygon)
            dist = math.hypot(point.x - cx, point.y - cy)
            if dist < best_dist:
                best_dist = dist
                best_room = room

        return best_room

    # --------------------------------------------------
    # Debug output
    # --------------------------------------------------

    def save_debug_images(
        self,
        cv_result: CVDetectionResult,
        output_dir: str | Path,
    ) -> list[str]:
        """Save debug overlay images to disk."""
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        saved = []
        for name, img in cv_result.debug_images.items():
            path = output_dir / f"cv_debug_{name}.png"
            cv2.imwrite(str(path), img)
            saved.append(str(path))

        if saved:
            print_success(f"Saved {len(saved)} debug image(s) to {output_dir}")

        return saved


# ──────────────────────────────────────────────────────
# Standalone test
# ──────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 2:
        print("Usage: python -m geometry.cv_detector <image_path> [--debug]")
        sys.exit(1)

    img_path = sys.argv[1]
    debug = "--debug" in sys.argv

    detector = CVDetector()
    result = detector.detect(img_path, save_debug=debug)

    if debug and result.debug_images:
        detector.save_debug_images(result, "output/cv_debug")

    # Convert and print
    spatial = detector.to_spatial_architectural(result)
    print(json.dumps(spatial.model_dump(), indent=2, default=str))
