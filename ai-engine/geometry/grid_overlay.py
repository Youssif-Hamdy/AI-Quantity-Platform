"""
Grid Overlay — Draw a visible reference grid on images before AI analysis.

Overlays numbered grid lines so the AI model has reference points
to improve coordinate accuracy. The grid acts as a visual ruler.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np


def draw_grid(
    image_path: str | Path,
    output_path: str | Path | None = None,
    grid_size: int = 100,
    color: tuple[int, int, int] = (255, 0, 0),   # Red in BGR
    thickness: int = 1,
    alpha: float = 0.3,
    label_every: int = 1,
) -> str:
    """
    Draw a numbered grid overlay on an image.

    Args:
        image_path:  Path to input image.
        output_path: Where to save the gridded image (default: same dir, _grid suffix).
        grid_size:   Pixels between grid lines.
        color:       Line color (BGR).
        thickness:   Line thickness.
        alpha:       Overlay transparency (0 = invisible, 1 = opaque).
        label_every: Label every Nth grid line.

    Returns:
        Path to the gridded image.
    """
    image_path = Path(image_path)
    if output_path is None:
        output_path = image_path.parent / f"{image_path.stem}_grid{image_path.suffix}"
    output_path = Path(output_path)

    img = cv2.imread(str(image_path))
    if img is None:
        raise FileNotFoundError(f"Cannot read image: {image_path}")

    h, w = img.shape[:2]
    overlay = img.copy()

    # Vertical lines
    x = 0
    col_idx = 0
    while x < w:
        cv2.line(overlay, (x, 0), (x, h), color, thickness)
        if col_idx % label_every == 0:
            # Normalized label (0-1000 scale)
            label = str(int(x / w * 1000))
            cv2.putText(
                overlay, label, (x + 2, 15),
                cv2.FONT_HERSHEY_SIMPLEX, 0.35, color, 1,
            )
        x += grid_size
        col_idx += 1

    # Horizontal lines
    y = 0
    row_idx = 0
    while y < h:
        cv2.line(overlay, (0, y), (w, y), color, thickness)
        if row_idx % label_every == 0:
            label = str(int(y / h * 1000))
            cv2.putText(
                overlay, label, (2, y + 12),
                cv2.FONT_HERSHEY_SIMPLEX, 0.35, color, 1,
            )
        y += grid_size
        row_idx += 1

    # Blend
    result = cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), result)

    return str(output_path)


def crop_region(
    image_path: str | Path,
    bbox: tuple[int, int, int, int],
    output_path: str | Path | None = None,
    padding: int = 20,
) -> tuple[str, tuple[int, int, int, int]]:
    """
    Crop a region from an image given a bounding box.

    Args:
        image_path: Path to input image.
        bbox:       (x_min, y_min, x_max, y_max) in pixels.
        output_path: Where to save the crop.
        padding:    Extra pixels around the bbox.

    Returns:
        (path_to_crop, actual_bbox_used) — the actual bbox may differ due to padding/clamping.
    """
    image_path = Path(image_path)
    img = cv2.imread(str(image_path))
    if img is None:
        raise FileNotFoundError(f"Cannot read image: {image_path}")

    h, w = img.shape[:2]
    x1, y1, x2, y2 = bbox

    # Add padding and clamp
    x1 = max(0, x1 - padding)
    y1 = max(0, y1 - padding)
    x2 = min(w, x2 + padding)
    y2 = min(h, y2 + padding)

    crop = img[y1:y2, x1:x2]

    if output_path is None:
        output_path = image_path.parent / f"{image_path.stem}_crop_{x1}_{y1}.png"
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), crop)

    return str(output_path), (x1, y1, x2, y2)


def normalized_bbox_to_pixels(
    bbox_norm: list[float],
    img_w: int,
    img_h: int,
) -> tuple[int, int, int, int]:
    """
    Convert Gemini-style normalized bbox [y_min, x_min, y_max, x_max] (0-1000)
    to pixel coordinates (x_min, y_min, x_max, y_max).

    Note: Gemini returns Y before X!
    """
    y_min, x_min, y_max, x_max = bbox_norm
    return (
        int(x_min / 1000 * img_w),
        int(y_min / 1000 * img_h),
        int(x_max / 1000 * img_w),
        int(y_max / 1000 * img_h),
    )


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python -m geometry.grid_overlay <image_path> [grid_size]")
        sys.exit(1)

    img_path = sys.argv[1]
    gs = int(sys.argv[2]) if len(sys.argv) > 2 else 100
    out = draw_grid(img_path, grid_size=gs)
    print(f"Grid image saved: {out}")
