import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Ruler,
  Layers,
  Crop,
  FileCheck,
  MousePointer,
  Sparkles,
  Sliders,
  Eye,
  Info,
  Grid,
  AlertTriangle,
} from 'lucide-react';
import type { DrawingType, DrawingReviewConfig } from '../types';
import { parseDxfText, parseDwgBinary, type ParsedDxfData } from '../utils/dxfParser';
import { DxfSvgRenderer } from './DxfSvgRenderer';
import { CadBlueprintSchematic } from './CadBlueprintSchematic';

interface CadReviewModalProps {
  isOpen: boolean;
  file: File | null;
  onClose: () => void;
  onConfirm: (reviewConfig: DrawingReviewConfig) => void;
}

export const CadReviewModal: React.FC<CadReviewModalProps> = ({
  isOpen,
  file,
  onClose,
  onConfirm,
}) => {
  const [drawingType, setDrawingType] = useState<DrawingType>('ARCHITECTURAL');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<'PAN' | 'CALIBRATE' | 'CROP'>('PAN');
  const [cadViewMode, setCadViewMode] = useState<'CAD_BLUEPRINT' | 'CAD_DARK' | 'ORIGINAL'>('CAD_BLUEPRINT');
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [dxfData, setDxfData] = useState<ParsedDxfData | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Scale calibration state (2 points)
  const [calibrationPoints, setCalibrationPoints] = useState<Array<[number, number]>>([]);
  const [calibratedLength, setCalibratedLength] = useState<number>(5.0); // Default 5 meters
  const [isCalibrated, setIsCalibrated] = useState(false);

  // Layer visibility toggles
  const [visibleLayers, setVisibleLayers] = useState({
    walls: true,
    columns: true,
    openings: true,
    annotations: true,
    grid: true,
  });

  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!file) {
      setFilePreviewUrl(null);
      setDxfData(null);
      setParseError(null);
      return;
    }

    setParseError(null);

    const isDxfFile = file.name.toLowerCase().endsWith('.dxf');
    const isDwgFile = file.name.toLowerCase().endsWith('.dwg');

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setFilePreviewUrl(url);
      setDxfData(null);
      return () => URL.revokeObjectURL(url);
    } else if (isDxfFile) {
      setFilePreviewUrl(null);
      file
        .text()
        .then((txt) => {
          const parsed = parseDxfText(txt);
          if (parsed.entities.length === 0) {
            setParseError(`No readable vector geometry entities found in '${file.name}'. Please check the DXF file format.`);
            setDxfData(null);
          } else {
            setDxfData(parsed);
          }
        })
        .catch((err) => {
          setParseError(`Failed to parse CAD DXF file '${file.name}': ${err.message}`);
          setDxfData(null);
        });
    } else if (isDwgFile) {
      setFilePreviewUrl(null);
      file
        .arrayBuffer()
        .then((buffer) => {
          const parsed = parseDwgBinary(buffer, file.name);
          setDxfData(parsed);
          setParseError(null);
        })
        .catch((err) => {
          console.warn('DWG read warning, using safe DWG decoder fallback:', err);
          const parsed = parseDwgBinary(new ArrayBuffer(0), file.name);
          setDxfData(parsed);
          setParseError(null);
        });
    } else {
      setFilePreviewUrl(null);
      setDxfData(null);
    }
  }, [file]);

  if (!isOpen || !file) return null;

  const isDxf = file.name.toLowerCase().endsWith('.dxf');
  const isDwg = file.name.toLowerCase().endsWith('.dwg');
  const formattedFileSize =
    file.size < 1024 * 1024
      ? `${(file.size / 1024).toFixed(1)} KB`
      : `${(file.size / (1024 * 1024)).toFixed(2)} MB`;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool === 'PAN') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && activeTool === 'PAN') {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool !== 'CALIBRATE') return;

    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000);

    if (calibrationPoints.length >= 2) {
      setCalibrationPoints([[x, y]]);
      setIsCalibrated(false);
    } else {
      const nextPts = [...calibrationPoints, [x, y]] as Array<[number, number]>;
      setCalibrationPoints(nextPts);
      if (nextPts.length === 2) {
        setIsCalibrated(true);
      }
    }
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000);
    setCursorCoords({ x: Math.max(0, Math.min(1000, x)), y: Math.max(0, Math.min(1000, y)) });
  };

  const calculatePixelDistance = (): number => {
    if (calibrationPoints.length < 2) return 0;
    const [p1, p2] = calibrationPoints;
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    return Math.round(Math.sqrt(dx * dx + dy * dy));
  };

  const handleConfirmReview = () => {
    const pxDist = calculatePixelDistance();
    const scaleRatio = pxDist > 0 ? calibratedLength / pxDist : 0.025; // meters per unit

    onConfirm({
      fileName: file.name,
      drawingType,
      scaleRatio,
      calibratedLength: isCalibrated ? calibratedLength : undefined,
      calibrationPoints: calibrationPoints.length === 2 ? calibrationPoints : undefined,
      selectedLayers: Object.keys(visibleLayers).filter(
        (k) => visibleLayers[k as keyof typeof visibleLayers]
      ),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Bar */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">CAD Drawing Inspection & Verification</h2>
                <span className="text-[10px] uppercase tracking-wider font-mono font-semibold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                  {isDxf ? 'CAD / DXF Vector File' : 'PDF / Raster Drawing'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                File: <span className="text-slate-200 font-medium">{file.name}</span> ({formattedFileSize})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          {/* Viewport Control Tools */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTool('PAN')}
              className={`tool-btn ${activeTool === 'PAN' ? 'tool-btn-active' : ''}`}
            >
              <MousePointer className="w-3.5 h-3.5" />
              <span>Pan & Select</span>
            </button>

            <button
              onClick={() => setActiveTool('CALIBRATE')}
              className={`tool-btn ${activeTool === 'CALIBRATE' ? 'tool-btn-active' : ''}`}
            >
              <Ruler className="w-3.5 h-3.5" />
              <span>Calibrate Scale (2-Point)</span>
            </button>

            <button
              onClick={() => setActiveTool('CROP')}
              className={`tool-btn ${activeTool === 'CROP' ? 'tool-btn-active' : ''}`}
            >
              <Crop className="w-3.5 h-3.5" />
              <span>Focus Region</span>
            </button>

            {/* CAD View Mode Switcher */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setCadViewMode('CAD_BLUEPRINT')}
                className={`px-2 py-0.5 rounded font-semibold text-[11px] transition-colors ${
                  cadViewMode === 'CAD_BLUEPRINT'
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="CAD Blueprint Vector Linework View"
              >
                CAD Blueprint
              </button>
              <button
                onClick={() => setCadViewMode('CAD_DARK')}
                className={`px-2 py-0.5 rounded font-semibold text-[11px] transition-colors ${
                  cadViewMode === 'CAD_DARK'
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="CAD Dark High-Contrast View"
              >
                CAD Dark
              </button>
              <button
                onClick={() => setCadViewMode('ORIGINAL')}
                className={`px-2 py-0.5 rounded font-semibold text-[11px] transition-colors ${
                  cadViewMode === 'ORIGINAL'
                    ? 'bg-cyan-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Original PNG File"
              >
                Original PNG
              </button>
            </div>

            <div className="h-4 w-px bg-slate-800 mx-1" />

            {/* Drawing Type Preset Selection */}
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400">Preset:</span>
              <select
                value={drawingType}
                onChange={(e) => setDrawingType(e.target.value as DrawingType)}
                className="bg-slate-950 border border-slate-700 text-cyan-300 text-xs rounded-lg px-2.5 py-1 focus:border-cyan-500 focus:outline-none"
              >
                <option value="ARCHITECTURAL">Architectural Floor Plan</option>
                <option value="CIVIL">Civil & Structural Schematic</option>
                <option value="MIXED">Mixed MEP & Framing</option>
              </select>
            </div>
          </div>

          {/* Zoom and Reset Controls */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-950 rounded-lg border border-slate-800 p-0.5 text-xs">
              <button
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-800"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-mono text-cyan-400 font-bold">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-800"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white"
              title="Reset View"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left / Center CAD Canvas Workspace */}
          <div
            className={`flex-1 relative bg-slate-950 flex items-center justify-center overflow-hidden ${
              activeTool === 'PAN' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
            }`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <div
              className="relative transition-transform duration-75 ease-out w-[900px] h-[580px] rounded overflow-hidden shadow-2xl border border-cyan-900/40 flex items-center justify-center bg-slate-950"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
              }}
            >
              {/* Render DXF Vector Data, Binary DWG notice, File Preview Image, or Error Message */}
              {dxfData ? (
                <DxfSvgRenderer dxfData={dxfData} />
              ) : isDwg ? (
                <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-950/95 border border-cyan-500/40 rounded-2xl max-w-lg shadow-2xl backdrop-blur-md">
                  <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4 shadow-lg shadow-cyan-500/10">
                    <FileCheck className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">AutoCAD Binary DWG File Loaded</h3>
                  <p className="text-xs text-slate-300 leading-relaxed mb-4">
                    <strong className="text-cyan-300 font-mono">{file.name}</strong> is a compiled binary AutoCAD DWG drawing ({formattedFileSize}).
                  </p>
                  <div className="px-3.5 py-2 rounded-lg bg-cyan-950/80 border border-cyan-500/30 text-cyan-200 text-xs flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0 animate-pulse" />
                    <span>Click <strong>"Confirm & Extract Quantities with AI"</strong> below to convert and process this DWG file with our backend CAD engine.</span>
                  </div>
                </div>
              ) : filePreviewUrl ? (
                <div className="relative w-full h-full flex items-center justify-center bg-[#070a10] overflow-hidden">
                  {/* Background CAD Grid Pattern */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40">
                    <defs>
                      <pattern id="cadReviewGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="0.8" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#cadReviewGrid)" />
                  </svg>

                  {/* Filtered CAD Image Layer */}
                  <img
                    src={filePreviewUrl}
                    alt={file.name}
                    className={`w-full h-full object-contain select-none transition-all duration-300 ${
                      cadViewMode === 'CAD_BLUEPRINT' || cadViewMode === 'CAD_DARK'
                        ? 'filter invert hue-rotate-180 contrast-150 brightness-90 opacity-90'
                        : ''
                    }`}
                  />
                </div>
              ) : parseError ? (
                <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-950/90 text-rose-400 border border-rose-900/50 rounded-xl">
                  <AlertTriangle className="w-12 h-12 mb-3 text-rose-500 animate-bounce" />
                  <h3 className="text-base font-bold text-white mb-2">CAD Detection Error</h3>
                  <p className="text-xs text-rose-300 max-w-md leading-relaxed">{parseError}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center text-cyan-400">
                  <span className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mb-3" />
                  <span className="text-xs font-mono">Parsing CAD Vector Geometry...</span>
                </div>
              )}

              {/* Interactive Calibration & Overlay Layer */}
              <svg
                className="absolute top-0 left-0 w-full h-full pointer-events-auto"
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                onClick={handleSvgClick}
                onMouseMove={handleSvgMouseMove}
              >
                {/* Calibration Points & Metric Line */}
                {calibrationPoints.map(([cx, cy], idx) => (
                  <g key={idx}>
                    <circle cx={cx} cy={cy} r={7} fill="#06b6d4" stroke="#ffffff" strokeWidth={2} />
                    <text
                      x={cx + 10}
                      y={cy - 10}
                      fill="#38bdf8"
                      fontSize={13}
                      fontWeight="bold"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      P{idx + 1}
                    </text>
                  </g>
                ))}

                {calibrationPoints.length === 2 && (
                  <g>
                    <line
                      x1={calibrationPoints[0][0]}
                      y1={calibrationPoints[0][1]}
                      x2={calibrationPoints[1][0]}
                      y2={calibrationPoints[1][1]}
                      stroke="#06b6d4"
                      strokeWidth={3}
                      strokeDasharray="6 3"
                    />
                    <text
                      x={(calibrationPoints[0][0] + calibrationPoints[1][0]) / 2}
                      y={(calibrationPoints[0][1] + calibrationPoints[1][1]) / 2 - 12}
                      fill="#38bdf8"
                      fontSize={14}
                      fontWeight="bold"
                      textAnchor="middle"
                      className="drop-shadow-md font-mono"
                    >
                      {calibratedLength} m ({calculatePixelDistance()} px)
                    </text>
                  </g>
                )}
              </svg>
            </div>

            {/* Live Cursor Coordinate HUD */}
            <div className="absolute bottom-4 right-4 z-20 glass-panel px-3 py-1.5 rounded-lg text-[11px] font-mono text-cyan-400 border border-slate-700/60 shadow-lg">
              Coordinates: X: {cursorCoords.x} | Y: {cursorCoords.y}
            </div>
          </div>

          {/* Right CAD Inspector Sidebar */}
          <div className="w-80 bg-slate-900 border-l border-slate-800 p-4 flex flex-col gap-5 overflow-y-auto">
            {/* Calibration Panel */}
            <div className="glass-panel p-3.5 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Ruler className="w-4 h-4 text-cyan-400" />
                <span>Scale Calibration</span>
              </div>

              {activeTool === 'CALIBRATE' ? (
                <div className="text-xs text-slate-300 space-y-2">
                  <p className="text-slate-400">
                    Click 2 points on a known dimension line (e.g. wall or grid line) on the drawing.
                  </p>
                  {calibrationPoints.length < 2 ? (
                    <div className="px-2.5 py-1.5 rounded bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-[11px]">
                      Selected Points: <strong>{calibrationPoints.length} / 2</strong>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1">
                      <label className="block text-[11px] text-slate-400">Enter Known Distance (Meters):</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={calibratedLength}
                        onChange={(e) => setCalibratedLength(parseFloat(e.target.value) || 1)}
                        className="w-full bg-slate-950 border border-cyan-500/40 text-cyan-300 font-mono text-sm px-3 py-1.5 rounded-lg focus:outline-none focus:border-cyan-400"
                      />
                      <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Scale calibrated!</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setActiveTool('CALIBRATE')}
                  className="w-full btn btn-secondary text-xs py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 justify-center"
                >
                  Start Scale Calibration
                </button>
              )}
            </div>

            {/* CAD Layer Inspector */}
            <div className="glass-panel p-3.5 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span>CAD Layer Filters</span>
                </div>
                <Eye className="w-3.5 h-3.5 text-slate-400" />
              </div>

              <div className="space-y-2 text-xs">
                {Object.entries(visibleLayers).map(([layerKey, isVisible]) => (
                  <label
                    key={layerKey}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 cursor-pointer hover:border-slate-700 transition-colors"
                  >
                    <span className="capitalize font-medium text-slate-300">{layerKey} Layer</span>
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() =>
                        setVisibleLayers((prev) => ({
                          ...prev,
                          [layerKey]: !prev[layerKey as keyof typeof visibleLayers],
                        }))
                      }
                      className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500 bg-slate-900"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* AI Pre-processing Note */}
            <div className="bg-cyan-950/40 border border-cyan-500/20 p-3 rounded-xl text-xs text-cyan-200 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-cyan-400">
                <Info className="w-4 h-4" />
                <span>Next Step: AI Quantity Extraction</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Reviewing ensures accurate floor boundaries before running Gemini AI detection models for room polygons, columns, doors, and BOQ totals.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="btn btn-secondary text-xs px-4 py-2 border-slate-700 text-slate-300 hover:text-white"
          >
            Cancel Upload
          </button>

          <button
            onClick={handleConfirmReview}
            className="btn btn-primary text-xs px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold shadow-lg shadow-cyan-500/25 flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Confirm & Extract Quantities with AI</span>
          </button>
        </div>
      </div>
    </div>
  );
};
