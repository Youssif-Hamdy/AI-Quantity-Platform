import React from 'react';
import { X, Ruler, Box, Layers, DollarSign, Calculator } from 'lucide-react';
import type { SpatialElement, ManualMeasurement } from '../types';

interface InspectorDrawerProps {
  element: SpatialElement | ManualMeasurement | null;
  onClose: () => void;
  onUpdateUnitPrice?: (itemId: string, newPrice: number) => void;
}

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({
  element,
  onClose,
  onUpdateUnitPrice,
}) => {
  if (!element) return null;

  const isManual = 'points' in element;
  const area = 'area' in element ? element.area : ('type' in element && element.type === 'AREA') ? element.value : undefined;
  const perimeter = 'perimeter' in element ? element.perimeter : ('type' in element && element.type === 'LENGTH') ? element.value : undefined;
  const volume = 'volume' in element ? element.volume : undefined;
  const unitPrice = element.unitPrice || 250;

  const estimatedTotal =
    area !== undefined
      ? area * unitPrice
      : perimeter !== undefined
      ? perimeter * unitPrice
      : unitPrice;

  return (
    <div className="glass-panel w-full lg:w-96 p-6 border-l border-slate-800 flex flex-col justify-between h-[700px] overflow-y-auto">
      <div>
        {/* Header Title */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                {element.name}
              </h3>
              <p className="text-[10px] text-cyan-400 font-mono font-semibold uppercase">
                {element.category} {isManual ? '(MANUAL TAKEOFF)' : '(AI DETECTED)'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Geometry & Measurements */}
        <div className="space-y-4">
          <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Ruler className="w-3.5 h-3.5 text-cyan-400" />
            <span>Extracted Geometry & Quantity Takeoff</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {area !== undefined && (
              <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-semibold">Surface Area</span>
                <span className="text-lg font-bold text-cyan-400 font-mono">
                  {area.toFixed(2)}
                </span>
                <span className="text-xs text-slate-400 ml-1">m²</span>
              </div>
            )}

            {perimeter !== undefined && (
              <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-semibold">Perimeter / Length</span>
                <span className="text-lg font-bold text-emerald-400 font-mono">
                  {perimeter.toFixed(2)}
                </span>
                <span className="text-xs text-slate-400 ml-1">m</span>
              </div>
            )}

            {volume !== undefined && (
              <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 col-span-2">
                <span className="text-[10px] text-slate-400 block font-semibold">Concrete Volume</span>
                <span className="text-xl font-bold text-blue-400 font-mono">
                  {volume.toFixed(3)}
                </span>
                <span className="text-xs text-slate-400 ml-1">m³</span>
              </div>
            )}
          </div>

          {/* Rate & Cost Estimation Section */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/90 space-y-3">
            <div className="text-xs font-semibold text-slate-200 pb-2 border-b border-slate-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span>Unit Cost Estimation</span>
              </span>
              <Calculator className="w-3.5 h-3.5 text-slate-500" />
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Unit Price ($):</span>
              <input
                type="number"
                value={unitPrice}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  if (onUpdateUnitPrice) onUpdateUnitPrice(element.id, val);
                }}
                className="w-24 px-2 py-1 bg-slate-950 border border-slate-800 rounded text-right text-emerald-400 font-mono font-bold"
              />
            </div>

            <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-800">
              <span className="text-slate-300 font-semibold">Calculated Total Line:</span>
              <span className="font-bold text-white font-mono text-sm">
                ${estimatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Derived Quantities / Wall Deductions */}
          {'walls_area' in element && element.walls_area !== undefined && (
            <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/80 space-y-2 text-xs">
              <div className="font-semibold text-slate-300 flex items-center gap-1.5 mb-2">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>Derived Wall Quantities</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Wall Plastering / Paint:</span>
                <span className="font-mono text-slate-200 font-bold">
                  {element.walls_area.toFixed(2)} m²
                </span>
              </div>
              {element.doors_count !== undefined && (
                <div className="flex justify-between text-slate-400">
                  <span>Openings (Doors):</span>
                  <span className="font-mono text-amber-400 font-bold">
                    {element.doors_count} pcs
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-800">
        <button onClick={onClose} className="btn btn-secondary w-full text-xs">
          Close Inspector
        </button>
      </div>
    </div>
  );
};
