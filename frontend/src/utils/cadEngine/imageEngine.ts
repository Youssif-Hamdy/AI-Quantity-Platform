/**
 * imageEngine.ts
 * Raster image floor plan detection using OpenCV.js (WASM).
 * Detects walls (HoughLinesP), rooms (findContours), and columns.
 * Lazy-loads OpenCV only when an image file is detected.
 */

import {
  createNormalizer,
  buildWallGraph,
  findRoomPolygons,
  shoelaceArea,
  polygonPerimeter,
  centroid,
  boundingBoxOfPolygon,
  dist,
  type Point,
} from './spatialAnalysis';
import type { ParsedCADData } from './dxfEngine';

// ─── OpenCV Loader ────────────────────────────────────────────────────────────

let cvReady = false;
let cvLoadPromise: Promise<void> | null = null;

declare global {
  interface Window {
    cv: any;
    onOpenCvReady?: () => void;
  }
}

function loadOpenCV(): Promise<void> {
  if (cvReady) return Promise.resolve();
  if (cvLoadPromise) return cvLoadPromise;

  cvLoadPromise = new Promise((resolve, reject) => {
    if (typeof window.cv !== 'undefined' && window.cv.Mat) {
      cvReady = true;
      resolve();
      return;
    }

    window.onOpenCvReady = () => {
      cvReady = true;
      resolve();
    };

    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.9.0/opencv.js';
    script.async = true;
    script.onload = () => {
      // Wait for WASM initialization
      const check = setInterval(() => {
        if (window.cv && window.cv.Mat) {
          clearInterval(check);
          cvReady = true;
          resolve();
        }
      }, 100);
      // Timeout after 30 seconds
      setTimeout(() => {
        clearInterval(check);
        reject(new Error('OpenCV.js WASM failed to initialize within 30 seconds'));
      }, 30000);
    };
    script.onerror = () => reject(new Error('Failed to load OpenCV.js from CDN'));
    document.head.appendChild(script);
  });

  return cvLoadPromise;
}

// ─── Main Image Engine ────────────────────────────────────────────────────────

/**
 * Detects CAD elements from a raster image (PNG/JPG) using OpenCV.js.
 * Runs: Grayscale → Threshold → Canny → HoughLinesP (walls) + findContours (rooms)
 * @param imageSource - URL string or HTMLImageElement
 */
export async function parseImageToElements(
  imageSource: string | HTMLImageElement,
  scaleRatio = 0.025
): Promise<ParsedCADData> {
  await loadOpenCV();
  const cv = window.cv;

  return new Promise<ParsedCADData>((resolve) => {
    const img = typeof imageSource === 'string'
      ? (() => { const el = new Image(); el.crossOrigin = 'anonymous'; el.src = imageSource; return el; })()
      : imageSource;

    const processImage = () => {
      const canvas = document.createElement('canvas');
      // Normalize to max 1200px wide for performance
      const maxDim = 1200;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
      canvas.width = Math.round((img.naturalWidth || img.width) * scale);
      canvas.height = Math.round((img.naturalHeight || img.height) * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      let src: any, gray: any, blurred: any, binary: any, edges: any, closed: any;
      try {
        src = cv.imread(canvas);
        gray = new cv.Mat();
        blurred = new cv.Mat();
        binary = new cv.Mat();
        edges = new cv.Mat();
        closed = new cv.Mat();

        // ── Step 1: Grayscale ───────────────────────────────────────────────
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        // ── Step 2: Blur (noise reduction) ──────────────────────────────────
        cv.GaussianBlur(gray, blurred, new cv.Size(3, 3), 0);

        // ── Step 3: Adaptive threshold (handles varying contrast in scans) ──
        cv.adaptiveThreshold(blurred, binary, 255,
          cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);

        // ── Step 4: Morphological closing (bridge wall gaps) ────────────────
        const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
        cv.morphologyEx(binary, closed, cv.MORPH_CLOSE, kernel);
        kernel.delete();

        // ── Step 5: Canny edge detection ────────────────────────────────────
        cv.Canny(closed, edges, 50, 150);

        // ── Detect walls via HoughLinesP ────────────────────────────────────
        const walls = detectWallsFromHough(cv, edges, canvas.width, canvas.height, scaleRatio);

        // ── Detect rooms via findContours ────────────────────────────────────
        const rooms = detectRoomsFromContours(cv, closed, canvas.width, canvas.height, scaleRatio);

        // ── Detect columns from small rectangular contours ──────────────────
        const columns = detectColumnsFromContours(cv, closed, canvas.width, canvas.height, scaleRatio);

        resolve({
          walls, rooms, columns, doors: [], windows: [],
          layers: ['detected'],
          bounds: { minX: 0, minY: 0, maxX: canvas.width, maxY: canvas.height, width: canvas.width, height: canvas.height },
          scaleRatio,
          rawEntityCount: walls.length + rooms.length + columns.length,
        });
      } catch (e) {
        console.error('[imageEngine] OpenCV processing error:', e);
        resolve({ walls: [], rooms: [], columns: [], doors: [], windows: [], layers: [], bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000, width: 1000, height: 1000 }, scaleRatio, rawEntityCount: 0 });
      } finally {
        src?.delete(); gray?.delete(); blurred?.delete();
        binary?.delete(); edges?.delete(); closed?.delete();
      }
    };

    if (img.complete) {
      processImage();
    } else {
      img.onload = processImage;
      img.onerror = () => resolve({ walls: [], rooms: [], columns: [], doors: [], windows: [], layers: [], bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000, width: 1000, height: 1000 }, scaleRatio, rawEntityCount: 0 });
    }
  });
}

// ─── Wall Detection via HoughLinesP ──────────────────────────────────────────

function detectWallsFromHough(
  cv: any,
  edges: any,
  imgW: number,
  imgH: number,
  scaleRatio: number
): any[] {
  const norm = createNormalizer({ minX: 0, minY: 0, maxX: imgW, maxY: imgH }, scaleRatio);
  const lines = new cv.Mat();
  const walls: any[] = [];

  try {
    // HoughLinesP: probabilistic version — detects line segments
    cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 40, 30, 10);

    for (let i = 0; i < lines.rows; i++) {
      const [x1, y1, x2, y2] = [
        lines.data32S[i * 4],
        lines.data32S[i * 4 + 1],
        lines.data32S[i * 4 + 2],
        lines.data32S[i * 4 + 3],
      ];

      const p1 = { x: norm.nx(x1), y: norm.ny(y1) };
      const p2 = { x: norm.nx(x2), y: norm.ny(y2) };
      const length = dist(p1, p2);

      if (length < 5) continue;

      walls.push({
        id: `wall_${walls.length}`,
        p1, p2,
        thicknessPx: 4,
        thicknessMm: 150,
        lengthPx: length,
        layer: 'detected',
      });
    }
  } finally {
    lines.delete();
  }

  return walls;
}

// ─── Room Detection via findContours ─────────────────────────────────────────

function detectRoomsFromContours(
  cv: any,
  binary: any,
  imgW: number,
  imgH: number,
  scaleRatio: number
): any[] {
  const norm = createNormalizer({ minX: 0, minY: 0, maxX: imgW, maxY: imgH }, scaleRatio);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const rooms: any[] = [];

  try {
    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      const perimeter = cv.arcLength(contour, true);

      // Filter: must be large enough to be a room (min 1% of image area)
      const minArea = imgW * imgH * 0.01;
      const maxArea = imgW * imgH * 0.70;
      if (area < minArea || area > maxArea) {
        contour.delete();
        continue;
      }

      // Approximate polygon (simplify contour)
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

      if (approx.rows >= 3) {
        const polygon: Point[] = [];
        for (let j = 0; j < approx.rows; j++) {
          polygon.push({
            x: norm.nx(approx.data32S[j * 2]),
            y: norm.ny(approx.data32S[j * 2 + 1]),
          });
        }

        const c = centroid(polygon);
        const areaM2 = shoelaceArea(polygon, scaleRatio);
        const bbox = boundingBoxOfPolygon(polygon);

        rooms.push({
          id: `room_${rooms.length + 1}`,
          polygon,
          centroid: c,
          areaM2: Math.max(0.1, areaM2),
          perimeterM: polygonPerimeter(polygon, scaleRatio),
          label: inferRoomName(areaM2),
          boundingBox: bbox,
        });
      }

      approx.delete();
      contour.delete();
    }
  } finally {
    contours.delete();
    hierarchy.delete();
  }

  return rooms;
}

// ─── Column Detection via Small Rectangular Contours ─────────────────────────

function detectColumnsFromContours(
  cv: any,
  binary: any,
  imgW: number,
  imgH: number,
  scaleRatio: number
): any[] {
  const norm = createNormalizer({ minX: 0, minY: 0, maxX: imgW, maxY: imgH }, scaleRatio);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const columns: any[] = [];

  try {
    cv.findContours(binary, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      const rect = cv.boundingRect(contour);

      // Column heuristics: small, roughly square, area 0.05%-0.5% of image
      const minColArea = imgW * imgH * 0.0005;
      const maxColArea = imgW * imgH * 0.005;
      const aspect = rect.width / (rect.height + 0.001);

      if (area >= minColArea && area <= maxColArea && aspect > 0.5 && aspect < 2.5) {
        const perimeter = cv.arcLength(contour, true);
        // Compactness check: columns are more "filled" than walls
        const compactness = (4 * Math.PI * area) / (perimeter * perimeter);
        if (compactness > 0.5) {
          const x = norm.nx(rect.x);
          const y = norm.ny(rect.y + rect.height);
          const w = Math.round(rect.width * norm.scaleX);
          const h = Math.round(rect.height * norm.scaleY);

          columns.push({
            id: `col_${columns.length}`,
            x, y,
            widthPx: w, heightPx: h,
            shape: 'RECT' as const,
            layer: 'detected',
            widthM: norm.toMeters(w),
            depthM: norm.toMeters(h),
          });
        }
      }

      contour.delete();
    }
  } finally {
    contours.delete();
    hierarchy.delete();
  }

  return columns;
}

function inferRoomName(area: number): string {
  if (area > 40) return 'Living / Hall';
  if (area > 20) return 'Bedroom';
  if (area > 10) return 'Room';
  if (area > 3) return 'Bathroom / WC';
  return 'Space';
}

/**
 * Check if OpenCV.js is already loaded and ready
 */
export function isOpenCVReady(): boolean {
  return cvReady || (typeof window.cv !== 'undefined' && !!window.cv.Mat);
}
