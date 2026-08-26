/**
 * pdfEngine.ts
 * Extracts vector geometry from PDF files using pdfjs-dist operator list.
 * Works for vector CAD-exported PDFs (AutoCAD → PDF, etc.).
 * Falls back gracefully for raster/scanned PDFs.
 */

import type { ParsedCADData } from './dxfEngine';
import {
  createNormalizer,
  classifyLayer,
  buildWallGraph,
  findRoomPolygons,
  shoelaceArea,
  polygonPerimeter,
  centroid,
  boundingBoxOfPolygon,
  dist,
  type Point,
} from './spatialAnalysis';

// ─── PDF Path Segment ────────────────────────────────────────────────────────

interface PathSegment {
  points: Point[];
  isClosed: boolean;
  isFilled: boolean;
  isStroked: boolean;
  lineWidth: number;
}

interface PDFBounds {
  minX: number; minY: number;
  maxX: number; maxY: number;
}

// ─── Main PDF Parser ──────────────────────────────────────────────────────────

/**
 * Extracts CAD geometry from a PDF ArrayBuffer.
 * @returns ParsedCADData or null if PDF is raster/unreadable
 */
export async function parsePdfToElements(buffer: ArrayBuffer, scaleRatio = 0.025): Promise<ParsedCADData | null> {
  let pdfjsLib: any;
  try {
    pdfjsLib = await import('pdfjs-dist');
    // Set worker source (use CDN worker for simplicity in browser)
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    }
  } catch (e) {
    console.error('[pdfEngine] pdfjs-dist not available:', e);
    return null;
  }

  let pdf: any;
  try {
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    pdf = await loadingTask.promise;
  } catch (e) {
    console.error('[pdfEngine] Failed to load PDF:', e);
    return null;
  }

  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });

  let operatorList: any;
  try {
    operatorList = await page.getOperatorList();
  } catch (e) {
    console.error('[pdfEngine] Failed to get operator list:', e);
    return null;
  }

  const OPS = pdfjsLib.OPS;
  const paths = extractPathsFromOperators(operatorList, OPS, viewport);

  if (paths.length === 0) {
    console.warn('[pdfEngine] No vector paths found — this may be a raster PDF');
    return null;
  }

  return classifyPdfPaths(paths, scaleRatio, viewport);
}

// ─── Operator List Parser ─────────────────────────────────────────────────────

function extractPathsFromOperators(
  opList: { fnArray: number[]; argsArray: any[][] },
  OPS: any,
  viewport: { width: number; height: number }
): PathSegment[] {
  const paths: PathSegment[] = [];
  let currentPoints: Point[] = [];
  let currentLineWidth = 1;
  let isFilled = false;
  let isStroked = false;

  const pushPath = (closed: boolean) => {
    if (currentPoints.length >= 2) {
      paths.push({
        points: [...currentPoints],
        isClosed: closed,
        isFilled,
        isStroked,
        lineWidth: currentLineWidth,
      });
    }
    currentPoints = [];
    isFilled = false;
    isStroked = false;
  };

  // Transformation matrix stack
  let matrix = [1, 0, 0, 1, 0, 0];
  const matrixStack: number[][] = [];

  const transform = (x: number, y: number): Point => {
    // Apply current transform matrix + flip Y for SVG coordinate system
    return {
      x: matrix[0] * x + matrix[2] * y + matrix[4],
      y: viewport.height - (matrix[1] * x + matrix[3] * y + matrix[5]),
    };
  };

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    // Save/Restore graphics state
    if (fn === OPS.save) {
      matrixStack.push([...matrix]);
    } else if (fn === OPS.restore) {
      if (matrixStack.length > 0) matrix = matrixStack.pop()!;
    }

    // Transform
    else if (fn === OPS.transform) {
      const [a, b, c, d, e, f] = args;
      matrix = [
        matrix[0] * a + matrix[2] * b,
        matrix[1] * a + matrix[3] * b,
        matrix[0] * c + matrix[2] * d,
        matrix[1] * c + matrix[3] * d,
        matrix[0] * e + matrix[2] * f + matrix[4],
        matrix[1] * e + matrix[3] * f + matrix[5],
      ];
    }

    // Line width
    else if (fn === OPS.setLineWidth) {
      currentLineWidth = args[0];
    }

    // Path construction
    else if (fn === OPS.moveTo) {
      if (currentPoints.length >= 2) pushPath(false);
      currentPoints = [transform(args[0], args[1])];
    } else if (fn === OPS.lineTo) {
      currentPoints.push(transform(args[0], args[1]));
    } else if (fn === OPS.rectangle) {
      const [rx, ry, rw, rh] = args;
      const p1 = transform(rx, ry);
      const p2 = transform(rx + rw, ry);
      const p3 = transform(rx + rw, ry + rh);
      const p4 = transform(rx, ry + rh);
      if (currentPoints.length >= 2) pushPath(false);
      currentPoints = [p1, p2, p3, p4];
      isFilled = true;
    } else if (fn === OPS.curveTo) {
      // Approximate bezier with linear step (simplified)
      const [x1, y1, x2, y2, x3, y3] = args;
      currentPoints.push(transform(x3, y3)); // just take endpoint
    }

    // Strokes and fills
    else if (fn === OPS.stroke) {
      isStroked = true;
      pushPath(false);
    } else if (fn === OPS.fill || fn === OPS.eoFill) {
      isFilled = true;
      pushPath(true);
    } else if (fn === OPS.fillStroke || fn === OPS.eoFillStroke) {
      isFilled = true;
      isStroked = true;
      pushPath(true);
    } else if (fn === OPS.closePath) {
      pushPath(true);
    } else if (fn === OPS.endPath) {
      currentPoints = [];
    }
  }

  if (currentPoints.length >= 2) pushPath(false);

  return paths.filter(p => p.points.length >= 2);
}

// ─── Path Classification (Wall/Room/Column) ───────────────────────────────────

function classifyPdfPaths(
  paths: PathSegment[],
  scaleRatio: number,
  viewport: { width: number; height: number }
): ParsedCADData {
  const bounds: PDFBounds = { minX: 0, minY: 0, maxX: viewport.width, maxY: viewport.height };
  const norm = createNormalizer(bounds, scaleRatio);

  const walls: any[] = [];
  const rooms: any[] = [];
  const columns: any[] = [];
  const doors: any[] = [];
  const windows: any[] = [];

  let wallId = 0, colId = 0, doorId = 0, winId = 0;

  for (const path of paths) {
    if (path.points.length < 2) continue;

    const pts = path.points.map(p => ({ x: norm.nx(p.x), y: norm.ny(p.y) }));
    const pathLength = computePathLength(pts);
    const isClosed = path.isClosed && pts.length >= 3;

    // Estimate bounding box aspect ratio
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const pMinX = Math.min(...xs), pMaxX = Math.max(...xs);
    const pMinY = Math.min(...ys), pMaxY = Math.max(...ys);
    const pW = pMaxX - pMinX, pH = pMaxY - pMinY;
    const aspect = Math.max(pW, pH) / (Math.min(pW, pH) + 0.001);

    // Closed large rectangle = room
    if (isClosed && pW > 50 && pH > 50 && aspect < 8) {
      const polygon = pts;
      const areaM2 = shoelaceArea(polygon, scaleRatio);
      const c = centroid(polygon);
      rooms.push({
        id: `room_${rooms.length + 1}`,
        polygon,
        centroid: c,
        areaM2,
        perimeterM: polygonPerimeter(polygon, scaleRatio),
        label: inferRoomNameFromArea(areaM2),
        boundingBox: { minX: pMinX, minY: pMinY, maxX: pMaxX, maxY: pMaxY, width: pW, height: pH },
      });
    }

    // Very elongated closed shape = column
    else if (isClosed && pW < 50 && pH < 50 && pW > 5 && pH > 5) {
      columns.push({
        id: `col_${colId++}`,
        x: pMinX, y: pMinY,
        widthPx: pW, heightPx: pH,
        shape: 'RECT' as const,
        layer: '0',
        widthM: norm.toMeters(pW),
        depthM: norm.toMeters(pH),
      });
    }

    // Long line = wall segment
    else if (!isClosed && pathLength > 20) {
      // Split into individual segments
      for (let i = 0; i < pts.length - 1; i++) {
        const segLen = dist(pts[i], pts[i + 1]);
        if (segLen < 5) continue;
        walls.push({
          id: `wall_${wallId++}`,
          p1: pts[i],
          p2: pts[i + 1],
          thicknessPx: Math.max(2, path.lineWidth * norm.scaleX),
          thicknessMm: 150,
          lengthPx: segLen,
          layer: '0',
        });
      }
    }
  }

  // Try room detection from wall topology if no rooms found
  if (rooms.length === 0 && walls.length >= 4) {
    const graph = buildWallGraph(walls.map((w: any) => ({ p1: w.p1, p2: w.p2, id: w.id })), 8);
    const polygons = findRoomPolygons(graph, 500, 950000);
    polygons.forEach((polygon, idx) => {
      const c = centroid(polygon);
      const areaM2 = shoelaceArea(polygon, scaleRatio);
      rooms.push({
        id: `room_${idx + 1}`,
        polygon,
        centroid: c,
        areaM2,
        perimeterM: polygonPerimeter(polygon, scaleRatio),
        label: inferRoomNameFromArea(areaM2),
        boundingBox: boundingBoxOfPolygon(polygon),
      });
    });
  }

  return {
    walls, rooms, columns, doors, windows,
    layers: ['A-WALL', 'A-ROOM', 'S-COL'],
    bounds: { minX: 0, minY: 0, maxX: viewport.width, maxY: viewport.height, width: viewport.width, height: viewport.height },
    scaleRatio,
    rawEntityCount: paths.length,
  };
}

function computePathLength(pts: Point[]): number {
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) len += dist(pts[i], pts[i + 1]);
  return len;
}

function inferRoomNameFromArea(area: number): string {
  if (area > 45) return 'Main Hall / Living Area';
  if (area > 25) return 'Bedroom';
  if (area > 12) return 'Room';
  if (area > 4) return 'Bathroom / WC';
  return 'Space';
}

/**
 * Renders the PDF page to a canvas element and returns the image data URL.
 * Used as fallback when PDF is raster (no vector paths).
 */
export async function renderPdfToImageUrl(buffer: ArrayBuffer): Promise<string | null> {
  let pdfjsLib: any;
  try {
    pdfjsLib = await import('pdfjs-dist');
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    }
  } catch { return null; }

  try {
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x for quality

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.error('[pdfEngine] Failed to render PDF to image:', e);
    return null;
  }
}
