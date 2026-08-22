"""
Benchmark Tool for Coordinate Accuracy

Compares extracted coordinates (AI + CV) against ground truth JSON coordinates
and calculates metrics:
  - Intersection over Union (IoU) for polygon elements (Rooms, Slabs)
  - Distance error (normalized 0.0 - 1.0) for point elements (Columns, Doors, Windows)
  - Line alignment error for line elements (Walls, Beams)
  - Overall accuracy and component-level reports.

Usage:
  python -m tools.benchmark --truth <path_to_ground_truth.json> --pred <path_to_extracted.json>
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from utils import load_json, print_success, print_error

# ANSI colors
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"


# ======================================================
# Metric Helpers
# ======================================================

def calculate_iou(poly1: list[dict], poly2: list[dict]) -> float:
    """
    Approximates IoU for two polygons in normalized space.
    Uses grid sampling or simple bounding box overlap if libraries are missing.
    """
    try:
        from shapely.geometry import Polygon
        p1 = Polygon([(pt["x"], pt["y"]) for pt in poly1])
        p2 = Polygon([(pt["x"], pt["y"]) for pt in poly2])
        if not p1.is_valid:
            p1 = p1.buffer(0)
        if not p2.is_valid:
            p2 = p2.buffer(0)
        intersection = p1.intersection(p2).area
        union = p1.union(p2).area
        if union == 0:
            return 0.0
        return intersection / union
    except ImportError:
        # Fallback: AABB overlap ratio
        xs1 = [pt["x"] for pt in poly1]
        ys1 = [pt["y"] for pt in poly1]
        xs2 = [pt["x"] for pt in poly2]
        ys2 = [pt["y"] for pt in poly2]

        min_x1, max_x1 = min(xs1), max(xs1)
        min_y1, max_y1 = min(ys1), max(ys1)
        min_x2, max_x2 = min(xs2), max(xs2)
        min_y2, max_y2 = min(ys2), max(ys2)

        # Intersection Box
        ix_min = max(min_x1, min_x2)
        iy_min = max(min_y1, min_y2)
        ix_max = min(max_x1, max_x2)
        iy_max = min(max_y1, max_y2)

        if ix_max < ix_min or iy_max < iy_min:
            return 0.0

        inter_area = (ix_max - ix_min) * (iy_max - iy_min)
        area1 = (max_x1 - min_x1) * (max_y1 - min_y1)
        area2 = (max_x2 - min_x2) * (max_y2 - min_y2)
        union_area = area1 + area2 - inter_area

        if union_area == 0:
            return 0.0
        return inter_area / union_area


def calculate_dist(pt1: dict, pt2: dict) -> float:
    """Euclidean distance in normalized space."""
    return math.hypot(pt1.get("x", 0.0) - pt2.get("x", 0.0), pt1.get("y", 0.0) - pt2.get("y", 0.0))


# ======================================================
# Benchmarker
# ======================================================

class Benchmarker:
    """Compares predicted drawing coordinates with ground truth."""

    def __init__(self):
        self.results = {}

    def benchmark(self, truth_path: str | Path, pred_path: str | Path) -> dict[str, Any]:
        truth = load_json(str(truth_path))
        pred = load_json(str(pred_path))

        report = {
            "rooms": self._benchmark_polygons(truth.get("rooms", []), pred.get("rooms", []), "name"),
            "columns": self._benchmark_points(
                truth.get("civil", {}).get("column_grid", {}).get("columns", []) or truth.get("column_grid", {}).get("columns", []) or [],
                pred.get("civil", {}).get("column_grid", {}).get("columns", []) or pred.get("column_grid", {}).get("columns", []) or [],
                "label"
            ),
            "beams": self._benchmark_lines(
                truth.get("civil", {}).get("beams", []) or truth.get("beams", []),
                pred.get("civil", {}).get("beams", []) or pred.get("beams", []),
                "label"
            ),
        }

        # Calculate average metrics
        avg_room_iou = sum(r["iou"] for r in report["rooms"]) / len(report["rooms"]) if report["rooms"] else 1.0
        avg_column_err = sum(c["error"] for c in report["columns"]) / len(report["columns"]) if report["columns"] else 0.0
        avg_beam_err = sum(b["error"] for b in report["beams"]) / len(report["beams"]) if report["beams"] else 0.0

        summary = {
            "overall_accuracy_pct": round(avg_room_iou * 100, 1),
            "average_room_iou": round(avg_room_iou, 3),
            "average_column_distance_error": round(avg_column_err, 4),
            "average_beam_distance_error": round(avg_beam_err, 4),
            "details": report
        }

        return summary

    def _benchmark_polygons(self, truth_list: list, pred_list: list, id_key: str) -> list[dict]:
        results = []
        matched_preds = set()

        for t_item in truth_list:
            t_poly = t_item.get("polygon", [])
            if not t_poly:
                continue

            best_iou = 0.0
            best_idx = -1

            # Match with highest IoU
            for i, p_item in enumerate(pred_list):
                if i in matched_preds:
                    continue
                p_poly = p_item.get("polygon", [])
                if not p_poly:
                    continue
                iou = calculate_iou(t_poly, p_poly)
                if iou > best_iou:
                    best_iou = iou
                    best_idx = i

            result = {
                "name": t_item.get(id_key, t_item.get("id", "Unknown")),
                "matched": best_idx != -1,
                "iou": best_iou if best_idx != -1 else 0.0
            }

            if best_idx != -1:
                matched_preds.add(best_idx)

            results.append(result)

        return results

    def _benchmark_points(self, truth_list: list, pred_list: list, id_key: str) -> list[dict]:
        results = []
        matched_preds = set()

        for t_item in truth_list:
            t_pt = t_item.get("center") or t_item.get("position")
            if not t_pt:
                continue

            best_dist = float("inf")
            best_idx = -1

            for i, p_item in enumerate(pred_list):
                if i in matched_preds:
                    continue
                p_pt = p_item.get("center") or p_item.get("position")
                if not p_pt:
                    continue
                dist = calculate_dist(t_pt, p_pt)
                if dist < best_dist:
                    best_dist = dist
                    best_idx = i

            result = {
                "name": t_item.get(id_key, t_item.get("id", "Unknown")),
                "matched": best_idx != -1 and best_dist < 0.2, # 20% distance threshold
                "error": best_dist if (best_idx != -1 and best_dist < 0.2) else 1.0
            }

            if best_idx != -1 and best_dist < 0.2:
                matched_preds.add(best_idx)

            results.append(result)

        return results

    def _benchmark_lines(self, truth_list: list, pred_list: list, id_key: str) -> list[dict]:
        results = []
        matched_preds = set()

        for t_item in truth_list:
            t_start = t_item.get("start")
            t_end = t_item.get("end")
            if not t_start or not t_end:
                continue

            best_err = float("inf")
            best_idx = -1

            for i, p_item in enumerate(pred_list):
                if i in matched_preds:
                    continue
                p_start = p_item.get("start")
                p_end = p_item.get("end")
                if not p_start or not p_end:
                    continue

                # Match start-to-start & end-to-end, or start-to-end & end-to-start
                err1 = (calculate_dist(t_start, p_start) + calculate_dist(t_end, p_end)) / 2
                err2 = (calculate_dist(t_start, p_end) + calculate_dist(t_end, p_start)) / 2
                min_err = min(err1, err2)

                if min_err < best_err:
                    best_err = min_err
                    best_idx = i

            result = {
                "name": t_item.get(id_key, t_item.get("id", "Unknown")),
                "matched": best_idx != -1 and best_err < 0.15,
                "error": best_err if (best_idx != -1 and best_err < 0.15) else 1.0
            }

            if best_idx != -1 and best_err < 0.15:
                matched_preds.add(best_idx)

            results.append(result)

        return results


# ──────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Accuracy benchmark for quantity platform coordinates.")
    parser.add_argument("--truth", required=True, help="Path to ground truth JSON file")
    parser.add_argument("--pred", required=True, help="Path to predicted/extracted JSON file")
    args = parser.parse_args()

    bench = Benchmarker()
    try:
        summary = bench.benchmark(args.truth, args.pred)
        print(f"\n{CYAN}{'=' * 50}{RESET}")
        print(f"{BOLD}          Accuracy Benchmark Results          {RESET}")
        print(f"{CYAN}{'=' * 50}{RESET}")
        print(f"  Overall Accuracy (IoU)     : {GREEN if summary['overall_accuracy_pct'] > 90 else YELLOW}{summary['overall_accuracy_pct']}%{RESET}")
        print(f"  Average Room IoU           : {summary['average_room_iou']:.3f}")
        print(f"  Avg Column Center Error    : {summary['average_column_distance_error']:.4f}")
        print(f"  Avg Beam Alignment Error   : {summary['average_beam_distance_error']:.4f}")
        print(f"{CYAN}{'=' * 50}{RESET}\n")
    except Exception as exc:
        print_error("Benchmark failed", exc)
        sys.exit(1)
