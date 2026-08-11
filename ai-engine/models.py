"""
Data models used across the AI Engine.
"""

from enum import Enum
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


# ======================================================
# Drawing Type
# ======================================================

class DrawingType(str, Enum):
    ARCHITECTURAL = "architectural"   # معمارية
    CIVIL         = "civil"           # مدنية
    MIXED         = "mixed"           # مختلطة


class DetectionResult(BaseModel):
    drawing_type: DrawingType
    confidence: float = 0.0          # 0.0 → 1.0
    reason: str = ""
    detected_elements: list[str] = Field(default_factory=list)


# ======================================================
# Validation
# ======================================================

class ValidationResult(BaseModel):
    valid: bool

    file_name: str
    extension: str

    mime_type: str = ""

    file_size_mb: float

    sha256: str = ""

    created_at: str = ""

    pages: int = 0

    dpi: int = 0

    errors: list[str] = Field(default_factory=list)


# ======================================================
# Parser
# ======================================================

class ParsedElement(BaseModel):
    id: int
    type: str
    text: str


class ParsedDocument(BaseModel):
    file_name: str
    total_elements: int = 0
    elements: list[ParsedElement]


# ======================================================
# Vision — Architectural
# ======================================================

class Wall(BaseModel):
    name: str | None = None
    length: float | None = None
    height: float | None = None
    area: float | None = None


class Door(BaseModel):
    label: str | None = None
    width: float | None = None
    height: float | None = None
    area: float | None = None
    quantity: int = 1


class Window(BaseModel):
    label: str | None = None
    width: float | None = None
    height: float | None = None
    area: float | None = None
    quantity: int = 1


class Room(BaseModel):
    name: str
    length: float | None = None
    width: float | None = None
    height: float | None = None
    area: float | None = None
    perimeter: float | None = None
    unit: str | None = None
    walls: list[Wall] = Field(default_factory=list)
    doors: list[Door] = Field(default_factory=list)
    windows: list[Window] = Field(default_factory=list)


class VisionResult(BaseModel):
    rooms: list[Room] = Field(default_factory=list)


# ======================================================
# Vision — Civil (المدني)
# ======================================================

class Column(BaseModel):
    """عمود خرساني"""
    label: str | None = None          # C1, C2 …
    length: float | None = None       # m
    width: float | None = None        # m
    height: float | None = None       # m
    volume: float | None = None       # m³  (يُحسب إن لم يُعطَ)
    quantity: int = 1


class Beam(BaseModel):
    """كمرة خرسانية"""
    label: str | None = None          # B1, B2 …
    width: float | None = None        # m
    height: float | None = None       # m (depth)
    length: float | None = None       # m
    volume: float | None = None       # m³
    quantity: int = 1


class Slab(BaseModel):
    """بلاطة خرسانية"""
    label: str | None = None
    length: float | None = None       # m
    width: float | None = None        # m
    thickness: float | None = None    # m
    area: float | None = None         # m²
    volume: float | None = None       # m³
    quantity: int = 1


class SteelBar(BaseModel):
    """سيخ حديد"""
    label: str | None = None
    diameter: float | None = None     # mm  (10, 12, 16, 20 …)
    length: float | None = None       # m
    quantity: int = 1
    weight: float | None = None       # kg  (يُحسب إن لم يُعطَ)


class CivilResult(BaseModel):
    columns:   list[Column]   = Field(default_factory=list)
    beams:     list[Beam]     = Field(default_factory=list)
    slabs:     list[Slab]     = Field(default_factory=list)
    steel_bars: list[SteelBar] = Field(default_factory=list)


# ======================================================
# Merged (المختلط)
# ======================================================

class MergedDocument(BaseModel):
    parsed: ParsedDocument
    vision: VisionResult


class MixedResult(BaseModel):
    """نتيجة اللوحة المختلطة (معمارية + مدنية)"""
    architectural: VisionResult = Field(default_factory=VisionResult)
    civil: CivilResult = Field(default_factory=CivilResult)


# ======================================================
# Quantities
# ======================================================

class QuantityItem(BaseModel):
    name: str
    quantity: float
    unit: str


class QuantityResult(BaseModel):
    drawing_type: DrawingType = DrawingType.ARCHITECTURAL
    items: list[QuantityItem] = Field(default_factory=list)


# ======================================================
# Context
# ======================================================

class ProcessingContext(BaseModel):
    input_file: Path
    temp_dir: Path
    output_dir: Path