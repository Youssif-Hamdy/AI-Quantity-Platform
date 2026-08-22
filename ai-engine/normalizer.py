"""
Document Normalizer

Converts PDF pages into high-resolution images
ready for Vision AI processing.

If the input file is already an image (jpg/png/etc.),
it is copied directly without any re-rendering.
"""

import shutil
from pathlib import Path

import fitz  # PyMuPDF

from config import TEMP_DIR
from utils import (
    ensure_directory,
    print_success,
    print_error,
)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}


class DocumentNormalizer:

    def __init__(self):
        self.pages_dir = TEMP_DIR / "pages"
        ensure_directory(self.pages_dir)

    def normalize(
        self,
        file_path: str | Path,
        dpi: int = 300,
    ) -> list[str]:

        file_path = Path(file_path)

        if not file_path.exists():
            raise FileNotFoundError(file_path)

        # Clear old pages to prevent stale cache
        if self.pages_dir.exists():
            shutil.rmtree(self.pages_dir)
        ensure_directory(self.pages_dir)

        ext = file_path.suffix.lower()

        # ── Image file: copy as-is, no re-rendering ──────────
        if ext in IMAGE_EXTENSIONS:
            return self._handle_image(file_path)

        # ── PDF file: render each page to PNG ─────────────────
        return self._handle_pdf(file_path, dpi)

    # ----------------------------------------------------------

    def _handle_image(self, file_path: Path) -> list[str]:
        """Copy image directly into pages_dir without re-rendering."""

        dest = self.pages_dir / f"page_1{file_path.suffix.lower()}"

        # Only copy if not already there
        if dest.resolve() != file_path.resolve():
            shutil.copy2(file_path, dest)

        print_success("Image ready (no conversion needed).")
        return [str(dest)]

    def _handle_pdf(self, pdf_path: Path, dpi: int) -> list[str]:
        """Render each PDF page to a PNG image."""

        try:
            document = fitz.open(pdf_path)
        except Exception as exc:
            print_error("Cannot open PDF", exc)
            raise

        image_paths = []
        zoom   = dpi / 72
        matrix = fitz.Matrix(zoom, zoom)

        for page_number in range(len(document)):
            page = document.load_page(page_number)
            pix  = page.get_pixmap(matrix=matrix, alpha=False)

            output_path = self.pages_dir / f"page_{page_number + 1}.png"
            pix.save(output_path)
            image_paths.append(str(output_path))

        document.close()

        print_success(f"{len(image_paths)} page(s) converted.")
        return image_paths


if __name__ == "__main__":

    path = input("Enter file path: ").strip()

    normalizer = DocumentNormalizer()
    pages      = normalizer.normalize(path)

    print("\nReady images:")
    for p in pages:
        print(" ", p)