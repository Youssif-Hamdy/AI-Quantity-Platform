"""
Validate uploaded files before processing.
"""

from pathlib import Path

from pypdf import PdfReader

from config import (
    SUPPORTED_EXTENSIONS,
    MAX_FILE_SIZE_MB,
)
from models import ValidationResult
from utils import file_size_mb, print_success
from utils import (
    file_size_mb,
    print_success,
    calculate_sha256,
    get_mime_type,
    current_time,
)


class FileValidator:

    @staticmethod
    def validate(file_path: str | Path) -> ValidationResult:

        file_path = Path(file_path)

        result = ValidationResult(
            valid=True,
            file_name=file_path.name,
            extension=file_path.suffix.lower(),
            file_size_mb=0,
        )

        # ----------------------------
        # File Exists
        # ----------------------------

        if not file_path.exists():
            result.valid = False
            result.errors.append("File does not exist.")
            return result

        # ----------------------------
        # Extension
        # ----------------------------

        if file_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            result.valid = False
            result.errors.append("Unsupported file type.")
            return result

        # ----------------------------
        # File Size
        # ----------------------------

        result.file_size_mb = file_size_mb(file_path)

        result.mime_type = get_mime_type(file_path)

        result.sha256 = calculate_sha256(file_path)

        result.created_at = current_time()

        if result.file_size_mb > MAX_FILE_SIZE_MB:
            result.valid = False
            result.errors.append(
                f"File size exceeds {MAX_FILE_SIZE_MB} MB."
            )

        # ----------------------------
        # PDF Information
        # ----------------------------

        if file_path.suffix.lower() == ".pdf":
            try:
                pdf = PdfReader(str(file_path))
                result.pages = len(pdf.pages)

            except Exception as exc:
                result.valid = False
                result.errors.append(str(exc))

        if result.valid:
            print_success("Validation completed successfully.")

        return result


# Alias so main.py can use DocumentValidator
DocumentValidator = FileValidator


if __name__ == "__main__":

    file = input("Enter file path: ")

    validation = FileValidator.validate(file)

    print(validation.model_dump_json(indent=4))