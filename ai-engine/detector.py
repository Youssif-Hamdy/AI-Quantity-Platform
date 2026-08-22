"""
Drawing Type Detector

Uses Gemini Vision to automatically detect the type of
engineering drawing (architectural / civil / mixed),
then asks the user to confirm before proceeding.
"""

import json
from pathlib import Path

from config import TEMP_DIR
from models import DetectionResult, DrawingType
from providers.gemini_provider import GeminiVisionProvider
from utils import print_success, print_error


# ======================================================
# ANSI colors (work on Windows 10+ with VT enabled)
# ======================================================

CYAN   = "\033[96m"
YELLOW = "\033[93m"
GREEN  = "\033[92m"
RED    = "\033[91m"
BOLD   = "\033[1m"
RESET  = "\033[0m"


class DrawingTypeDetector:
    """
    Step 1 of the pipeline:
    - Sends the first page image to Gemini
    - Receives a JSON classification
    - Displays a confirmation prompt to the user
    - Returns the confirmed DrawingType
    """

    # Detect using only the first page (fast + cheap)
    MAX_PAGES_FOR_DETECTION = 2

    def __init__(self):
        self.provider  = GeminiVisionProvider()
        self.pages_dir = TEMP_DIR / "pages"

    # --------------------------------------------------
    # Internal helpers
    # --------------------------------------------------

    def _collect_images(self) -> list[str]:
        """Return up to MAX_PAGES_FOR_DETECTION page images."""
        if not self.pages_dir.exists():
            return []

<<<<<<< HEAD
        images = sorted(self.pages_dir.glob("page_*.*"))
        images = [p for p in images if p.suffix.lower() in {".png", ".jpg", ".jpeg"}]
=======
        images = sorted(self.pages_dir.glob("*.png"))
>>>>>>> 0af4b7ca6d930092ac5612f983684d52058d043f
        images = images[: self.MAX_PAGES_FOR_DETECTION]
        return [str(p) for p in images]

    def _build_prompt(self) -> str:
        return """
You are an expert engineering drawing classifier.

Analyze the attached drawing image(s) and determine what type of
engineering drawing they represent.

Return ONLY valid JSON — no markdown, no explanation.

Schema:
{
    "drawing_type": "architectural | civil | mixed",
    "confidence": 0.95,
    "reason": "One sentence explaining why you chose this type.",
    "detected_elements": ["rooms", "doors", "windows"]
}

Rules:
- "architectural": floor plans, rooms, doors, windows, finishes
- "civil": structural elements — columns, beams, slabs, reinforcement bars, footings
- "mixed": contains BOTH architectural and structural elements in the same drawing

detected_elements should list the actual elements you spotted
(e.g. rooms, columns, steel bars, beams, slabs, doors, windows).

Return JSON only.
"""

    # --------------------------------------------------
    # Detection
    # --------------------------------------------------

    def detect(self) -> DetectionResult:
        """Run AI detection and return a DetectionResult."""

        images = self._collect_images()

        if not images:
            raise RuntimeError(
                "No page images found. Run the normalizer first."
            )

        prompt = self._build_prompt()

        print(f"\n{CYAN}[AI] Detecting drawing type...{RESET}")

        response = self.provider.analyze(
            prompt=prompt,
            image_paths=images,
        )

        # Handle raw_response fallback
        if "raw_response" in response:
            raw = response["raw_response"]
            # Try extracting JSON from raw text
            try:
                start = raw.index("{")
                end   = raw.rindex("}") + 1
                response = json.loads(raw[start:end])
            except Exception:
                # Fallback: assume architectural
                print_error(
                    "Could not parse detection response — defaulting to architectural"
                )
                response = {
                    "drawing_type": "architectural",
                    "confidence": 0.5,
                    "reason": "Could not parse AI response.",
                    "detected_elements": [],
                }

        result = DetectionResult(
            drawing_type=DrawingType(response.get("drawing_type", "architectural")),
            confidence=float(response.get("confidence", 0.0)),
            reason=response.get("reason", ""),
            detected_elements=response.get("detected_elements", []),
        )

        print_success(
            f"Detection complete: {result.drawing_type.value} "
            f"(confidence: {result.confidence:.0%})"
        )

        return result

    # --------------------------------------------------
    # User Confirmation
    # --------------------------------------------------

    def confirm(self, detection: DetectionResult) -> DrawingType:
        """
        Display the detection result to the user and ask for confirmation.
        Returns the final (possibly corrected) DrawingType.
        """

        type_labels = {
            DrawingType.ARCHITECTURAL: "Architectural",
            DrawingType.CIVIL:         "Civil",
            DrawingType.MIXED:         "Mixed (Arch + Civil)",
        }

        detected_label = type_labels[detection.drawing_type]
        elements_str   = ", ".join(detection.detected_elements) if detection.detected_elements else "—"
        confidence_pct = f"{detection.confidence:.0%}"

        # ── Banner ──────────────────────────────────────────
        print(f"\n{CYAN}{'=' * 50}{RESET}")
        print(f"{BOLD}  [AI] Drawing Type Detected{RESET}")
        print(f"{CYAN}{'=' * 50}{RESET}")
        print(f"  Type       : {BOLD}{detected_label}{RESET}")
        print(f"  Confidence : {YELLOW}{confidence_pct}{RESET}")
        print(f"  Reason     : {detection.reason}")
        print(f"  Elements   : {elements_str}")
        print(f"{CYAN}{'-' * 50}{RESET}")
        print()
        print(f"  Is this correct?")
        print(f"  {GREEN}[1]{RESET} Yes, continue ({detected_label})")
        print(f"  {YELLOW}[2]{RESET} No, it is Architectural")
        print(f"  {YELLOW}[3]{RESET} No, it is Civil")
        print(f"  {YELLOW}[4]{RESET} No, it is Mixed (Arch + Civil)")
        print(f"{CYAN}{'=' * 50}{RESET}")
        print()

        # ── Input loop ───────────────────────────────────────
        choice_map = {
            "1": detection.drawing_type,
            "2": DrawingType.ARCHITECTURAL,
            "3": DrawingType.CIVIL,
            "4": DrawingType.MIXED,
        }

        while True:
            try:
                choice = input("  Choose [1-4]: ").strip()
            except (KeyboardInterrupt, EOFError):
                # Non-interactive mode — use detected type
                print(f"\n  {YELLOW}Non-interactive mode — using detected type.{RESET}")
                return detection.drawing_type

            if choice in choice_map:
                confirmed = choice_map[choice]
                print(
                    f"\n  {GREEN}[OK] Confirmed:{RESET} "
                    f"{BOLD}{type_labels[confirmed]}{RESET}\n"
                )
                return confirmed

            print(f"  {RED}[!] Invalid choice, try again.{RESET}")

    # --------------------------------------------------
    # High-level shortcut
    # --------------------------------------------------

<<<<<<< HEAD
    def detect_and_confirm(self, preset_type: str | None = None) -> DrawingType:
        """Detect drawing type, confirm with user (or use preset), return DrawingType."""
        detection = self.detect()

        # If a preset type was passed (non-interactive / background mode), use it directly
        if preset_type:
            try:
                forced = DrawingType(preset_type.lower())
                print(f"\n  {GREEN}[OK] Using preset drawing type:{RESET} {BOLD}{forced.value}{RESET}\n")
                return forced
            except ValueError:
                print(f"\n  {YELLOW}[!] Unknown preset type '{preset_type}' — using detected type.{RESET}")

=======
    def detect_and_confirm(self) -> DrawingType:
        """Detect drawing type, confirm with user, return DrawingType."""
        detection = self.detect()
>>>>>>> 0af4b7ca6d930092ac5612f983684d52058d043f
        return self.confirm(detection)


# ──────────────────────────────────────────────────────
# Standalone test
# ──────────────────────────────────────────────────────

if __name__ == "__main__":

    try:
        detector = DrawingTypeDetector()
        drawing_type = detector.detect_and_confirm()
        print(f"النوع النهائي: {drawing_type.value}")

    except Exception as exc:
        print_error("Detection failed", exc)
