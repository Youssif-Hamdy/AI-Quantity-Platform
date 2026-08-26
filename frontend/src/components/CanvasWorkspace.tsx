import React, { useState, useRef } from 'react';
import {
  MousePointer, Square, Ruler, Hash,
  ZoomIn, ZoomOut, RotateCcw, Eye,
  CheckCircle, X, ArrowLeft, FileSpreadsheet,
  ChevronDown, ChevronRight, Layers, Sparkles, SlidersHorizontal,
  Box, Maximize2, Undo, Circle, Columns, Image as ImageIcon
} from 'lucide-react';
import type { SpatialElement, ManualMeasurement, TakeoffToolMode, LayerVisibility, QuantityItem } from '../types';
import { CadBlueprintSchematic } from './CadBlueprintSchematic';

interface CanvasWorkspaceProps {
  project: any;
  drawing: any;
  elements: SpatialElement[];
  manualMeasurements: ManualMeasurement[];
  quantities: QuantityItem[];
  selectedElement: SpatialElement | ManualMeasurement | null;
  onBack: () => void;
  onSelectElement: (el: SpatialElement | ManualMeasurement | null) => void;
  onAddManualMeasurement: (m: ManualMeasurement) => void;
  onUpdateUnitPrice: (id: string | number, price: number) => void;
  exportUrl: string;
}

const ROOM_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  room_101: { fill: 'rgba(139,92,246,0.30)', stroke: '#8b5cf6', label: '#c4b5fd' },
  room_102: { fill: 'rgba(20,184,166,0.30)', stroke: '#14b8a6', label: '#5eead4' },
  room_103: { fill: 'rgba(59,130,246,0.30)', stroke: '#3b82f6', label: '#93c5fd' },
  room_104: { fill: 'rgba(236,72,153,0.30)', stroke: '#ec4899', label: '#f9a8d4' },
  room_105: { fill: 'rgba(245,158,11,0.30)', stroke: '#f59e0b', label: '#fcd34d' },
};

function getElementColors(element: SpatialElement, isSelected: boolean) {
  if (element.category === 'COLUMN') {
    return { fill: isSelected ? 'rgba(239,68,68,0.6)' : 'rgba(239,68,68,0.35)', stroke: '#ef4444' };
  }
  if (element.category === 'DOOR') {
    return { fill: isSelected ? 'rgba(245,158,11,0.6)' : 'rgba(245,158,11,0.35)', stroke: '#f59e0b' };
  }
  if (element.category === 'WINDOW') {
    return { fill: isSelected ? 'rgba(6,182,212,0.5)' : 'rgba(6,182,212,0.3)', stroke: '#06b6d4' };
  }
  const c = ROOM_COLORS[element.id] || { fill: 'rgba(99,102,241,0.3)', stroke: '#6366f1', label: '#a5b4fc' };
  if (isSelected) return { fill: c.fill.replace(/[\d.]+\)$/, '0.55)'), stroke: c.stroke };
  return { fill: c.fill, stroke: c.stroke };
}

// Kreo Collaborators Cursors mock
const COLLABORATORS = [
  { id: '1', name: 'Richard (Architect)', x: 820, y: 180, color: '#3b82f6' },
  { id: '2', name: 'Andrew (QS Engineer)', x: 790, y: 520, color: '#ef4444' },
  { id: '3', name: 'Karolina (Estimator)', x: 730, y: 720, color: '#10b981' },
];

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  project, drawing, elements, manualMeasurements, quantities,
  selectedElement, onBack, onSelectElement, onAddManualMeasurement,
  onUpdateUnitPrice, exportUrl,
}) => {
  const [activeTool, setActiveTool] = useState<TakeoffToolMode>('SELECT');
  const [activeCategory, setActiveCategory] = useState<string>('Internal Walls 150mm');
  const [canvasDisplayMode, setCanvasDisplayMode] = useState<'SPLIT' | 'AI_VECTOR' | 'ORIGINAL_IMAGE'>('SPLIT');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Interactive drawing states
  const [currentPoints, setCurrentPoints] = useState<Array<[number, number]>>([]);
  const [cursorPos, setCursorPos] = useState<[number, number] | null>(null);
  
  // Sidebar state
  const [activeTab, setActiveTab] = useState<'takeoff' | 'boq'>('takeoff');
  const [openTreeNodes, setOpenTreeNodes] = useState<Record<string, boolean>>({
    walls: true,
    internalWalls: true,
    openings: true,
    spaces: true,
    structure: true,
  });

  // Layer Visibility
  const [layers, setLayers] = useState<LayerVisibility>({ rooms: true, structure: true, openings: true, manual: true });
  const svgRef = useRef<SVGSVGElement | null>(null);

  // For CAD vector drawings (DXF/DWG), imageUrl is empty. Only use image if it's a real uploaded image URL (data: or http/https image)
  const isCadFile = drawing.fileName?.toLowerCase().endsWith('.dxf') || drawing.fileName?.toLowerCase().endsWith('.dwg');
  const sampleImage = !isCadFile && drawing.imageUrl && (drawing.imageUrl.startsWith('http') || drawing.imageUrl.startsWith('data:') || drawing.imageUrl.startsWith('/uploads'))
    ? drawing.imageUrl
    : null;

  const toggleNode = (nodeKey: string) => {
    setOpenTreeNodes(prev => ({ ...prev, [nodeKey]: !prev[nodeKey] }));
  };

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.25, 4));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.25, 0.4));
  const handleReset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool === 'SELECT') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && activeTool === 'SELECT') {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }

    if (svgRef.current && activeTool !== 'SELECT') {
      const rect = svgRef.current.getBoundingClientRect();
      const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000);
      const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000);
      setCursorPos([Math.max(0, Math.min(1000, x)), Math.max(0, Math.min(1000, y))]);
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'SELECT') return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000);

    if (activeTool === 'COUNT') {
      onAddManualMeasurement({
        id: `cnt_${Date.now()}`,
        type: 'COUNT',
        name: `${activeCategory} Pin #${manualMeasurements.length + 1}`,
        category: activeCategory,
        points: [[x, y]],
        value: 1,
        unit: 'pcs',
        unitPrice: 120,
        color: '#a855f7'
      });
      return;
    }

    setCurrentPoints(p => [...p, [x, y]]);
  };

  // Live segment distance calculation in meters (scale ~ 1000px = 25m)
  const calcSegmentDistance = (p1: [number, number], p2: [number, number]) => {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    return Math.round(Math.sqrt(dx * dx + dy * dy) * 0.025 * 100) / 100;
  };

  // Live total polygon area calculation in m²
  const calcCurrentArea = (pts: Array<[number, number]>) => {
    if (pts.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i][0] * pts[j][1];
      area -= pts[j][0] * pts[i][1];
    }
    return Math.round(Math.abs(area) / 2 * 0.0625 * 100) / 100;
  };

  const finishMeasurement = () => {
    if (activeTool === 'AREA' && currentPoints.length >= 3) {
      const m2 = calcCurrentArea(currentPoints);
      onAddManualMeasurement({
        id: `area_${Date.now()}`,
        type: 'AREA',
        name: `${activeCategory} #${manualMeasurements.length + 1}`,
        category: activeCategory,
        points: currentPoints,
        value: m2,
        unit: 'm²',
        unitPrice: 180,
        color: '#06b6d4'
      });
    } else if (activeTool === 'LENGTH' && currentPoints.length >= 2) {
      let len = 0;
      for (let i = 0; i < currentPoints.length - 1; i++) {
        len += calcSegmentDistance(currentPoints[i], currentPoints[i + 1]);
      }
      onAddManualMeasurement({
        id: `len_${Date.now()}`,
        type: 'LENGTH',
        name: `${activeCategory} #${manualMeasurements.length + 1}`,
        category: activeCategory,
        points: currentPoints,
        value: Math.round(len * 100) / 100,
        unit: 'm',
        unitPrice: 95,
        color: '#10b981'
      });
    }
    setCurrentPoints([]);
    setCursorPos(null);
    setActiveTool('SELECT');
  };

  const removeLastPoint = () => {
    setCurrentPoints(p => p.slice(0, -1));
  };

  const totalCost = quantities.reduce((s, q) => s + q.quantity * (q.unitPrice || 0), 0);
  const totalRoomArea = elements.filter(el => el.category === 'ROOM').reduce((s, el) => s + (el.area || 0), 0);
  const totalConcreteVolume = elements.filter(el => el.category === 'COLUMN' || el.category === 'BEAM' || el.category === 'SLAB').reduce((s, el) => s + (el.volume || 0), 0);
  const totalOpeningsCount = elements.filter(el => el.category === 'DOOR' || el.category === 'WINDOW').length;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0b0f17] text-slate-100 font-sans select-none">
      {/* ── Top Bar Header ── */}
      <div className="bg-[#111827] border-b border-slate-800 flex flex-col z-30">
        <div className="h-12 flex items-center justify-between px-3">
          {/* Left Project / Drawing Info */}
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700 transition-colors">
              <ArrowLeft size={13} /> Back
            </button>
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="text-slate-400 font-semibold">{project?.name || 'Project'}</span>
              <span className="text-slate-600">/</span>
              <span className="text-white font-bold">{drawing.fileName}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800/50 uppercase">{drawing.drawingType}</span>
            </div>
          </div>

          {/* Center Precision Toolbar */}
          <div className="flex items-center gap-1 bg-[#090d14] p-1 rounded-lg border border-slate-800 shadow-inner">
            {([
              { id: 'SELECT', icon: MousePointer, label: 'Select' },
              { id: 'AREA',   icon: Square,       label: 'Area Takeoff (m²)' },
              { id: 'LENGTH', icon: Ruler,         label: 'Linear Wall (m)' },
              { id: 'COUNT',  icon: Hash,          label: 'Count Pin' },
            ] as const).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => { setActiveTool(id); setCurrentPoints([]); setCursorPos(null); }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
                  activeTool === id
                    ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-950/50'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Icon size={13} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Right Tools & Export */}
          <div className="flex items-center gap-3">
            {/* Split View Comparison Mode Selector */}
            <div className="flex items-center gap-0.5 bg-[#090d14] p-1 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setCanvasDisplayMode('SPLIT')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11.5px] font-semibold transition-all ${
                  canvasDisplayMode === 'SPLIT'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
                title="Side-by-Side Split View (Original PNG vs AI Takeoff)"
              >
                <Columns size={13} />
                <span>Split Comparison</span>
              </button>
              <button
                onClick={() => setCanvasDisplayMode('AI_VECTOR')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11.5px] font-semibold transition-all ${
                  canvasDisplayMode === 'AI_VECTOR'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
                title="AI Vector Takeoff Overlay Mode"
              >
                <Square size={13} />
                <span>AI Takeoff</span>
              </button>
              <button
                onClick={() => setCanvasDisplayMode('ORIGINAL_IMAGE')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11.5px] font-semibold transition-all ${
                  canvasDisplayMode === 'ORIGINAL_IMAGE'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
                title="Original Uploaded PNG Drawing File"
              >
                <ImageIcon size={13} />
                <span>Original PNG</span>
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-[#090d14] px-2 py-1 rounded-lg border border-slate-800 text-xs font-mono">
              <button onClick={handleZoomOut} className="text-slate-400 hover:text-white p-0.5"><ZoomOut size={13} /></button>
              <span className="text-cyan-400 w-10 text-center font-bold">{Math.round(zoom * 100)}%</span>
              <button onClick={handleZoomIn} className="text-slate-400 hover:text-white p-0.5"><ZoomIn size={13} /></button>
              <button onClick={handleReset} className="text-slate-400 hover:text-white p-0.5 ml-1" title="Reset View"><RotateCcw size={12} /></button>
            </div>

            <a href={exportUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-lg shadow-emerald-950/50">
              <FileSpreadsheet size={13} /> Export Excel
            </a>
          </div>
        </div>

        {/* Quick KPI Stats Summary Sub-Header */}
        <div className="px-3 py-1.5 bg-[#0a0f19] border-t border-slate-800/80 flex items-center justify-between overflow-x-auto text-xs">
          <div className="flex items-center gap-4 font-mono">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-900/80 border border-purple-500/30">
              <span className="text-purple-400 font-semibold text-[11px]">Total Room Area:</span>
              <strong className="text-white font-bold">{totalRoomArea.toFixed(1)} m²</strong>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-900/80 border border-cyan-500/30">
              <span className="text-cyan-400 font-semibold text-[11px]">Concrete Volume:</span>
              <strong className="text-white font-bold">{totalConcreteVolume.toFixed(2)} m³</strong>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-900/80 border border-amber-500/30">
              <span className="text-amber-400 font-semibold text-[11px]">Openings & Doors:</span>
              <strong className="text-white font-bold">{totalOpeningsCount} items</strong>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 rounded bg-slate-900/90 border border-emerald-500/40 font-mono">
            <span className="text-emerald-400 text-[11px] uppercase font-bold">Total BOQ Estimate:</span>
            <strong className="text-emerald-300 font-extrabold text-sm">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
          </div>
        </div>
      </div>

      {/* ── Main Workstation ── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* ── Left Category Tree Sidebar (Kreo Style) ── */}
        <div className="w-72 bg-[#0e1420] border-r border-slate-800/80 flex flex-col flex-shrink-0 z-20">
          <div className="p-3 border-b border-slate-800/80 flex items-center justify-between bg-[#111724]">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <Layers size={14} className="text-cyan-400" />
              <span>Spatial Takeoff Tree</span>
            </div>
            <span className="text-[10px] bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded font-bold">{elements.length + manualMeasurements.length} items</span>
          </div>

          {/* Tree View Structure */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs text-slate-300 font-sans">
            {/* Category Node: Walls */}
            <div className="rounded-lg bg-slate-900/40 border border-slate-800/60 overflow-hidden">
              <div
                onClick={() => toggleNode('walls')}
                className="flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-800/50 cursor-pointer font-bold text-slate-200"
              >
                <div className="flex items-center gap-1.5">
                  {openTreeNodes.walls ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <span>🧱 Walls & Partitions</span>
                </div>
                <Eye size={12} className={layers.structure ? 'text-cyan-400' : 'text-slate-600'} onClick={(e) => { e.stopPropagation(); setLayers(l => ({ ...l, structure: !l.structure })); }} />
              </div>

              {openTreeNodes.walls && (
                <div className="pl-4 pr-1 py-1 space-y-0.5 border-t border-slate-800/40 text-[11.5px]">
                  {/* External Walls */}
                  <div
                    onClick={() => { setActiveCategory('External Walls 450mm'); setActiveTool('LENGTH'); }}
                    className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer transition-colors ${
                      activeCategory === 'External Walls 450mm' ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/50' : 'hover:bg-slate-800/40 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-cyan-400" />
                      <span>External 450 mm</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">Linear</span>
                  </div>

                  {/* Internal Walls Sub-Tree */}
                  <div className="pt-0.5">
                    <div onClick={() => toggleNode('internalWalls')} className="flex items-center gap-1 px-2 py-0.5 text-slate-400 font-semibold cursor-pointer hover:text-slate-200">
                      {openTreeNodes.internalWalls ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      <span>Internal Partitions</span>
                    </div>
                    {openTreeNodes.internalWalls && (
                      <div className="pl-3 space-y-0.5 mt-0.5">
                        {[
                          { name: 'Internal Walls 300mm', color: '#10b981' },
                          { name: 'Internal Walls 150mm', color: '#f59e0b' },
                          { name: 'Internal Walls 125mm', color: '#a855f7' },
                        ].map((w) => (
                          <div
                            key={w.name}
                            onClick={() => { setActiveCategory(w.name); setActiveTool('LENGTH'); }}
                            className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer ${
                              activeCategory === w.name ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/50' : 'hover:bg-slate-800/40 text-slate-400'
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full" style={{ background: w.color }} />
                              <span>{w.name.replace('Internal Walls ', '')}</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-500">Wall</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Category Node: Openings (Doors & Windows) */}
            <div className="rounded-lg bg-slate-900/40 border border-slate-800/60 overflow-hidden">
              <div onClick={() => toggleNode('openings')} className="flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-800/50 cursor-pointer font-bold text-slate-200">
                <div className="flex items-center gap-1.5">
                  {openTreeNodes.openings ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <span>🚪 Doors & Windows</span>
                </div>
                <Eye size={12} className={layers.openings ? 'text-amber-400' : 'text-slate-600'} onClick={(e) => { e.stopPropagation(); setLayers(l => ({ ...l, openings: !l.openings })); }} />
              </div>
              {openTreeNodes.openings && (
                <div className="pl-4 pr-1 py-1 space-y-0.5 border-t border-slate-800/40 text-[11.5px]">
                  <div onClick={() => { setActiveCategory('Timber Doors D1'); setActiveTool('COUNT'); }} className="flex items-center justify-between px-2 py-1 rounded cursor-pointer hover:bg-slate-800/40 text-amber-300">
                    <span>Timber Doors D1</span>
                    <span className="text-[10px] font-mono">1.98 m²</span>
                  </div>
                  <div onClick={() => { setActiveCategory('Aluminum Windows W1'); setActiveTool('COUNT'); }} className="flex items-center justify-between px-2 py-1 rounded cursor-pointer hover:bg-slate-800/40 text-cyan-300">
                    <span>Glazed Windows W1</span>
                    <span className="text-[10px] font-mono">2 pcs</span>
                  </div>
                </div>
              )}
            </div>

            {/* Category Node: Rooms & Spaces */}
            <div className="rounded-lg bg-slate-900/40 border border-slate-800/60 overflow-hidden">
              <div onClick={() => toggleNode('spaces')} className="flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-800/50 cursor-pointer font-bold text-slate-200">
                <div className="flex items-center gap-1.5">
                  {openTreeNodes.spaces ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <span>🏠 Rooms & Floor Spaces</span>
                </div>
                <Eye size={12} className={layers.rooms ? 'text-purple-400' : 'text-slate-600'} onClick={(e) => { e.stopPropagation(); setLayers(l => ({ ...l, rooms: !l.rooms })); }} />
              </div>
              {openTreeNodes.spaces && (
                <div className="pl-4 pr-1 py-1 space-y-0.5 border-t border-slate-800/40 text-[11.5px]">
                  {elements.filter(el => el.category === 'ROOM').map(r => (
                    <div key={r.id} onClick={() => onSelectElement(r)} className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer ${selectedElement?.id === r.id ? 'bg-purple-950/80 text-purple-300 border border-purple-800/50' : 'hover:bg-slate-800/40 text-slate-300'}`}>
                      <span className="truncate">{r.name}</span>
                      <span className="text-[10px] font-mono font-bold text-purple-300">{r.area} m²</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Blueprint Canvas Viewport ── */}
        <div
          className={`flex-1 relative overflow-hidden bg-[#070a10] flex items-center justify-center ${
            activeTool === 'SELECT' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
          }`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Active Drawing Tool Guidance Banner */}
          {activeTool !== 'SELECT' && (
            <div className="absolute top-3 left-3 right-3 z-30 bg-[#0d1522]/95 border border-cyan-500/40 rounded-lg px-4 py-2 flex items-center justify-between text-xs text-cyan-300 shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-cyan-400 animate-pulse" />
                <span>
                  Active Category: <strong className="text-white underline">{activeCategory}</strong> —{' '}
                  {activeTool === 'AREA' && 'Click points to draw area polygon space.'}
                  {activeTool === 'LENGTH' && 'Click points on walls to draw line segments.'}
                  {activeTool === 'COUNT' && 'Click anywhere on drawing to place count pins.'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {currentPoints.length > 0 && (
                  <>
                    <button onClick={removeLastPoint} className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 text-slate-300 hover:text-white text-[11px]">
                      <Undo size={11} /> Undo Point
                    </button>
                    <button onClick={finishMeasurement} className="flex items-center gap-1 px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md">
                      <CheckCircle size={12} /> Complete {activeTool === 'AREA' ? 'Polygon' : 'Line'}
                    </button>
                  </>
                )}
                <button onClick={() => { setActiveTool('SELECT'); setCurrentPoints([]); setCursorPos(null); }} className="text-slate-400 hover:text-white p-1">
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Canvas Viewports Container */}
          {canvasDisplayMode === 'SPLIT' ? (
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
              }}
              className="flex items-center gap-4 transition-transform duration-75 ease-out"
            >
              {/* Left Viewport: Original Uploaded PNG Image */}
              <div className="relative w-[560px] h-[580px] rounded-xl overflow-hidden border border-slate-700 bg-slate-950 shadow-2xl flex flex-col">
                <div className="bg-slate-900/90 px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300 font-medium z-10">
                  <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                    <ImageIcon size={13} />
                    <span>Original Floor Plan (Uploaded Input PNG)</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">{drawing.fileName}</span>
                </div>
                <div className="flex-1 relative overflow-hidden bg-slate-950 flex items-center justify-center p-2">
                  <img
                    src={sampleImage}
                    alt="Original Input Drawing PNG"
                    className="w-full h-full object-contain rounded select-none"
                    draggable={false}
                  />
                </div>
              </div>

              {/* Right Viewport: AI Takeoff CAD Vector Schematic */}
              <div className="relative w-[560px] h-[580px] rounded-xl overflow-hidden border border-cyan-500/50 bg-slate-950 shadow-2xl flex flex-col">
                <div className="bg-cyan-950/90 px-3 py-1.5 border-b border-cyan-800/60 flex items-center justify-between text-xs text-cyan-200 font-medium z-10">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Square size={13} className="text-cyan-400" />
                    <span>AI Spatial Takeoff (Detected CAD Vector)</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-900/60 text-cyan-300 border border-cyan-700/50">
                    {elements.length} Spatial Elements
                  </span>
                </div>

                <div className="flex-1 relative overflow-hidden bg-[#070a10] flex items-center justify-center">
                  <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
                    <defs>
                      <pattern id="canvasGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="0.8" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#canvasGrid)" />
                  </svg>
                  <img
                    src={sampleImage}
                    alt={drawing.fileName}
                    className="w-full h-full object-contain select-none filter invert hue-rotate-180 contrast-150 brightness-90 opacity-90"
                  />

                  <svg
                    ref={svgRef}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                    viewBox="0 0 1000 1000"
                    preserveAspectRatio="none"
                    onClick={handleSvgClick}
                  >
                    {/* ── Real CAD Element Rendering ─────────────────────── */}
                    {elements.map(el => {
                      if (el.category === 'ROOM' && !layers.rooms) return null;
                      if ((el.category === 'COLUMN' || el.category === 'BEAM' || el.category === 'SLAB') && !layers.structure) return null;
                      if ((el.category === 'DOOR' || el.category === 'WINDOW') && !layers.openings) return null;

                      const isSelected = selectedElement?.id === el.id;
                      const c = getElementColors(el, isSelected);
                      const handleClick = (e: React.MouseEvent) => {
                        if (activeTool !== 'SELECT') return;
                        e.stopPropagation();
                        onSelectElement(isSelected ? null : el);
                      };

                      // ── WALL — rendered as thick polyline ────────────────
                      if (el.category === 'WALL' && el.wallSegment) {
                        const { p1, p2, thicknessPx = 6 } = el.wallSegment;
                        return (
                          <g key={el.id} className="cursor-pointer" onClick={handleClick}>
                            <line
                              x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                              stroke={isSelected ? '#38bdf8' : '#cbd5e1'}
                              strokeWidth={isSelected ? thicknessPx + 2 : thicknessPx}
                              strokeLinecap="round"
                            />
                          </g>
                        );
                      }

                      // ── ROOM — rendered as actual polygon (real shape) ───
                      if (el.category === 'ROOM' && el.polygon && el.polygon.length >= 3) {
                        const pts = el.polygon.map((p: any) => `${p.x},${p.y}`).join(' ');
                        const cx = el.polygon.reduce((s: number, p: any) => s + p.x, 0) / el.polygon.length;
                        const cy = el.polygon.reduce((s: number, p: any) => s + p.y, 0) / el.polygon.length;
                        const labelColor = ROOM_COLORS[el.id]?.label || '#c4b5fd';
                        return (
                          <g key={el.id} className="cursor-pointer" onClick={handleClick}>
                            <polygon
                              points={pts}
                              fill={c.fill}
                              stroke={c.stroke}
                              strokeWidth={isSelected ? 2.5 : 1.5}
                              strokeDasharray={isSelected ? '6 3' : 'none'}
                            />
                            <text x={cx} y={cy - 8} fill={labelColor} fontSize={16} fontWeight="700"
                              textAnchor="middle" pointerEvents="none" fontFamily="Inter, sans-serif">{el.name}</text>
                            {el.area !== undefined && (
                              <text x={cx} y={cy + 12} fill={labelColor} fontSize={12}
                                textAnchor="middle" pointerEvents="none" opacity={0.85}
                                fontFamily="JetBrains Mono, monospace">{el.area} m²</text>
                            )}
                          </g>
                        );
                      }

                      // ── DOOR — rendered as arc + line (door swing) ───────
                      if (el.category === 'DOOR' && el.arcData) {
                        const { cx, cy, r, startAngle, endAngle } = el.arcData;
                        const rad = (deg: number) => (deg * Math.PI) / 180;
                        const x1 = cx + r * Math.cos(rad(startAngle));
                        const y1 = cy - r * Math.sin(rad(startAngle));
                        const x2 = cx + r * Math.cos(rad(endAngle));
                        const y2 = cy - r * Math.sin(rad(endAngle));
                        const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
                        return (
                          <g key={el.id} className="cursor-pointer" onClick={handleClick}>
                            {/* Door leaf line */}
                            <line x1={cx} y1={cy} x2={x1} y2={y1}
                              stroke="#f59e0b" strokeWidth={isSelected ? 3 : 2} strokeLinecap="round" />
                            {/* Door swing arc */}
                            <path
                              d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 0 ${x2} ${y2}`}
                              fill="none" stroke="#f59e0b"
                              strokeWidth={isSelected ? 2 : 1.5}
                              strokeDasharray="5 3" opacity={0.8}
                            />
                          </g>
                        );
                      }

                      // ── WINDOW — rendered as segmented line ──────────────
                      if (el.category === 'WINDOW' && el.lineData) {
                        const { x1, y1, x2, y2 } = el.lineData;
                        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
                        const dx = x2 - x1, dy = y2 - y1;
                        const len = Math.sqrt(dx * dx + dy * dy);
                        const nx = (-dy / len) * 5, ny = (dx / len) * 5;
                        return (
                          <g key={el.id} className="cursor-pointer" onClick={handleClick}>
                            <line x1={x1} y1={y1} x2={x2} y2={y2}
                              stroke="#06b6d4" strokeWidth={isSelected ? 4 : 3} />
                            <line x1={mx - nx} y1={my - ny} x2={mx + nx} y2={my + ny}
                              stroke="#06b6d4" strokeWidth={1.5} />
                          </g>
                        );
                      }

                      // ── COLUMN — rendered as filled rectangle or circle ──
                      if (el.category === 'COLUMN') {
                        if (!el.box_2d || el.box_2d.length < 4) return null;
                        const [ymin, xmin, ymax, xmax] = el.box_2d;
                        const cxc = (xmin + xmax) / 2, cyc = (ymin + ymax) / 2;
                        const w = xmax - xmin, h = ymax - ymin;
                        return (
                          <g key={el.id} className="cursor-pointer" onClick={handleClick}>
                            <rect x={xmin} y={ymin} width={w} height={h}
                              fill={isSelected ? 'rgba(239,68,68,0.7)' : 'rgba(239,68,68,0.5)'}
                              stroke="#ef4444" strokeWidth={isSelected ? 2.5 : 1.5} />
                            <text x={cxc} y={cyc + 4} fill="#ffffff" fontSize={9}
                              textAnchor="middle" fontWeight="800" pointerEvents="none">C</text>
                          </g>
                        );
                      }

                      // ── FALLBACK — bounding box (for legacy data) ────────
                      if (el.box_2d && el.box_2d.length >= 4) {
                        const [ymin, xmin, ymax, xmax] = el.box_2d;
                        const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
                        const labelColor = ROOM_COLORS[el.id]?.label || '#c4b5fd';
                        return (
                          <g key={el.id} className="cursor-pointer" onClick={handleClick}>
                            <rect x={xmin} y={ymin} width={xmax - xmin} height={ymax - ymin}
                              fill={c.fill} stroke={c.stroke}
                              strokeWidth={isSelected ? 3 : 1.5}
                              strokeDasharray={isSelected ? '6 3' : 'none'}
                              rx={el.category === 'ROOM' ? 4 : 2} />
                            {el.category === 'ROOM' && (
                              <>
                                <text x={cx} y={cy - 6} fill={labelColor} fontSize={17} fontWeight="700"
                                  textAnchor="middle" pointerEvents="none">{el.name}</text>
                                {el.area !== undefined && (
                                  <text x={cx} y={cy + 14} fill={labelColor} fontSize={13}
                                    textAnchor="middle" pointerEvents="none" opacity={0.85}>{el.area} m²</text>
                                )}
                              </>
                            )}
                          </g>
                        );
                      }

                      return null;
                    })}


                    {/* Saved Manual Measurements Overlay */}
                    {layers.manual && manualMeasurements.map(m => {
                      const isSelected = selectedElement?.id === m.id;
                      if (m.type === 'AREA' && m.points.length >= 3) {
                        return (
                          <g key={m.id} className="cursor-pointer" onClick={e => { e.stopPropagation(); onSelectElement(m); }}>
                            <polygon points={m.points.map(p => p.join(',')).join(' ')} fill={isSelected ? 'rgba(6,182,212,0.45)' : 'rgba(6,182,212,0.25)'} stroke={m.color} strokeWidth={2.5} />
                            <text x={m.points[0][0]} y={m.points[0][1] - 6} fill="#6ee7b7" fontSize={13} fontWeight="700" fontFamily="Inter, sans-serif">{m.name} ({m.value}m²)</text>
                          </g>
                        );
                      }
                      if (m.type === 'LENGTH' && m.points.length >= 2) {
                        return (
                          <g key={m.id} className="cursor-pointer" onClick={e => { e.stopPropagation(); onSelectElement(m); }}>
                            <polyline points={m.points.map(p => p.join(',')).join(' ')} fill="none" stroke={m.color} strokeWidth={isSelected ? 4 : 3} strokeLinecap="round" />
                            <text x={m.points[0][0]} y={m.points[0][1] - 6} fill="#fcd34d" fontSize={13} fontWeight="700">{m.name} ({m.value}m)</text>
                          </g>
                        );
                      }
                      if (m.type === 'COUNT' && m.points.length > 0) {
                        const [px, py] = m.points[0];
                        return (
                          <g key={m.id} className="cursor-pointer" onClick={e => { e.stopPropagation(); onSelectElement(m); }}>
                            <circle cx={px} cy={py} r={11} fill="#a855f7" stroke="#fff" strokeWidth={1.5} />
                            <text x={px} y={py + 4} fill="#fff" fontSize={10} fontWeight="800" textAnchor="middle">#</text>
                          </g>
                        );
                      }
                      return null;
                    })}

                    {/* Active Live In-Progress CAD Drawing Rubber-Band */}
                    {currentPoints.length > 0 && (
                      <g>
                        {activeTool === 'AREA' && currentPoints.length >= 2 && (
                          <polygon
                            points={currentPoints.map(p => p.join(',')).join(' ')}
                            fill="rgba(6,182,212,0.2)"
                            stroke="#06b6d4"
                            strokeWidth={2}
                            strokeDasharray="4 2"
                          />
                        )}

                        {activeTool === 'LENGTH' && currentPoints.length >= 2 && (
                          <polyline
                            points={currentPoints.map(p => p.join(',')).join(' ')}
                            fill="none"
                            stroke={activeTool === 'AREA' ? '#06b6d4' : '#10b981'}
                            strokeWidth={3}
                          />
                        )}

                        {cursorPos && (
                          <line
                            x1={currentPoints[currentPoints.length - 1][0]}
                            y1={currentPoints[currentPoints.length - 1][1]}
                            x2={cursorPos[0]}
                            y2={cursorPos[1]}
                            stroke="#38bdf8"
                            strokeWidth={2}
                            strokeDasharray="3 3"
                          />
                        )}

                        {currentPoints.map(([px, py], i) => (
                          <g key={i}>
                            <circle cx={px} cy={py} r={5} fill="#06b6d4" stroke="#ffffff" strokeWidth={2} />
                            <text x={px + 8} y={py - 4} fill="#6ee7b7" fontSize={11} fontWeight="700" pointerEvents="none">P{i + 1}</text>
                          </g>
                        ))}
                      </g>
                    )}

                    {COLLABORATORS.map(col => (
                      <g key={col.id} style={{ pointerEvents: 'none' }}>
                        <polygon points={`${col.x},${col.y} ${col.x + 12},${col.y + 16} ${col.x + 4},${col.y + 14}`} fill={col.color} />
                        <rect x={col.x + 8} y={col.y + 14} width={100} height={18} rx={3} fill={col.color} />
                        <text x={col.x + 14} y={col.y + 27} fill="#ffffff" fontSize={10} fontWeight="700">{col.name}</text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>
            </div>
          ) : canvasDisplayMode === 'ORIGINAL_IMAGE' ? (
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                width: 950,
                height: 630,
              }}
              className="rounded overflow-hidden shadow-2xl border border-slate-700 bg-slate-950 flex items-center justify-center p-2 relative"
            >
              <div className="absolute top-2 left-2 z-10 bg-slate-900/90 text-cyan-400 px-3 py-1 rounded text-xs font-bold border border-slate-700">
                Original Input PNG Drawing Sheet
              </div>
              <img
                src={sampleImage}
                alt="Original Uploaded Floor Plan PNG"
                className="max-w-full max-h-full object-contain rounded select-none"
                draggable={false}
              />
            </div>
          ) : (
            /* Single AI Takeoff Sheet Mode */
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                position: 'relative',
                width: 950,
                height: 630,
              }}
              className="rounded overflow-hidden shadow-2xl border border-cyan-900/50 relative"
            >
              <div className="absolute inset-0 bg-[#070a10] flex items-center justify-center overflow-hidden">
                <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
                  <rect width="100%" height="100%" fill="url(#canvasGrid)" />
                </svg>
                {sampleImage && (
                  <img
                    src={sampleImage}
                    alt={drawing.fileName}
                    className="w-full h-full object-contain select-none filter invert hue-rotate-180 contrast-150 brightness-90 opacity-90"
                  />
                )}
              </div>

              <svg
                ref={svgRef}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                onClick={handleSvgClick}
              >
                {/* ── Real CAD Element Rendering ─────────────────────── */}
                {elements.map(el => {
                  if (el.category === 'ROOM' && !layers.rooms) return null;
                  if ((el.category === 'COLUMN' || el.category === 'BEAM' || el.category === 'SLAB') && !layers.structure) return null;
                  if ((el.category === 'DOOR' || el.category === 'WINDOW') && !layers.openings) return null;

                  const isSelected = selectedElement?.id === el.id;
                  const c = getElementColors(el, isSelected);
                  const handleClick = (e: React.MouseEvent) => {
                    if (activeTool !== 'SELECT') return;
                    e.stopPropagation();
                    onSelectElement(isSelected ? null : el);
                  };

                  if (el.category === 'WALL' && el.wallSegment) {
                    const { p1, p2, thicknessPx = 6 } = el.wallSegment;
                    return (
                      <g key={el.id} className="cursor-pointer" onClick={handleClick}>
                        <line
                          x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                          stroke={isSelected ? '#38bdf8' : '#cbd5e1'}
                          strokeWidth={isSelected ? thicknessPx + 2 : thicknessPx}
                          strokeLinecap="round"
                        />
                      </g>
                    );
                  }

                  if (el.category === 'ROOM' && el.polygon && el.polygon.length >= 3) {
                    const pts = el.polygon.map((p: any) => `${p.x},${p.y}`).join(' ');
                    const cx = el.polygon.reduce((s: number, p: any) => s + p.x, 0) / el.polygon.length;
                    const cy = el.polygon.reduce((s: number, p: any) => s + p.y, 0) / el.polygon.length;
                    const labelColor = ROOM_COLORS[el.id]?.label || '#c4b5fd';
                    return (
                      <g key={el.id} className="cursor-pointer" onClick={handleClick}>
                        <polygon
                          points={pts}
                          fill={c.fill}
                          stroke={c.stroke}
                          strokeWidth={isSelected ? 2.5 : 1.5}
                          strokeDasharray={isSelected ? '6 3' : 'none'}
                        />
                        <text x={cx} y={cy - 8} fill={labelColor} fontSize={16} fontWeight="700"
                          textAnchor="middle" pointerEvents="none" fontFamily="Inter, sans-serif">{el.name}</text>
                        {el.area !== undefined && (
                          <text x={cx} y={cy + 12} fill={labelColor} fontSize={12}
                            textAnchor="middle" pointerEvents="none" opacity={0.85}
                            fontFamily="JetBrains Mono, monospace">{el.area} m²</text>
                        )}
                      </g>
                    );
                  }

                  if (el.category === 'DOOR' && el.arcData) {
                    const { cx, cy, r, startAngle, endAngle } = el.arcData;
                    const rad = (deg: number) => (deg * Math.PI) / 180;
                    const x1 = cx + r * Math.cos(rad(startAngle));
                    const y1 = cy - r * Math.sin(rad(startAngle));
                    const x2 = cx + r * Math.cos(rad(endAngle));
                    const y2 = cy - r * Math.sin(rad(endAngle));
                    const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
                    return (
                      <g key={el.id} className="cursor-pointer" onClick={handleClick}>
                        <line x1={cx} y1={cy} x2={x1} y2={y1}
                          stroke="#f59e0b" strokeWidth={isSelected ? 3 : 2} strokeLinecap="round" />
                        <path
                          d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 0 ${x2} ${y2}`}
                          fill="none" stroke="#f59e0b"
                          strokeWidth={isSelected ? 2 : 1.5}
                          strokeDasharray="5 3" opacity={0.8}
                        />
                      </g>
                    );
                  }

                  if (el.category === 'WINDOW' && el.lineData) {
                    const { x1, y1, x2, y2 } = el.lineData;
                    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
                    const dx = x2 - x1, dy = y2 - y1;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    const nx = (-dy / len) * 5, ny = (dx / len) * 5;
                    return (
                      <g key={el.id} className="cursor-pointer" onClick={handleClick}>
                        <line x1={x1} y1={y1} x2={x2} y2={y2}
                          stroke="#06b6d4" strokeWidth={isSelected ? 4 : 3} />
                        <line x1={mx - nx} y1={my - ny} x2={mx + nx} y2={my + ny}
                          stroke="#06b6d4" strokeWidth={1.5} />
                      </g>
                    );
                  }

                  if (el.category === 'COLUMN') {
                    if (!el.box_2d || el.box_2d.length < 4) return null;
                    const [ymin, xmin, ymax, xmax] = el.box_2d;
                    const cxc = (xmin + xmax) / 2, cyc = (ymin + ymax) / 2;
                    const w = xmax - xmin, h = ymax - ymin;
                    return (
                      <g key={el.id} className="cursor-pointer" onClick={handleClick}>
                        <rect x={xmin} y={ymin} width={w} height={h}
                          fill={isSelected ? 'rgba(239,68,68,0.7)' : 'rgba(239,68,68,0.5)'}
                          stroke="#ef4444" strokeWidth={isSelected ? 2.5 : 1.5} />
                        <text x={cxc} y={cyc + 4} fill="#ffffff" fontSize={9}
                          textAnchor="middle" fontWeight="800" pointerEvents="none">C</text>
                      </g>
                    );
                  }

                  if (el.box_2d && el.box_2d.length >= 4) {
                    const [ymin, xmin, ymax, xmax] = el.box_2d;
                    const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
                    const labelColor = ROOM_COLORS[el.id]?.label || '#c4b5fd';
                    return (
                      <g key={el.id} className="cursor-pointer" onClick={handleClick}>
                        <rect x={xmin} y={ymin} width={xmax - xmin} height={ymax - ymin}
                          fill={c.fill} stroke={c.stroke}
                          strokeWidth={isSelected ? 3 : 1.5}
                          strokeDasharray={isSelected ? '6 3' : 'none'}
                          rx={el.category === 'ROOM' ? 4 : 2} />
                        {el.category === 'ROOM' && (
                          <>
                            <text x={cx} y={cy - 6} fill={labelColor} fontSize={17} fontWeight="700"
                              textAnchor="middle" pointerEvents="none">{el.name}</text>
                            {el.area !== undefined && (
                              <text x={cx} y={cy + 14} fill={labelColor} fontSize={13}
                                textAnchor="middle" pointerEvents="none" opacity={0.85}>{el.area} m²</text>
                            )}
                          </>
                        )}
                      </g>
                    );
                  }

                  return null;
                })}

                {layers.manual && manualMeasurements.map(m => {
                  const isSelected = selectedElement?.id === m.id;
                  if (m.type === 'AREA' && m.points.length >= 3) {
                    return (
                      <g key={m.id} className="cursor-pointer" onClick={e => { e.stopPropagation(); onSelectElement(m); }}>
                        <polygon points={m.points.map(p => p.join(',')).join(' ')} fill={isSelected ? 'rgba(6,182,212,0.45)' : 'rgba(6,182,212,0.25)'} stroke={m.color} strokeWidth={2.5} />
                        <text x={m.points[0][0]} y={m.points[0][1] - 6} fill="#6ee7b7" fontSize={13} fontWeight="700" fontFamily="Inter, sans-serif">{m.name} ({m.value}m²)</text>
                      </g>
                    );
                  }
                  if (m.type === 'LENGTH' && m.points.length >= 2) {
                    return (
                      <g key={m.id} className="cursor-pointer" onClick={e => { e.stopPropagation(); onSelectElement(m); }}>
                        <polyline points={m.points.map(p => p.join(',')).join(' ')} fill="none" stroke={m.color} strokeWidth={isSelected ? 4 : 3} strokeLinecap="round" />
                        <text x={m.points[0][0]} y={m.points[0][1] - 6} fill="#fcd34d" fontSize={13} fontWeight="700">{m.name} ({m.value}m)</text>
                      </g>
                    );
                  }
                  if (m.type === 'COUNT' && m.points.length > 0) {
                    const [px, py] = m.points[0];
                    return (
                      <g key={m.id} className="cursor-pointer" onClick={e => { e.stopPropagation(); onSelectElement(m); }}>
                        <circle cx={px} cy={py} r={11} fill="#a855f7" stroke="#fff" strokeWidth={1.5} />
                        <text x={px} y={py + 4} fill="#fff" fontSize={10} fontWeight="800" textAnchor="middle">#</text>
                      </g>
                    );
                  }
                  return null;
                })}

                {currentPoints.length > 0 && (
                  <g>
                    {activeTool === 'AREA' && currentPoints.length >= 2 && (
                      <polygon
                        points={currentPoints.map(p => p.join(',')).join(' ')}
                        fill="rgba(6,182,212,0.2)"
                        stroke="#06b6d4"
                        strokeWidth={2}
                        strokeDasharray="4 2"
                      />
                    )}

                    {activeTool === 'LENGTH' && currentPoints.length >= 2 && (
                      <polyline
                        points={currentPoints.map(p => p.join(',')).join(' ')}
                        fill="none"
                        stroke={activeTool === 'AREA' ? '#06b6d4' : '#10b981'}
                        strokeWidth={3}
                      />
                    )}

                    {cursorPos && (
                      <line
                        x1={currentPoints[currentPoints.length - 1][0]}
                        y1={currentPoints[currentPoints.length - 1][1]}
                        x2={cursorPos[0]}
                        y2={cursorPos[1]}
                        stroke="#38bdf8"
                        strokeWidth={2}
                        strokeDasharray="3 3"
                      />
                    )}

                    {currentPoints.map(([px, py], i) => (
                      <g key={i}>
                        <circle cx={px} cy={py} r={5} fill="#06b6d4" stroke="#ffffff" strokeWidth={2} />
                        <text x={px + 8} y={py - 4} fill="#6ee7b7" fontSize={11} fontWeight="700" pointerEvents="none">P{i + 1}</text>
                      </g>
                    ))}
                  </g>
                )}

                {COLLABORATORS.map(col => (
                  <g key={col.id} style={{ pointerEvents: 'none' }}>
                    <polygon points={`${col.x},${col.y} ${col.x + 12},${col.y + 16} ${col.x + 4},${col.y + 14}`} fill={col.color} />
                    <rect x={col.x + 8} y={col.y + 14} width={100} height={18} rx={3} fill={col.color} />
                    <text x={col.x + 14} y={col.y + 27} fill="#ffffff" fontSize={10} fontWeight="700">{col.name}</text>
                  </g>
                ))}
              </svg>
            </div>
          )}

            {/* Live Cursor Coordinate & Dimension Badge */}
            {cursorPos && activeTool !== 'SELECT' && (
              <div
                className="absolute pointer-events-none bg-[#090d16]/90 border border-cyan-500/50 px-2 py-1 rounded text-[11px] font-mono text-cyan-300 shadow-xl z-30"
                style={{
                  left: `${(cursorPos[0] / 1000) * 100}%`,
                  top: `${(cursorPos[1] / 1000) * 100}%`,
                  transform: 'translate(12px, 12px)',
                }}
              >
                {activeTool === 'LENGTH' && currentPoints.length > 0 && (
                  <div>Segment: {calcSegmentDistance(currentPoints[currentPoints.length - 1], cursorPos)} m</div>
                )}
                {activeTool === 'AREA' && currentPoints.length >= 2 && (
                  <div>Area: {calcCurrentArea([...currentPoints, cursorPos])} m²</div>
                )}
                <div className="text-[9px] text-slate-400">X: {cursorPos[0]}, Y: {cursorPos[1]}</div>
              </div>
            )}
          </div>

        {/* ── Right Panel: Inspector & BOQ Cost Table ── */}
        <div className="w-80 bg-[#0e1420] border-l border-slate-800/80 flex flex-col flex-shrink-0 z-20">
          <div className="flex border-b border-slate-800/80 bg-[#111724]">
            {(['takeoff', 'boq'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                  activeTab === tab
                    ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-900/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab === 'takeoff' ? 'Element Details' : 'Cost BOQ Schedule'}
              </button>
            ))}
          </div>

          {activeTab === 'takeoff' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {selectedElement ? (
                <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-800/60 text-xs">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-bold text-white text-sm">{selectedElement.name}</div>
                      <div className="text-[10px] text-cyan-400 font-mono uppercase">{selectedElement.category}</div>
                    </div>
                    <button onClick={() => onSelectElement(null)} className="text-slate-400 hover:text-white"><X size={14} /></button>
                  </div>
                  {'area' in selectedElement && selectedElement.area !== undefined && (
                    <div className="grid grid-cols-2 gap-2 my-2">
                      <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                        <div className="text-[10px] text-slate-400 uppercase">Surface Area</div>
                        <div className="text-sm font-bold text-cyan-300 font-mono">{selectedElement.area} m²</div>
                      </div>
                      {'perimeter' in selectedElement && selectedElement.perimeter && (
                        <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                          <div className="text-[10px] text-slate-400 uppercase">Perimeter</div>
                          <div className="text-sm font-bold text-emerald-400 font-mono">{selectedElement.perimeter} m</div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-cyan-900/50">
                    <span className="text-slate-300 font-semibold">Unit Rate ($):</span>
                    <input
                      type="number"
                      value={selectedElement.unitPrice || 0}
                      onChange={e => onUpdateUnitPrice(selectedElement.id, +e.target.value)}
                      className="w-24 bg-slate-900 border border-slate-700 rounded text-right px-2 py-1 text-emerald-400 font-mono font-bold outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-slate-500 text-xs">
                  <MousePointer size={24} className="mx-auto mb-2 opacity-30" />
                  <p>Click any wall line or room space on the canvas to inspect geometry and unit rates</p>
                </div>
              )}

              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                Takeoff Layers ({elements.length})
              </div>
              <div className="space-y-1">
                {elements.map(el => (
                  <div
                    key={el.id}
                    onClick={() => onSelectElement(el)}
                    className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors text-xs ${
                      selectedElement?.id === el.id ? 'bg-cyan-950 text-cyan-200 border border-cyan-800' : 'hover:bg-slate-900 text-slate-300'
                    }`}
                  >
                    <span className="truncate">{el.name}</span>
                    {el.area && <span className="font-mono text-cyan-400 text-[11px] font-bold">{el.area} m²</span>}
                    {el.volume && <span className="font-mono text-blue-400 text-[11px] font-bold">{el.volume} m³</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'boq' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
              <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-bold">Estimated Takeoff Total</div>
                <div className="text-2xl font-extrabold font-mono text-white mt-1">
                  ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>

              {quantities.map((q, i) => (
                <div key={q.id || i} className="p-2.5 rounded bg-slate-900/60 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 truncate">{q.name}</span>
                    {q.isManual && <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-950 text-purple-300 font-bold border border-purple-800">Custom</span>}
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-cyan-400 font-bold">{q.quantity.toFixed(2)} {q.unit}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500">@ $</span>
                      <input
                        type="number"
                        value={q.unitPrice || 0}
                        onChange={e => q.id && onUpdateUnitPrice(q.id, +e.target.value)}
                        className="w-16 bg-slate-950 border border-slate-700 rounded text-right px-1 font-mono text-emerald-400 outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

