"""
Application Configuration

Contains all project paths and constants.
"""

from pathlib import Path
from dotenv import load_dotenv
import os

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# ==========================
# Base Directories
# ==========================

<<<<<<< HEAD
_job_dir = os.getenv("JOB_DIR")
if _job_dir:
    BASE_DIR = Path(_job_dir).resolve()
else:
    BASE_DIR = Path(__file__).resolve().parent
=======
BASE_DIR = Path(__file__).resolve().parent
>>>>>>> 0af4b7ca6d930092ac5612f983684d52058d043f

INPUT_DIR = BASE_DIR / "input"
OUTPUT_DIR = BASE_DIR / "output"
TEMP_DIR = BASE_DIR / "temp"

# Create directories if they don't exist
<<<<<<< HEAD
INPUT_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)
=======
INPUT_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)
>>>>>>> 0af4b7ca6d930092ac5612f983684d52058d043f

# ==========================
# Supported File Types
# ==========================

SUPPORTED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".txt",
    ".html",
    ".png",
    ".jpg",
    ".jpeg",
}

# ==========================
# PDF Settings
# ==========================

MIN_DPI = 300
MAX_FILE_SIZE_MB = 50

# ==========================
# Vision AI
# ==========================

VISION_MODEL = "gpt-4.1"

# ==========================
# Output Files
# ==========================

VALIDATION_OUTPUT = OUTPUT_DIR / "validation.json"
PARSER_OUTPUT = OUTPUT_DIR / "parsed.json"
VISION_OUTPUT = OUTPUT_DIR / "vision.json"
MERGED_OUTPUT = OUTPUT_DIR / "merged.json"
QUANTITY_OUTPUT = OUTPUT_DIR / "quantities.json"
EXCEL_OUTPUT = OUTPUT_DIR / "quantities.xlsx"

# ==========================
# Output Files
# ==========================

PARSER_OUTPUT = OUTPUT_DIR / "parsed.json"

VISION_OUTPUT = OUTPUT_DIR / "vision.json"
<<<<<<< HEAD
GEOMETRY_OUTPUT = OUTPUT_DIR / "geometry.json"
=======
>>>>>>> 0af4b7ca6d930092ac5612f983684d52058d043f

QUANTITY_OUTPUT = OUTPUT_DIR / "quantity.json"
# ==========================
# AI Provider
# ==========================

VISION_PROVIDER = "gemini"

OPENAI_API_KEY = ""

import os

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

CLAUDE_API_KEY = ""
