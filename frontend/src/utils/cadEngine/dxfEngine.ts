/**
 * dxfEngine.ts
 * Real DXF parsing engine using the `dxf-parser` npm library.
 * Extracts actual walls, rooms, columns, doors, and windows from DXF files.
 * Replaces the old fake parseDxfText() in dxfParser.ts.
 */

import DxfParser from 'dxf-parser';
import {
  createNormalizer,
  classifyLayer,
  buildWallGraph,
  findRoomPolygons,
  shoelaceArea,
  polygonPerimeter,
  centroid,
  boundingBoxOfPolygon,
  arcToSvgPath,
  dist,
  arcEndpoint,
  type Point,
  type WallSegment,
  type RoomPolygon,
  type DetectedColumn,
  type DetectedDoor,
  type DetectedWindow,
} from './spatialAnalysis';

// ─── DXF Entity Types from dxf-parser ────────────────────────────────────────

interface DxfLwPolylineVertex {
  x: number;
  y: number;
  startWidth?: number;
  endWidth?: number;
  bulge?: number;
}

interface DxfEntityBase {
  type: string;
  layer?: string;
  color?: number;
  handle?: string;
}

interface LwPolylineEntity extends DxfEntityBase {
  type: 'LWPOLYLINE';
  vertices: DxfLwPolylineVertex[];
  closed?: boolean;
  width?: number;
}

interface PolylineEntity extends DxfEntityBase {
  type: 'POLYLINE';
  vertices: Array<{ x: number; y: number; z?: number }>;
  closed?: boolean;
}

interface LineEntity extends DxfEntityBase {
  type: 'LINE';
  start: { x: number; y: number; z?: number };
  end: { x: number; y: number; z?: number };
}

interface CircleEntity extends DxfEntityBase {
  type: 'CIRCLE';
  center: { x: number; y: number; z?: number };
  radius: number;
}

interface ArcEntity extends DxfEntityBase {
  type: 'ARC';
  center: { x: number; y: number; z?: number };
  radius: number;
  startAngle: number;
  endAngle: number;
}

interface TextEntity extends DxfEntityBase {
  type: 'TEXT' | 'MTEXT';
  text: string;
  position?: { x: number; y: number };
  startPoint?: { x: number; y: number };
  height?: number;
}

interface InsertEntity extends DxfEntityBase {
  type: 'INSERT';
  name: string; // block name
  position: { x: number; y: number; z?: number };
  xScale?: number;
  yScale?: number;
  rotation?: number;
}

type DxfEntity = LwPolylineEntity | PolylineEntity | LineEntity | CircleEntity | ArcEntity | TextEntity | InsertEntity | DxfEntityBase;

// ─── Output Types ─────────────────────────────────────────────────────────────

export interface ParsedCADData {
  walls: WallSegment[];
  rooms: RoomPolygon[];
  columns: DetectedColumn[];
  doors: DetectedDoor[];
  windows: DetectedWindow[];
  layers: string[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
  scaleRatio: number; // meters per normalized pixel unit (0-1000)
  rawEntityCount: number;
}

// ─── Main Parser ──────────────────────────────────────────────────────────────

/**
 * Parses a DXF text string into structured CAD elements.
 * @param dxfText - Raw DXF file content as string
 * @param scaleRatio - Optional meters-per-unit (from user calibration, default ~0.025)
 */
export function parseDxfToElements(dxfText: string, scaleRatio = 0.025): ParsedCADData {
  const parser = new DxfParser();
  let dxf: any;

  try {
    dxf = parser.parseSync(dxfText);
  } catch (e) {
    console.error('[dxfEngine] Failed to parse DXF:', e);
    return emptyResult();
  }

  const entities: DxfEntity[] = dxf.entities || [];
  const layers = dxf.tables?.layer?.layers
    ? Object.keys(dxf.tables.layer.layers)
    : [...new Set(entities.map((e: any) => e.layer || '0'))];

  // ── Compute Raw Bounding Box ─────────────────────────────────────────────
  const rawBounds = computeBounds(entities);
  if (rawBounds.width === 0 || rawBounds.height === 0) {
    return emptyResult();
  }

  const norm = createNormalizer(rawBounds, scaleRatio);

  // ── Classify Entities by Layer + Type ───────────────────────────────────
  const walls: WallSegment[] = [];
  const columns: DetectedColumn[] = [];
  const doors: DetectedDoor[] = [];
  const windows: DetectedWindow[] = [];
  const roomLabels: Array<{ point: Point; text: string }> = [];

  let wallId = 0;
  let colId = 0;
  let doorId = 0;
  let winId = 0;

  for (const entity of entities) {
    const layer = (entity.layer || '0').toUpperCase();
    const classification = classifyLayer(layer);

    switch (entity.type) {

      // ── LWPOLYLINE (most common wall/room boundary type) ─────────────────
      case 'LWPOLYLINE': {
        const e = entity as LwPolylineEntity;
        if (!e.vertices || e.vertices.length < 2) break;

        const pts: Point[] = e.vertices.map(v => ({
          x: norm.nx(v.x),
          y: norm.ny(v.y),
        }));

        if (e.closed && pts.length >= 3 && (classification === 'WALL' || classification === 'UNKNOWN')) {
          // Closed polyline = potential room boundary, treat as wall outline
          for (let i = 0; i < pts.length; i++) {
            const p1 = pts[i];
            const p2 = pts[(i + 1) % pts.length];
            const length = dist(p1, p2);
            if (length > 2) {
              walls.push({
                id: `wall_${wallId++}`,
                p1, p2,
                thicknessPx: 6,
                thicknessMm: 200,
                lengthPx: length,
                layer,
              });
            }
          }
        } else if (!e.closed && (classification === 'WALL' || classification === 'UNKNOWN')) {
          // Open polyline = wall segments
          for (let i = 0; i < pts.length - 1; i++) {
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const length = dist(p1, p2);
            if (length > 2) {
              walls.push({
                id: `wall_${wallId++}`,
                p1, p2,
                thicknessPx: 6,
                thicknessMm: 200,
                lengthPx: length,
                layer,
              });
            }
          }
        } else if (classification === 'DOOR') {
          // Door polyline - extract opening
          if (pts.length >= 2) {
            const cx = (pts[0].x + pts[pts.length - 1].x) / 2;
            const cy = (pts[0].y + pts[pts.length - 1].y) / 2;
            doors.push({
              id: `door_${doorId++}`,
              cx, cy, r: 25,
              startAngle: 0, endAngle: 90,
              widthM: 0.9,
            });
          }
        }
        break;
      }

      // ── LINE ─────────────────────────────────────────────────────────────
      case 'LINE': {
        const e = entity as LineEntity;
        const p1 = { x: norm.nx(e.start.x), y: norm.ny(e.start.y) };
        const p2 = { x: norm.nx(e.end.x), y: norm.ny(e.end.y) };
        const length = dist(p1, p2);
        if (length < 2) break;

        if (classification === 'WALL' || classification === 'UNKNOWN') {
          walls.push({
            id: `wall_${wallId++}`,
            p1, p2,
            thicknessPx: 4,
            thicknessMm: 150,
            lengthPx: length,
            layer,
          });
        } else if (classification === 'DOOR') {
          // Door line (swing indicator)
          doors.push({
            id: `door_${doorId++}`,
            cx: p1.x, cy: p1.y,
            r: length,
            startAngle: 0, endAngle: 90,
            widthM: norm.toMeters(length),
          });
        } else if (classification === 'WINDOW') {
          windows.push({
            id: `win_${winId++}`,
            x1: p1.x, y1: p1.y,
            x2: p2.x, y2: p2.y,
            widthM: norm.toMeters(length),
          });
        }
        break;
      }

      // ── CIRCLE ───────────────────────────────────────────────────────────
      case 'CIRCLE': {
        const e = entity as CircleEntity;
        const cx = norm.nx(e.center.x);
        const cy = norm.ny(e.center.y);
        const r = Math.round(e.radius * Math.min(norm.scaleX, norm.scaleY));

        if (classification === 'COLUMN') {
          columns.push({
            id: `col_${colId++}`,
            x: cx - r, y: cy - r,
            widthPx: r * 2, heightPx: r * 2,
            shape: 'ROUND',
            layer,
            widthM: norm.toMeters(r * 2),
            depthM: norm.toMeters(r * 2),
          });
        } else if (classification === 'DOOR') {
          // Arc/circle door swing
          doors.push({
            id: `door_${doorId++}`,
            cx, cy, r,
            startAngle: 0, endAngle: 90,
            widthM: norm.toMeters(r),
          });
        }
        break;
      }

      // ── ARC ──────────────────────────────────────────────────────────────
      case 'ARC': {
        const e = entity as ArcEntity;
        const cx = norm.nx(e.center.x);
        const cy = norm.ny(e.center.y);
        const r = Math.round(e.radius * Math.min(norm.scaleX, norm.scaleY));

        if (classification === 'DOOR' || r < 120) {
          // Arcs in door layers OR small arcs near walls = door swing
          doors.push({
            id: `door_${doorId++}`,
            cx, cy, r,
            startAngle: e.startAngle,
            endAngle: e.endAngle,
            widthM: norm.toMeters(r),
          });
        }
        break;
      }

      // ── INSERT (block reference) ─────────────────────────────────────────
      case 'INSERT': {
        const e = entity as InsertEntity;
        const cx = norm.nx(e.position.x);
        const cy = norm.ny(e.position.y);
        const blockName = (e.name || '').toUpperCase();

        if (classification === 'COLUMN' || /COL|PILLAR|COLUMN/i.test(blockName)) {
          const sz = 20; // default column size in pixels
          columns.push({
            id: `col_${colId++}`,
            x: cx - sz / 2, y: cy - sz / 2,
            widthPx: sz, heightPx: sz,
            shape: 'RECT',
            layer,
            widthM: 0.3, depthM: 0.7,
          });
        } else if (classification === 'DOOR' || /DOOR|DR/i.test(blockName)) {
          doors.push({
            id: `door_${doorId++}`,
            cx, cy, r: 25,
            startAngle: 0, endAngle: 90,
            widthM: 0.9,
          });
        } else if (classification === 'WINDOW' || /WIN|WINDOW|WDW/i.test(blockName)) {
          windows.push({
            id: `win_${winId++}`,
            x1: cx - 25, y1: cy,
            x2: cx + 25, y2: cy,
            widthM: 1.2,
          });
        }
        break;
      }

      // ── TEXT / MTEXT ─────────────────────────────────────────────────────
      case 'TEXT':
      case 'MTEXT': {
        const e = entity as TextEntity;
        const rawPos = e.position || e.startPoint || { x: 0, y: 0 };
        const pos = { x: norm.nx(rawPos.x), y: norm.ny(rawPos.y) };
        const text = (e.text || '').replace(/\\P/g, ' ').replace(/\\[a-z][^;]*;/gi, '').trim();
        if (text.length > 0 && text.length < 50) {
          roomLabels.push({ point: pos, text });
        }
        break;
      }
    }
  }

  // ── Detect Rooms from Wall Topology ────────────────────────────────────
  const rooms = detectRoomsFromWalls(walls, roomLabels, scaleRatio);

  return {
    walls,
    rooms,
    columns,
    doors,
    windows,
    layers,
    bounds: rawBounds,
    scaleRatio,
    rawEntityCount: entities.length,
  };
}

// ─── Room Detection ───────────────────────────────────────────────────────────

function detectRoomsFromWalls(
  walls: WallSegment[],
  labels: Array<{ point: Point; text: string }>,
  scaleRatio: number
): RoomPolygon[] {
  if (walls.length < 4) return [];

  // Build topology graph from wall segments
  const wallEdges = walls.map(w => ({ p1: w.p1, p2: w.p2, id: w.id }));
  const graph = buildWallGraph(wallEdges, 8);

  // Find closed room polygons
  const polygons = findRoomPolygons(graph, 500, 950000);

  return polygons.map((polygon, idx) => {
    const c = centroid(polygon);
    const area = shoelaceArea(polygon, scaleRatio);
    const perim = polygonPerimeter(polygon, scaleRatio);
    const bbox = boundingBoxOfPolygon(polygon);

    // Try to match a text label that falls inside this polygon
    const matchedLabel = labels.find(l =>
      pointInPolygon(l.point, polygon)
    );

    const label = matchedLabel?.text || inferRoomName(area, idx);

    return {
      id: `room_${idx + 1}`,
      polygon,
      centroid: c,
      areaM2: area,
      perimeterM: perim,
      label,
      boundingBox: bbox,
    };
  });
}

function inferRoomName(areaM2: number, index: number): string {
  if (areaM2 > 40) return `Living / Hall ${index + 1}`;
  if (areaM2 > 20) return `Bedroom ${index + 1}`;
  if (areaM2 > 8) return `Room ${index + 1}`;
  if (areaM2 > 3) return `Bathroom / WC ${index + 1}`;
  return `Space ${index + 1}`;
}

// ─── Point-in-polygon (Ray Casting) ──────────────────────────────────────────

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ─── Bounds Computation ───────────────────────────────────────────────────────

function computeBounds(entities: DxfEntity[]): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const expand = (x: number, y: number) => {
    if (!isFinite(x) || !isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const e of entities) {
    switch (e.type) {
      case 'LINE': {
        const l = e as LineEntity;
        expand(l.start.x, l.start.y);
        expand(l.end.x, l.end.y);
        break;
      }
      case 'LWPOLYLINE': {
        const lw = e as LwPolylineEntity;
        lw.vertices?.forEach(v => expand(v.x, v.y));
        break;
      }
      case 'CIRCLE': case 'ARC': {
        const c = e as CircleEntity;
        expand(c.center.x - c.radius, c.center.y - c.radius);
        expand(c.center.x + c.radius, c.center.y + c.radius);
        break;
      }
      case 'TEXT': case 'MTEXT': {
        const t = e as TextEntity;
        const pos = t.position || t.startPoint;
        if (pos) expand(pos.x, pos.y);
        break;
      }
      case 'INSERT': {
        const ins = e as InsertEntity;
        expand(ins.position.x, ins.position.y);
        break;
      }
    }
  }

  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 1000, maxY: 1000, width: 1000, height: 1000 };
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// ─── Quantities Extraction ────────────────────────────────────────────────────

export function extractQuantitiesFromParsedCAD(data: ParsedCADData): any[] {
  const items: any[] = [];
  let idx = 1;

  // Walls — total linear meters
  const totalWallLengthM = data.walls.reduce((s, w) => s + w.lengthPx * data.scaleRatio, 0);
  if (data.walls.length > 0) {
    items.push({
      id: `q_${idx++}`, code: 'CSI-04200',
      name: `Masonry Walls — ${data.walls.length} segments`,
      category: 'Structure', quantity: Math.round(totalWallLengthM * 100) / 100,
      unit: 'm', unitPrice: 320, totalPrice: Math.round(totalWallLengthM * 320),
    });
  }

  // Rooms — floor finishes per room
  for (const room of data.rooms) {
    if (room.areaM2 < 1) continue;
    items.push({
      id: `q_${idx++}`, code: 'CSI-09300',
      name: `${room.label} — Floor Tiling & Finishes`,
      category: 'Finishes', quantity: room.areaM2,
      unit: 'm²', unitPrice: 220, totalPrice: Math.round(room.areaM2 * 220),
    });
  }

  // Columns
  if (data.columns.length > 0) {
    const totalVol = data.columns.length * 0.672;
    items.push({
      id: `q_${idx++}`, code: 'CSI-03300',
      name: `Structural Columns (${data.columns.length} pcs)`,
      category: 'Structural', quantity: Math.round(totalVol * 1000) / 1000,
      unit: 'm³', unitPrice: 4500, totalPrice: Math.round(totalVol * 4500),
    });
  }

  // Doors
  if (data.doors.length > 0) {
    items.push({
      id: `q_${idx++}`, code: 'CSI-08110',
      name: `Door Sets (${data.doors.length} items)`,
      category: 'Doors & Windows', quantity: data.doors.length * 1.98,
      unit: 'm²', unitPrice: 1200, totalPrice: data.doors.length * 1.98 * 1200,
    });
  }

  // Windows
  if (data.windows.length > 0) {
    items.push({
      id: `q_${idx++}`, code: 'CSI-08510',
      name: `Glazed Windows (${data.windows.length} items)`,
      category: 'Doors & Windows', quantity: data.windows.length * 2.1,
      unit: 'm²', unitPrice: 1800, totalPrice: data.windows.length * 2.1 * 1800,
    });
  }

  return items;
}

function emptyResult(): ParsedCADData {
  return {
    walls: [], rooms: [], columns: [], doors: [], windows: [],
    layers: [], bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000, width: 1000, height: 1000 },
    scaleRatio: 0.025, rawEntityCount: 0,
  };
}

// ─── Convert ParsedCADData → legacy SpatialElement[] (for backwards compat) ──

export function cadDataToSpatialElements(data: ParsedCADData): any[] {
  const elements: any[] = [];

  for (const room of data.rooms) {
    const { minX, minY, maxX, maxY } = room.boundingBox;
    elements.push({
      id: room.id,
      category: 'ROOM',
      name: room.label,
      box_2d: [minY, minX, maxY, maxX],
      polygon: room.polygon,
      area: room.areaM2,
      perimeter: room.perimeterM,
      walls_area: 0,
      doors_count: 0,
      windows_count: 0,
      unitPrice: 220,
      _isReal: true,
    });
  }

  for (const col of data.columns) {
    elements.push({
      id: col.id,
      category: 'COLUMN',
      name: `Concrete Column (${col.shape})`,
      box_2d: [col.y, col.x, col.y + col.heightPx, col.x + col.widthPx],
      length: col.depthM,
      width: col.widthM,
      height: 3.2,
      volume: col.widthM * col.depthM * 3.2,
      unitPrice: 4500,
      _isReal: true,
    });
  }

  for (const door of data.doors) {
    elements.push({
      id: door.id,
      category: 'DOOR',
      name: `Door (${door.widthM.toFixed(2)}m wide)`,
      box_2d: [door.cy - door.r, door.cx - door.r, door.cy + door.r, door.cx + door.r],
      arcData: { cx: door.cx, cy: door.cy, r: door.r, startAngle: door.startAngle, endAngle: door.endAngle },
      width: door.widthM,
      height: 2.1,
      area: door.widthM * 2.1,
      unitPrice: 1200,
      _isReal: true,
    });
  }

  for (const win of data.windows) {
    const cx = (win.x1 + win.x2) / 2;
    const cy = (win.y1 + win.y2) / 2;
    elements.push({
      id: win.id,
      category: 'WINDOW',
      name: `Window (${win.widthM.toFixed(2)}m wide)`,
      box_2d: [cy - 10, cx - 25, cy + 10, cx + 25],
      lineData: { x1: win.x1, y1: win.y1, x2: win.x2, y2: win.y2 },
      width: win.widthM,
      height: 1.4,
      area: win.widthM * 1.4,
      unitPrice: 1800,
      _isReal: true,
    });
  }

  return elements;
}
