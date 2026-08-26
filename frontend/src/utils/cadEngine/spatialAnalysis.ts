/**
 * spatialAnalysis.ts
 * Shared geometric utilities for all CAD parsing engines.
 * Handles coordinate normalization, wall graph topology, room polygon detection, and area calculations.
 */

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  minX: number; minY: number;
  maxX: number; maxY: number;
  width: number; height: number;
}

export interface WallSegment {
  id: string;
  p1: Point;
  p2: Point;
  thicknessPx: number;
  thicknessMm: number;
  lengthPx: number;
  layer: string;
}

export interface RoomPolygon {
  id: string;
  polygon: Point[];
  centroid: Point;
  areaM2: number;
  perimeterM: number;
  label: string;
  boundingBox: BoundingBox;
}

export interface DetectedColumn {
  id: string;
  x: number; y: number;
  widthPx: number; heightPx: number;
  shape: 'RECT' | 'ROUND';
  layer: string;
  widthM: number; depthM: number;
}

export interface DetectedDoor {
  id: string;
  cx: number; cy: number;
  r: number;
  startAngle: number;
  endAngle: number;
  wallSegmentId?: string;
  widthM: number;
}

export interface DetectedWindow {
  id: string;
  x1: number; y1: number;
  x2: number; y2: number;
  widthM: number;
}

export interface NormalizedBounds {
  minX: number; minY: number;
  maxX: number; maxY: number;
  width: number; height: number;
  scaleX: number; scaleY: number;
  /** Convert real CAD x to 0–1000 viewbox x */
  nx: (x: number) => number;
  /** Convert real CAD y to 0–1000 viewbox y (flipped for SVG) */
  ny: (y: number) => number;
  /** Convert pixel distance to meters given scale ratio */
  toMeters: (px: number) => number;
}

// ─── Coordinate Normalization ────────────────────────────────────────────────

/**
 * Creates a normalizer from real CAD bounding box → 0-1000 SVG viewBox space.
 * Adds 5% padding on all sides.
 */
export function createNormalizer(
  rawBounds: { minX: number; minY: number; maxX: number; maxY: number },
  scaleRatio = 0.025 // default: 1000 units = 25 meters
): NormalizedBounds {
  const padX = Math.max((rawBounds.maxX - rawBounds.minX) * 0.05, 10);
  const padY = Math.max((rawBounds.maxY - rawBounds.minY) * 0.05, 10);
  const minX = rawBounds.minX - padX;
  const minY = rawBounds.minY - padY;
  const maxX = rawBounds.maxX + padX;
  const maxY = rawBounds.maxY + padY;
  const width = maxX - minX;
  const height = maxY - minY;
  const scaleX = 1000 / width;
  const scaleY = 1000 / height;

  return {
    minX, minY, maxX, maxY, width, height, scaleX, scaleY,
    nx: (x: number) => Math.round(((x - minX) / width) * 1000),
    ny: (y: number) => Math.round(((maxY - y) / height) * 1000),
    toMeters: (px: number) => Math.round(px * scaleRatio * 100) / 100,
  };
}

// ─── Geometric Helpers ───────────────────────────────────────────────────────

export function dist(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Polygon area via Shoelace formula (returns m² when coords are in normalized 0-1000 space with scaleRatio) */
export function shoelaceArea(polygon: Point[], scaleRatio = 0.025): number {
  if (polygon.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  const areaPx2 = Math.abs(area) / 2;
  return Math.round(areaPx2 * scaleRatio * scaleRatio * 100) / 100;
}

/** Perimeter of polygon in meters */
export function polygonPerimeter(polygon: Point[], scaleRatio = 0.025): number {
  let perim = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    perim += dist(polygon[i], polygon[j]);
  }
  return Math.round(perim * scaleRatio * 100) / 100;
}

/** Centroid of polygon */
export function centroid(polygon: Point[]): Point {
  const cx = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
  const cy = polygon.reduce((s, p) => s + p.y, 0) / polygon.length;
  return { x: Math.round(cx), y: Math.round(cy) };
}

export function boundingBoxOfPolygon(polygon: Point[]): BoundingBox {
  const xs = polygon.map(p => p.x);
  const ys = polygon.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// ─── Wall Graph & Room Detection ─────────────────────────────────────────────

interface GraphNode {
  id: string;
  point: Point;
  neighbors: string[];
}

/**
 * Snaps nearby wall endpoints together within `tolerance` pixels.
 * Returns a de-duplicated array of endpoint nodes.
 */
export function buildWallGraph(
  walls: Array<{ p1: Point; p2: Point; id: string }>,
  tolerance = 8
): Map<string, GraphNode> {
  const nodes = new Map<string, GraphNode>();

  const getOrCreateNode = (pt: Point): string => {
    for (const [id, node] of nodes.entries()) {
      if (dist(pt, node.point) < tolerance) return id;
    }
    const id = `n_${nodes.size}`;
    nodes.set(id, { id, point: pt, neighbors: [] });
    return id;
  };

  for (const wall of walls) {
    const id1 = getOrCreateNode(wall.p1);
    const id2 = getOrCreateNode(wall.p2);
    if (id1 !== id2) {
      nodes.get(id1)!.neighbors.push(id2);
      nodes.get(id2)!.neighbors.push(id1);
    }
  }

  return nodes;
}

/**
 * Finds closed room polygons from a wall graph using DFS cycle detection.
 * Returns arrays of Points forming room boundaries.
 * Filters out degenerate (too small or too large) cycles.
 */
export function findRoomPolygons(
  nodes: Map<string, GraphNode>,
  minAreaPx2 = 1000,
  maxAreaPx2 = 900000
): Point[][] {
  const visited = new Set<string>();
  const rooms: Point[][] = [];

  const dfs = (
    startId: string,
    currentId: string,
    path: string[],
    depth: number
  ): void => {
    if (depth > 30) return; // prevent infinite loops in complex plans

    const node = nodes.get(currentId)!;
    for (const neighborId of node.neighbors) {
      if (neighborId === startId && path.length >= 3) {
        // Found a cycle — extract polygon points
        const polygon = path.map(id => nodes.get(id)!.point);
        const area = Math.abs(shoelaceAreaRaw(polygon));
        if (area >= minAreaPx2 && area <= maxAreaPx2) {
          const key = [...path].sort().join('-');
          if (!visited.has(key)) {
            visited.add(key);
            rooms.push(polygon);
          }
        }
        continue;
      }
      if (!path.includes(neighborId)) {
        dfs(startId, neighborId, [...path, neighborId], depth + 1);
      }
    }
  };

  for (const [id] of nodes.entries()) {
    dfs(id, id, [id], 0);
  }

  // De-duplicate by area + centroid proximity
  return deduplicatePolygons(rooms);
}

function shoelaceAreaRaw(polygon: Point[]): number {
  if (polygon.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  return area / 2;
}

function deduplicatePolygons(polygons: Point[][]): Point[][] {
  const seen = new Set<string>();
  return polygons.filter(poly => {
    const c = centroid(poly);
    const a = Math.round(Math.abs(shoelaceAreaRaw(poly)));
    const key = `${Math.round(c.x / 20)}_${Math.round(c.y / 20)}_${Math.round(a / 100)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Layer Name Classification ───────────────────────────────────────────────

const WALL_LAYER_PATTERNS = [
  /^A[-_]?WALL/i, /^WALL/i, /^A[-_]?PART/i, /^PARTITION/i,
  /^A[-_]?ARCH/i, /^ARCH/i, /^0$/,
];
const COLUMN_LAYER_PATTERNS = [
  /^S[-_]?COL/i, /^COLUMN/i, /^COL/i, /^S[-_]?STRUCT/i, /^STRUCT/i,
];
const DOOR_LAYER_PATTERNS = [
  /^A[-_]?DOOR/i, /^DOOR/i, /^D[-_]?OPEN/i, /^OPEN/i,
];
const WINDOW_LAYER_PATTERNS = [
  /^A[-_]?WIND/i, /^WIND/i, /^A[-_]?GLAZ/i, /^GLAZ/i,
];
const ROOM_LABEL_PATTERNS = [
  /^A[-_]?ROOM/i, /^ROOM/i, /^A[-_]?TEXT/i, /^A[-_]?ANNO/i, /^TEXT/i, /^ANNO/i,
];

export function classifyLayer(layerName: string): 'WALL' | 'COLUMN' | 'DOOR' | 'WINDOW' | 'ROOM_LABEL' | 'UNKNOWN' {
  if (WALL_LAYER_PATTERNS.some(p => p.test(layerName))) return 'WALL';
  if (COLUMN_LAYER_PATTERNS.some(p => p.test(layerName))) return 'COLUMN';
  if (DOOR_LAYER_PATTERNS.some(p => p.test(layerName))) return 'DOOR';
  if (WINDOW_LAYER_PATTERNS.some(p => p.test(layerName))) return 'WINDOW';
  if (ROOM_LABEL_PATTERNS.some(p => p.test(layerName))) return 'ROOM_LABEL';
  return 'UNKNOWN';
}

// ─── Angle Helpers ───────────────────────────────────────────────────────────

export function deg2rad(deg: number): number { return deg * Math.PI / 180; }
export function rad2deg(rad: number): number { return rad * 180 / Math.PI; }

/** Calculates arc endpoint given center, radius, angle in degrees */
export function arcEndpoint(cx: number, cy: number, r: number, angleDeg: number): Point {
  return {
    x: cx + r * Math.cos(deg2rad(angleDeg)),
    y: cy + r * Math.sin(deg2rad(angleDeg)),
  };
}

/** Generates SVG arc path `d` attribute from arc entity */
export function arcToSvgPath(
  cx: number, cy: number, r: number,
  startAngle: number, endAngle: number
): string {
  const start = arcEndpoint(cx, cy, r, startAngle);
  const end = arcEndpoint(cx, cy, r, endAngle);
  const large = (endAngle - startAngle + 360) % 360 > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}
