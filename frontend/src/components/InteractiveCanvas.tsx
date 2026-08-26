import React, { useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  MousePointer,
  Square,
  Ruler,
  Hash,
  Scale,
  Eye,
  CheckCircle,
  Sparkles,
} from 'lucide-react';
import type {
  SpatialElement,
  ManualMeasurement,
  TakeoffToolMode,
  LayerVisibility,
} from '../types';
import { CadBlueprintSchematic } from './CadBlueprintSchematic';

interface InteractiveCanvasProps {
  imageUrl?: string;
  elements: SpatialElement[];
  manualMeasurements: ManualMeasurement[];
  selectedElement: SpatialElement | ManualMeasurement | null;
  onSelectElement: (element: SpatialElement | ManualMeasurement | null) => void;
  onAddManualMeasurement: (measurement: ManualMeasurement) => void;
}

export const InteractiveCanvas: React.FC<InteractiveCanvasProps> = ({
  imageUrl,
  elements,
  manualMeasurements,
  selectedElement,
  onSelectElement,
  onAddManualMeasurement,
}) => {
  const [activeTool, setActiveTool] = useState<TakeoffToolMode>('SELECT');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredElement, setHoveredElement] = useState<any | null>(null);

  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Active drawing state for manual tools
  const [currentPoints, setCurrentPoints] = useState<Array<[number, number]>>([]);
  const [customName, setCustomName] = useState('');

  // Layer visibility state
  const [layers, setLayers] = useState<LayerVisibility>({
    rooms: true,
    structure: true,
    openings: true,
    manual: true,
  });

  const sampleImage =
    imageUrl ||
    'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1600&q=80';

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 4));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool === 'SELECT') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && activeTool === 'SELECT') {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000);
    setCursorCoords({ x: Math.max(0, Math.min(1000, x)), y: Math.max(0, Math.min(1000, y)) });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Handle canvas click for drawing tools
  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'SELECT' || activeTool === 'SCALE') return;

    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000);

    if (activeTool === 'COUNT') {
      const newMeasurement: ManualMeasurement = {
        id: `count_${Date.now()}`,
        type: 'COUNT',
        name: customName || `Manual Pin #${manualMeasurements.length + 1}`,
        category: 'Manual Takeoff',
        points: [[x, y]],
        value: 1,
        unit: 'pcs',
        unitPrice: 150,
        color: '#a855f7',
      };
      onAddManualMeasurement(newMeasurement);
      setCustomName('');
      return;
    }

    // AREA or LENGTH
    setCurrentPoints((prev) => [...prev, [x, y]]);
  };

  const calculateAreaFromPoints = (pts: Array<[number, number]>): number => {
    if (pts.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i][0] * pts[j][1];
      area -= pts[j][0] * pts[i][1];
    }
    // Scale factor approximation: 1000px = 25m
    const rawSqPx = Math.abs(area) / 2;
    const sqMeters = rawSqPx * 0.000625 * 100;
    return Math.round(sqMeters * 100) / 100;
  };

  const calculateLengthFromPoints = (pts: Array<[number, number]>): number => {
    if (pts.length < 2) return 0;
    let dist = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i + 1][0] - pts[i][0];
      const dy = pts[i + 1][1] - pts[i][1];
      dist += Math.sqrt(dx * dx + dy * dy);
    }
    const meters = dist * 0.025;
    return Math.round(meters * 100) / 100;
  };

  const finishManualMeasurement = () => {
    if (currentPoints.length < 2) return;

    if (activeTool === 'AREA' && currentPoints.length >= 3) {
      const area = calculateAreaFromPoints(currentPoints);
      const newMeasurement: ManualMeasurement = {
        id: `area_${Date.now()}`,
        type: 'AREA',
        name: customName || `Custom Zone #${manualMeasurements.length + 1}`,
        category: 'Custom Area',
        points: currentPoints,
        value: area,
        unit: 'm²',
        unitPrice: 220,
        color: '#06b6d4',
      };
      onAddManualMeasurement(newMeasurement);
    } else if (activeTool === 'LENGTH') {
      const length = calculateLengthFromPoints(currentPoints);
      const newMeasurement: ManualMeasurement = {
        id: `len_${Date.now()}`,
        type: 'LENGTH',
        name: customName || `Linear Boundary #${manualMeasurements.length + 1}`,
        category: 'Linear Wall',
        points: currentPoints,
        value: length,
        unit: 'm',
        unitPrice: 85,
        color: '#10b981',
      };
      onAddManualMeasurement(newMeasurement);
    }

    setCurrentPoints([]);
    setCustomName('');
    setActiveTool('SELECT');
  };

  const getCategoryColor = (category: string, isSelected: boolean) => {
    switch (category) {
      case 'COLUMN':
        return {
          fill: isSelected ? 'rgba(244, 63, 94, 0.5)' : 'rgba(244, 63, 94, 0.25)',
          stroke: '#f43f5e',
        };
      case 'BEAM':
      case 'SLAB':
        return {
          fill: isSelected ? 'rgba(16, 185, 129, 0.5)' : 'rgba(16, 185, 129, 0.25)',
          stroke: '#10b981',
        };
      case 'DOOR':
      case 'WINDOW':
        return {
          fill: isSelected ? 'rgba(245, 158, 11, 0.6)' : 'rgba(245, 158, 11, 0.3)',
          stroke: '#f59e0b',
        };
      case 'ROOM':
      default:
        return {
          fill: isSelected ? 'rgba(6, 182, 212, 0.45)' : 'rgba(6, 182, 212, 0.2)',
          stroke: '#06b6d4',
        };
    }
  };

  const isLayerVisible = (category: string) => {
    if (category === 'ROOM') return layers.rooms;
    if (category === 'COLUMN' || category === 'BEAM' || category === 'SLAB')
      return layers.structure;
    if (category === 'DOOR' || category === 'WINDOW') return layers.openings;
    return true;
  };

  return (
    <div className="glass-panel relative overflow-hidden flex flex-col h-[700px]">
      {/* Top Kreo Workstation Header */}
      <div className="p-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 z-20">
        {/* Left Toolbar Mode Controls */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => {
              setActiveTool('SELECT');
              setCurrentPoints([]);
            }}
            className={`tool-btn ${activeTool === 'SELECT' ? 'tool-btn-active' : ''}`}
            title="Selection & Inspection Mode"
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span>Select</span>
          </button>

          <button
            onClick={() => {
              setActiveTool('AREA');
              setCurrentPoints([]);
            }}
            className={`tool-btn ${activeTool === 'AREA' ? 'tool-btn-active' : ''}`}
            title="Measure Area (Polygon)"
          >
            <Square className="w-3.5 h-3.5" />
            <span>Area (m²)</span>
          </button>

          <button
            onClick={() => {
              setActiveTool('LENGTH');
              setCurrentPoints([]);
            }}
            className={`tool-btn ${activeTool === 'LENGTH' ? 'tool-btn-active' : ''}`}
            title="Measure Linear Length"
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>Length (m)</span>
          </button>

          <button
            onClick={() => {
              setActiveTool('COUNT');
              setCurrentPoints([]);
            }}
            className={`tool-btn ${activeTool === 'COUNT' ? 'tool-btn-active' : ''}`}
            title="Counter Marker Pin"
          >
            <Hash className="w-3.5 h-3.5" />
            <span>Count Pin</span>
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          {/* Scale Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950 border border-cyan-500/30 text-[11px] font-mono text-cyan-400">
            <Scale className="w-3.5 h-3.5" />
            <span>Scale 1:100</span>
          </div>
        </div>

        {/* Right Zoom & Layer Controls */}
        <div className="flex items-center gap-2">
          {/* Layer Visibility Toggles */}
          <div className="hidden lg:flex items-center gap-1 bg-slate-950/80 px-2 py-1 rounded border border-slate-800 text-[11px]">
            <Eye className="w-3.5 h-3.5 text-slate-400 mr-1" />
            <button
              onClick={() => setLayers((l) => ({ ...l, rooms: !l.rooms }))}
              className={`px-1.5 py-0.5 rounded font-semibold transition-colors ${
                layers.rooms ? 'text-cyan-400 bg-cyan-950/50' : 'text-slate-500 line-through'
              }`}
            >
              Rooms
            </button>
            <button
              onClick={() => setLayers((l) => ({ ...l, structure: !l.structure }))}
              className={`px-1.5 py-0.5 rounded font-semibold transition-colors ${
                layers.structure ? 'text-emerald-400 bg-emerald-950/50' : 'text-slate-500 line-through'
              }`}
            >
              Structure
            </button>
            <button
              onClick={() => setLayers((l) => ({ ...l, openings: !l.openings }))}
              className={`px-1.5 py-0.5 rounded font-semibold transition-colors ${
                layers.openings ? 'text-amber-400 bg-amber-950/50' : 'text-slate-500 line-through'
              }`}
            >
              Openings
            </button>
          </div>

          <div className="flex items-center bg-slate-800/80 rounded-lg border border-slate-700 p-0.5">
            <button
              onClick={handleZoomOut}
              className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-700"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono font-bold px-2 text-cyan-400">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-700"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700"
            title="Reset Pan & Zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Active Tool Guidance Banner */}
      {activeTool !== 'SELECT' && (
        <div className="bg-cyan-950/80 border-b border-cyan-500/30 px-4 py-2 flex items-center justify-between text-xs text-cyan-200 z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span>
              {activeTool === 'AREA' &&
                'Click points on the floor plan to draw area polygon. Double-click or hit Finish when done.'}
              {activeTool === 'LENGTH' &&
                'Click points to trace linear distance. Hit Finish when done.'}
              {activeTool === 'COUNT' &&
                'Click anywhere on the CAD sheet to place count pins.'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {(activeTool === 'AREA' || activeTool === 'LENGTH') && currentPoints.length > 0 && (
              <button
                onClick={finishManualMeasurement}
                className="btn btn-primary text-xs py-1 px-3 bg-cyan-600 hover:bg-cyan-500 border-cyan-400"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Save Measurement</span>
              </button>
            )}

            <button
              onClick={() => {
                setActiveTool('SELECT');
                setCurrentPoints([]);
              }}
              className="text-xs text-slate-400 hover:text-white underline ml-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Canvas Sheet Viewport */}
      <div
        className={`relative flex-1 overflow-hidden bg-slate-950 flex items-center justify-center ${
          activeTool === 'SELECT'
            ? 'cursor-grab active:cursor-grabbing'
            : 'cursor-crosshair'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="relative transition-transform duration-75 ease-out w-[950px] h-[630px] rounded overflow-hidden shadow-2xl border border-cyan-900/50"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
        >
          {/* Vector CAD Blueprint Drawing Floor Plan Sheet */}
          <CadBlueprintSchematic />

          <svg
            className="absolute top-0 left-0 w-full h-full pointer-events-auto"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            onClick={handleCanvasClick}
            onMouseMove={handleSvgMouseMove}
          >
            {/* AI Detected Spatial Elements */}
            {elements.map((element) => {
              if (!element.box_2d || element.box_2d.length < 4) return null;
              if (!isLayerVisible(element.category)) return null;

              const [ymin, xmin, ymax, xmax] = element.box_2d;
              const isSelected = selectedElement?.id === element.id;
              const colors = getCategoryColor(element.category, isSelected);

              return (
                <g key={element.id}>
                  <rect
                    x={xmin}
                    y={ymin}
                    width={xmax - xmin}
                    height={ymax - ymin}
                    fill={colors.fill}
                    stroke={colors.stroke}
                    strokeWidth={isSelected ? 4 : 2}
                    strokeDasharray={isSelected ? '6 3' : 'none'}
                    className="cursor-pointer transition-all hover:opacity-80"
                    onMouseEnter={() => setHoveredElement(element)}
                    onMouseLeave={() => setHoveredElement(null)}
                    onClick={(e) => {
                      if (activeTool !== 'SELECT') return;
                      e.stopPropagation();
                      onSelectElement(element);
                    }}
                  />

                  <text
                    x={xmin + 6}
                    y={ymin + 20}
                    fill="#ffffff"
                    fontSize={14}
                    fontWeight="bold"
                    pointerEvents="none"
                    className="drop-shadow-md select-none font-sans"
                  >
                    {element.name}
                  </text>
                </g>
              );
            })}

            {/* Saved Manual Measurements Overlay */}
            {layers.manual &&
              manualMeasurements.map((m) => {
                const isSelected = selectedElement?.id === m.id;

                if (m.type === 'AREA' && m.points.length >= 3) {
                  const pointsString = m.points.map((p) => p.join(',')).join(' ');
                  const firstPt = m.points[0];

                  return (
                    <g key={m.id}>
                      <polygon
                        points={pointsString}
                        fill={isSelected ? 'rgba(168, 85, 247, 0.45)' : 'rgba(168, 85, 247, 0.25)'}
                        stroke={m.color || '#a855f7'}
                        strokeWidth={isSelected ? 4 : 2}
                        className="cursor-pointer hover:opacity-80 transition-all"
                        onClick={(e) => {
                          if (activeTool !== 'SELECT') return;
                          e.stopPropagation();
                          onSelectElement(m);
                        }}
                      />
                      <text
                        x={firstPt[0] + 5}
                        y={firstPt[1] - 5}
                        fill="#c084fc"
                        fontSize={13}
                        fontWeight="bold"
                        pointerEvents="none"
                      >
                        {m.name} ({m.value} m²)
                      </text>
                    </g>
                  );
                }

                if (m.type === 'LENGTH' && m.points.length >= 2) {
                  const pointsString = m.points.map((p) => p.join(',')).join(' ');
                  const firstPt = m.points[0];

                  return (
                    <g key={m.id}>
                      <polyline
                        points={pointsString}
                        fill="none"
                        stroke={m.color || '#10b981'}
                        strokeWidth={isSelected ? 5 : 3}
                        className="cursor-pointer hover:opacity-80 transition-all"
                        onClick={(e) => {
                          if (activeTool !== 'SELECT') return;
                          e.stopPropagation();
                          onSelectElement(m);
                        }}
                      />
                      <text
                        x={firstPt[0] + 5}
                        y={firstPt[1] - 5}
                        fill="#34d399"
                        fontSize={13}
                        fontWeight="bold"
                        pointerEvents="none"
                      >
                        {m.name} ({m.value} m)
                      </text>
                    </g>
                  );
                }

                if (m.type === 'COUNT' && m.points.length > 0) {
                  const [px, py] = m.points[0];
                  return (
                    <g
                      key={m.id}
                      className="cursor-pointer"
                      onClick={(e) => {
                        if (activeTool !== 'SELECT') return;
                        e.stopPropagation();
                        onSelectElement(m);
                      }}
                    >
                      <circle cx={px} cy={py} r={12} fill="#a855f7" stroke="#ffffff" strokeWidth={2} />
                      <text
                        x={px}
                        y={py + 4}
                        fill="#ffffff"
                        fontSize={11}
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        #
                      </text>
                    </g>
                  );
                }
                return null;
              })}

            {/* Currently Active In-Progress Polyline / Polygon */}
            {currentPoints.length > 0 && (
              <g>
                {activeTool === 'AREA' && currentPoints.length >= 2 && (
                  <polygon
                    points={currentPoints.map((p) => p.join(',')).join(' ')}
                    fill="rgba(6, 182, 212, 0.2)"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                  />
                )}

                {activeTool === 'LENGTH' && currentPoints.length >= 2 && (
                  <polyline
                    points={currentPoints.map((p) => p.join(',')).join(' ')}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth={3}
                    strokeDasharray="4 2"
                  />
                )}

                {currentPoints.map(([px, py], idx) => (
                  <circle key={idx} cx={px} cy={py} r={5} fill="#06b6d4" stroke="#ffffff" strokeWidth={2} />
                ))}
              </g>
            )}
          </svg>
        </div>

        {/* Live Coordinate HUD & Hover Tooltip */}
        <div className="absolute bottom-4 right-4 z-30 flex items-center gap-3">
          <div className="glass-panel px-3 py-1.5 rounded-lg border border-slate-700/60 text-[11px] font-mono text-cyan-400 flex items-center gap-3 shadow-lg">
            <div>
              <span className="text-slate-400">X:</span> {cursorCoords.x}{' '}
              <span className="text-slate-400 ml-1">Y:</span> {cursorCoords.y}
            </div>
            <div className="h-3 w-px bg-slate-700" />
            <div className="text-slate-300">
              <span className="text-slate-400">Real Scale:</span> {(cursorCoords.x * 0.025).toFixed(1)}m, {(cursorCoords.y * 0.025).toFixed(1)}m
            </div>
          </div>
        </div>

        {hoveredElement && (
          <div className="absolute bottom-4 left-4 z-30 glass-panel px-4 py-2.5 rounded-xl border border-cyan-500/40 text-xs shadow-2xl pointer-events-none">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">{hoveredElement.name}</span>
              <span className="text-cyan-400 font-mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30">
                {hoveredElement.category}
              </span>
            </div>
            {hoveredElement.area && (
              <div className="text-slate-300 text-[11px] mt-1 flex items-center gap-3 font-mono">
                <span>Area: <strong className="text-cyan-300 font-bold">{hoveredElement.area.toFixed(2)} m²</strong></span>
                {hoveredElement.perimeter && <span>Perimeter: <strong className="text-emerald-300 font-bold">{hoveredElement.perimeter.toFixed(2)} m</strong></span>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
