import React from 'react';
import type { ParsedDxfData, DxfEntity } from '../utils/dxfParser';

interface DxfSvgRendererProps {
  dxfData: ParsedDxfData;
  className?: string;
  visibleLayers?: Record<string, boolean>;
}

const LAYER_COLORS: Record<string, string> = {
  'A-WALL': '#f59e0b',
  'A-DOOR': '#fb923c',
  'A-WINDOW': '#06b6d4',
  'S-COLS': '#f43f5e',
  'A-TEXT': '#ffffff',
  'A-DIMS': '#38bdf8',
  'A-KITCHEN-EQUIP': '#c084fc',
  'A-BATH-FIXTURES': '#34d399',
};

export const DxfSvgRenderer: React.FC<DxfSvgRendererProps> = ({
  dxfData,
  className = '',
  visibleLayers,
}) => {
  const { bounds, entities } = dxfData;

  // In DXF coordinate system, Y goes UP (cartesian). In SVG, Y goes DOWN.
  // We flip Y: svgY = bounds.maxY - dxfY + bounds.minY
  const flipY = (y: number) => bounds.maxY - y + bounds.minY;

  return (
    <svg
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
      preserveAspectRatio="xMidYMid meet"
      className={`w-full h-full select-none bg-[#090d16] ${className}`}
    >
      <defs>
        <pattern id="dxfGrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect
        x={bounds.minX}
        y={bounds.minY}
        width={bounds.width}
        height={bounds.height}
        fill="url(#dxfGrid)"
      />

      <g id="dxf-entities">
        {entities.map((e: DxfEntity, idx: number) => {
          if (visibleLayers && visibleLayers[e.layer] === false) {
            return null;
          }

          const color = LAYER_COLORS[e.layer] || '#06b6d4';
          const strokeWidth = Math.max(bounds.width / 600, 1.2);

          if (e.type === 'LINE') {
            return (
              <line
                key={idx}
                x1={e.x1}
                y1={flipY(e.y1)}
                x2={e.x2}
                y2={flipY(e.y2)}
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
            );
          }

          if (e.type === 'CIRCLE') {
            return (
              <circle
                key={idx}
                cx={e.cx}
                cy={flipY(e.cy)}
                r={e.r}
                fill={e.layer === 'S-COLS' ? `${color}44` : 'none'}
                stroke={color}
                strokeWidth={strokeWidth}
              />
            );
          }

          if (e.type === 'ARC') {
            // Draw arc in SVG coordinates
            const saRad = (e.startAngle * Math.PI) / 180;
            const eaRad = (e.endAngle * Math.PI) / 180;
            const x1 = e.cx + e.r * Math.cos(saRad);
            const y1 = flipY(e.cy + e.r * Math.sin(saRad));
            const x2 = e.cx + e.r * Math.cos(eaRad);
            const y2 = flipY(e.cy + e.r * Math.sin(eaRad));

            const largeArcFlag = Math.abs(e.endAngle - e.startAngle) > 180 ? 1 : 0;

            return (
              <path
                key={idx}
                d={`M ${x1} ${y1} A ${e.r} ${e.r} 0 ${largeArcFlag} 0 ${x2} ${y2}`}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeDasharray={e.layer === 'A-DOOR' ? '3 3' : 'none'}
              />
            );
          }

          if (e.type === 'TEXT') {
            return (
              <text
                key={idx}
                x={e.x}
                y={flipY(e.y)}
                fill={color}
                fontSize={Math.max(e.height, bounds.width / 60)}
                fontFamily="JetBrains Mono, monospace"
                fontWeight="bold"
                className="drop-shadow"
              >
                {e.text}
              </text>
            );
          }

          return null;
        })}
      </g>
    </svg>
  );
};
