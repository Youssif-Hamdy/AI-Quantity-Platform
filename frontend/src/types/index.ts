export type DrawingType = 'ARCHITECTURAL' | 'CIVIL' | 'MIXED';

export type DrawingStatus = 'PENDING' | 'ANALYZING' | 'COMPLETED' | 'FAILED';

export type TakeoffToolMode = 'SELECT' | 'AREA' | 'LENGTH' | 'COUNT' | 'SCALE';

export interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Project {
  id: string;
  name: string;
  code?: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
  drawingsCount?: number;
}

export interface Drawing {
  id: string;
  projectId: string;
  fileName: string;
  fileSizeMb?: number;
  drawingType: DrawingType;
  status: DrawingStatus;
  errorMessage?: string;
  createdAt: string;
  imageUrl?: string;
  svgContent?: string;
  cadStats?: {
    layers: number;
    blocks: number;
    entities: number;
    dimensions: number;
  };
  reviewConfig?: DrawingReviewConfig;
}

export interface DrawingReviewConfig {
  drawingId?: string;
  fileName?: string;
  drawingType: DrawingType;
  scaleRatio?: number; // meters per 1000px scale unit
  calibratedLength?: number; // user specified length in meters
  calibrationPoints?: Array<[number, number]>;
  cropBounds?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000 scale
  selectedLayers?: string[];
  notes?: string;
}

export interface QuantityItem {
  id?: string;
  code?: string;
  name: string;
  category?: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  totalPrice?: number;
  isManual?: boolean;
}

export interface SpatialElement {
  id: string;
  category: 'ROOM' | 'COLUMN' | 'BEAM' | 'SLAB' | 'DOOR' | 'WINDOW' | 'STEEL_BAR' | 'WALL';
  name: string;
  box_2d?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000 scale

  // ── Real geometry fields (populated by new CAD engines) ──────────────────
  /** Actual polygon boundary points for rooms/spaces (0-1000 coord space) */
  polygon?: Array<{ x: number; y: number }>;
  /** Wall segment endpoints (for WALL category) */
  wallSegment?: { p1: { x: number; y: number }; p2: { x: number; y: number }; thicknessPx?: number };
  /** Arc data for door swings */
  arcData?: { cx: number; cy: number; r: number; startAngle: number; endAngle: number };
  /** Line data for windows */
  lineData?: { x1: number; y1: number; x2: number; y2: number };
  /** Whether geometry was detected from a real file (not fake/hardcoded) */
  _isReal?: boolean;

  area?: number;        // m²
  perimeter?: number;   // m
  length?: number;      // m
  width?: number;       // m
  height?: number;      // m
  thickness?: number;   // m
  volume?: number;      // m³
  walls_area?: number;  // m²
  doors_count?: number;
  windows_count?: number;
  unitPrice?: number;
  layerName?: string;
  color_index?: number;
  metadata?: Record<string, any>;
}

// ─── Rich CAD Element Types (from new engines) ───────────────────────────────

export interface CADWall {
  id: string;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  thicknessPx: number;
  thicknessMm: number;
  lengthPx: number;
  layer: string;
}

export interface CADRoom {
  id: string;
  polygon: Array<{ x: number; y: number }>;
  centroid: { x: number; y: number };
  areaM2: number;
  perimeterM: number;
  label: string;
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
}

export interface CADColumn {
  id: string;
  x: number; y: number;
  widthPx: number; heightPx: number;
  shape: 'RECT' | 'ROUND';
  layer: string;
  widthM: number; depthM: number;
}

export interface CADDoor {
  id: string;
  cx: number; cy: number;
  r: number;
  startAngle: number;
  endAngle: number;
  widthM: number;
}

export interface CADWindow {
  id: string;
  x1: number; y1: number;
  x2: number; y2: number;
  widthM: number;
}

export interface ManualMeasurement {
  id: string;
  type: 'AREA' | 'LENGTH' | 'COUNT';
  name: string;
  category: string;
  points: Array<[number, number]>; // 0-1000 scale coordinates
  value: number;
  unit: string;
  unitPrice: number;
  color: string;
}

export interface LayerVisibility {
  rooms: boolean;
  structure: boolean;
  openings: boolean;
  manual: boolean;
}

export interface DrawingStatusSocketPayload {
  drawingId: string;
  status: DrawingStatus;
  errorMessage?: string;
}

