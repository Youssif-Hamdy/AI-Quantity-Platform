import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Search,
  Filter,
  DollarSign,
  Box,
  Layers,
  TrendingUp,
} from 'lucide-react';
import type { QuantityItem } from '../types';

interface BOQTableProps {
  quantities: QuantityItem[];
  exportUrl: string;
  onUpdateUnitPrice?: (itemId: string | number, newPrice: number) => void;
}

export const BOQTable: React.FC<BOQTableProps> = ({
  quantities,
  exportUrl,
  onUpdateUnitPrice,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Default price fallbacks for BOQ items if unspecified
  const defaultPrices: Record<string, number> = {
    ROOM: 180,
    COLUMN: 4500,
    BEAM: 3800,
    SLAB: 2800,
    DOOR: 1200,
    WINDOW: 950,
  };

  const getEffectivePrice = (item: QuantityItem): number => {
    if (item.unitPrice !== undefined && item.unitPrice > 0) return item.unitPrice;
    const cat = (item.category || '').toUpperCase();
    return defaultPrices[cat] || 250;
  };

  const categories = [
    'ALL',
    ...Array.from(new Set(quantities.map((q) => q.category || 'General'))),
  ];

  const filteredQuantities = quantities.filter((item) => {
    const matchesSearch = item.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === 'ALL' ||
      (item.category || 'General') === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Calculate project summary metrics
  const totalCost = quantities.reduce((sum, item) => {
    const price = getEffectivePrice(item);
    return sum + item.quantity * price;
  }, 0);

  const totalArea = quantities
    .filter((q) => q.unit === 'm²')
    .reduce((sum, q) => sum + q.quantity, 0);

  const totalVolume = quantities
    .filter((q) => q.unit === 'm³')
    .reduce((sum, q) => sum + q.quantity, 0);

  return (
    <div className="space-y-6">
      {/* Kreo Metric Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4 flex items-center gap-4 border-l-4 border-l-cyan-500">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-semibold uppercase">
              Total Tender Cost
            </p>
            <p className="text-xl font-extrabold text-white font-mono mt-0.5">
              ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <div className="glass-panel p-4 flex items-center gap-4 border-l-4 border-l-emerald-500">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-semibold uppercase">
              Total Surface Area
            </p>
            <p className="text-xl font-extrabold text-emerald-400 font-mono mt-0.5">
              {totalArea.toFixed(2)} <span className="text-xs text-slate-400">m²</span>
            </p>
          </div>
        </div>

        <div className="glass-panel p-4 flex items-center gap-4 border-l-4 border-l-blue-500">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Box className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-semibold uppercase">
              Concrete Volume
            </p>
            <p className="text-xl font-extrabold text-blue-400 font-mono mt-0.5">
              {totalVolume.toFixed(2)} <span className="text-xs text-slate-400">m³</span>
            </p>
          </div>
        </div>

        <div className="glass-panel p-4 flex items-center gap-4 border-l-4 border-l-purple-500">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-semibold uppercase">
              Extracted BOQ Items
            </p>
            <p className="text-xl font-extrabold text-purple-300 font-mono mt-0.5">
              {quantities.length} <span className="text-xs text-slate-400">items</span>
            </p>
          </div>
        </div>
      </div>

      {/* Main BOQ Interactive Table Panel */}
      <div className="glass-panel p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              <span>Bill of Quantities (BOQ) & Tender Cost Schedule</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Edit unit rates to recalculate total material and labor estimates live
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search takeoff items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-9 py-1.5 text-xs w-48"
              />
            </div>

            <a
              href={exportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary text-xs py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 border-emerald-500 shadow-md shadow-emerald-500/20"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Excel BOQ</span>
            </a>
          </div>
        </div>

        {/* Filter Categories */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
            <Filter className="w-3 h-3 text-cyan-400" />
            Category Filter:
          </span>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                selectedCategory === cat
                  ? 'bg-cyan-600 text-white border-cyan-500 font-semibold shadow-sm'
                  : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:border-slate-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* BOQ Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-900/80">
                <th className="p-3 w-10">#</th>
                <th className="p-3">Item Description</th>
                <th className="p-3">Category</th>
                <th className="p-3 text-right">Quantity</th>
                <th className="p-3 text-center">Unit</th>
                <th className="p-3 text-right">Unit Rate ($)</th>
                <th className="p-3 text-right">Total Price ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredQuantities.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500 font-sans">
                    No quantity items found matching filters.
                  </td>
                </tr>
              ) : (
                filteredQuantities.map((item, idx) => {
                  const unitPrice = getEffectivePrice(item);
                  const lineTotal = item.quantity * unitPrice;

                  return (
                    <tr
                      key={item.id || idx}
                      className="hover:bg-slate-900/50 transition-colors group"
                    >
                      <td className="p-3 text-slate-500 font-sans">{idx + 1}</td>
                      <td className="p-3 font-semibold text-slate-200 font-sans">
                        <div className="flex items-center gap-2">
                          <span>{item.name}</span>
                          {item.isManual && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30 text-[9px] font-sans">
                              Manual
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 text-[10px] border border-slate-700 font-sans font-medium">
                          {item.category || 'General'}
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-cyan-400">
                        {item.quantity.toFixed(2)}
                      </td>
                      <td className="p-3 text-center text-slate-400 font-sans">
                        {item.unit}
                      </td>
                      <td className="p-3 text-right">
                        <input
                          type="number"
                          value={unitPrice}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            if (onUpdateUnitPrice && item.id) {
                              onUpdateUnitPrice(item.id, val);
                            }
                          }}
                          className="w-24 px-2 py-1 bg-slate-950 border border-slate-800 rounded text-right text-emerald-400 font-bold focus:border-cyan-500 outline-none"
                        />
                      </td>
                      <td className="p-3 text-right font-bold text-white">
                        ${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
