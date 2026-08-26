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

# When spawned as a background job by the Node.js worker, JOB_DIR is set
# so that all outputs go into an isolated per-job directory.
_job_dir = os.getenv("JOB_DIR")
if _job_dir:
    BASE_DIR = Path(_job_dir).resolve()
else:
    BASE_DIR = Path(__file__).resolve().parent

INPUT_DIR  = BASE_DIR / "input"
OUTPUT_DIR = BASE_DIR / "output"
TEMP_DIR   = BASE_DIR / "temp"

# Create directories if they don't exist
INPUT_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)

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
PARSER_OUTPUT     = OUTPUT_DIR / "parsed.json"
VISION_OUTPUT     = OUTPUT_DIR / "vision.json"
GEOMETRY_OUTPUT   = OUTPUT_DIR / "geometry.json"
MERGED_OUTPUT     = OUTPUT_DIR / "merged.json"
QUANTITY_OUTPUT   = OUTPUT_DIR / "quantity.json"
EXCEL_OUTPUT      = OUTPUT_DIR / "quantities.xlsx"

# ==========================
# AI Provider
# ==========================

VISION_PROVIDER = "gemini"

OPENAI_API_KEY = ""
CLAUDE_API_KEY = ""
