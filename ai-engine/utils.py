"""
Common utility functions used across the AI Engine.
"""

import json
import logging
import shutil
from pathlib import Path
from typing import Any
import hashlib
import mimetypes
from datetime import datetime



# ==========================
# Logger
# ==========================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)

logger = logging.getLogger("AI_ENGINE")


# ==========================
# JSON Helpers
# ==========================

def save_json(data: Any, output_path: Path) -> None:
    """
    Save Python object to JSON file.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as file:
        json.dump(data, file, indent=4, ensure_ascii=False)


def load_json(file_path: Path) -> Any:
    """
    Load JSON file.
    """
    with open(file_path, "r", encoding="utf-8") as file:
        return json.load(file)


# ==========================
# File Helpers
# ==========================

def ensure_directory(directory: Path) -> None:
    """
    Create directory if it doesn't exist.
    """
    directory.mkdir(parents=True, exist_ok=True)


def copy_file(source: Path, destination: Path) -> None:
    """
    Copy file to destination.
    """
    ensure_directory(destination.parent)
    shutil.copy2(source, destination)


def file_size_mb(file_path: Path) -> float:
    """
    Return file size in MB.
    """
    return round(file_path.stat().st_size / (1024 * 1024), 2)


# ==========================
# Console Helpers
# ==========================

def print_step(step: str) -> None:
    print(f"\n{'=' * 60}")
    print(step)
    print('=' * 60)


def print_success(message: str) -> None:
    logger.info(message)


def print_error(message: str, error: Exception | None = None) -> None:
    if error:
        logger.error(f"{message}: {error}")
    else:
        logger.error(message)


def calculate_sha256(file_path: Path) -> str:
    """
    Calculate SHA256 hash for a file.
    """

    sha = hashlib.sha256()

    with open(file_path, "rb") as file:

        while True:

            chunk = file.read(8192)

            if not chunk:
                break

            sha.update(chunk)

    return sha.hexdigest()


def get_mime_type(file_path: Path) -> str:
    """
    Return MIME type.
    """

    mime, _ = mimetypes.guess_type(file_path)

    return mime or "application/octet-stream"


def current_time() -> str:
    """
    Return current timestamp.
    """

    return datetime.utcnow().isoformat()