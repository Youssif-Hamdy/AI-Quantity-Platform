"""
Document Parser

Extracts text and document elements
using the Unstructured library.
"""

from pathlib import Path

from unstructured.partition.auto import partition

from config import PARSER_OUTPUT
from models import ParsedDocument, ParsedElement
from utils import save_json, print_success, print_error


class DocumentParser:
    """
    Parse documents into structured elements.
    """

    @staticmethod
    def parse(file_path: str | Path) -> ParsedDocument:

        file_path = Path(file_path)

        # ----------------------------
        # Validate file
        # ----------------------------

        if not file_path.exists():
            raise FileNotFoundError(f"{file_path} does not exist.")

        # ----------------------------
        # Parse document
        # ----------------------------

        try:
            elements = partition(filename=str(file_path))
        except Exception as exc:
            print_error("OCR parsing skipped or failed (missing unstructured[image] or tesseract)", exc)
            elements = []

        # ----------------------------
        # Convert elements
        # ----------------------------

        parsed_elements = []

        element_id = 1

        for element in elements:

            text = getattr(element, "text", "")

            if not text:
                continue

            text = text.strip()

            if not text:
                continue

            parsed_elements.append(
                ParsedElement(
                    id=element_id,
                    type=type(element).__name__,
                    text=text,
                )
            )

            element_id += 1

        # ----------------------------
        # Build document
        # ----------------------------

        document = ParsedDocument(
            file_name=file_path.name,
            total_elements=len(parsed_elements),
            elements=parsed_elements,
        )

        # ----------------------------
        # Save output
        # ----------------------------

        save_json(
            document.model_dump(),
            PARSER_OUTPUT,
        )

        print_success(
            f"Successfully parsed {len(parsed_elements)} elements."
        )

        return document


if __name__ == "__main__":

    file = input("Enter file path: ").strip()

    try:

        result = DocumentParser.parse(file)

        print(result.model_dump_json(indent=4))

    except Exception as exc:

        print_error("Parser failed", exc)