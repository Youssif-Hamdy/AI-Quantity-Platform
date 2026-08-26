import React from 'react';

export const CadBlueprintSchematic: React.FC = () => {
  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className="absolute top-0 left-0 w-full h-full pointer-events-none select-none bg-[#090d16]"
    >
      {/* ── CAD Grid Background Lines ── */}
      <defs>
        <pattern id="cadGrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="1000" height="1000" fill="url(#cadGrid)" />

      {/* ── Outer Dimension Axis Lines & Rules (Matching Image 2) ── */}
      {/* Top Axis */}
      <line x1="160" y1="90" x2="840" y2="90" stroke="#38bdf8" strokeWidth="1.5" />
      <line x1="160" y1="80" x2="160" y2="100" stroke="#38bdf8" strokeWidth="1.5" />
      <line x1="500" y1="80" x2="500" y2="100" stroke="#38bdf8" strokeWidth="1.5" />
      <line x1="840" y1="80" x2="840" y2="100" stroke="#38bdf8" strokeWidth="1.5" />
      <text x="500" y="75" fill="#38bdf8" fontSize="12" fontFamily="JetBrains Mono, monospace" textAnchor="middle">1000</text>
      <text x="330" y="110" fill="#64748b" fontSize="10" fontFamily="JetBrains Mono, monospace" textAnchor="middle">300</text>
      <text x="500" y="110" fill="#64748b" fontSize="10" fontFamily="JetBrains Mono, monospace" textAnchor="middle">400</text>
      <text x="670" y="110" fill="#64748b" fontSize="10" fontFamily="JetBrains Mono, monospace" textAnchor="middle">300</text>

      {/* Bottom Axis */}
      <line x1="160" y1="850" x2="840" y2="850" stroke="#38bdf8" strokeWidth="1.5" />
      <line x1="160" y1="840" x2="160" y2="860" stroke="#38bdf8" strokeWidth="1.5" />
      <line x1="380" y1="840" x2="380" y2="860" stroke="#38bdf8" strokeWidth="1.5" />
      <line x1="620" y1="840" x2="620" y2="860" stroke="#38bdf8" strokeWidth="1.5" />
      <line x1="840" y1="840" x2="840" y2="860" stroke="#38bdf8" strokeWidth="1.5" />
      <text x="270" y="870" fill="#64748b" fontSize="10" fontFamily="JetBrains Mono, monospace" textAnchor="middle">3000</text>
      <text x="500" y="870" fill="#64748b" fontSize="10" fontFamily="JetBrains Mono, monospace" textAnchor="middle">3300</text>
      <text x="730" y="870" fill="#64748b" fontSize="10" fontFamily="JetBrains Mono, monospace" textAnchor="middle">3000</text>
      <text x="500" y="890" fill="#38bdf8" fontSize="11" fontFamily="JetBrains Mono, monospace" textAnchor="middle" fontWeight="bold">7600 mm</text>

      {/* Left Axis */}
      <line x1="90" y1="130" x2="90" y2="800" stroke="#38bdf8" strokeWidth="1.5" />
      <line x1="80" y1="130" x2="100" y2="130" stroke="#38bdf8" strokeWidth="1.5" />
      <line x1="80" y1="460" x2="100" y2="460" stroke="#38bdf8" strokeWidth="1.5" />
      <line x1="80" y1="800" x2="100" y2="800" stroke="#38bdf8" strokeWidth="1.5" />
      <text x="75" y="300" fill="#64748b" fontSize="10" fontFamily="JetBrains Mono, monospace" textAnchor="middle" transform="rotate(-90 75 300)">1950</text>
      <text x="75" y="630" fill="#64748b" fontSize="10" fontFamily="JetBrains Mono, monospace" textAnchor="middle" transform="rotate(-90 75 630)">3800</text>

      {/* ── Exterior Double Wall Boundaries ── */}
      <rect x="160" y="130" width="680" height="670" fill="none" stroke="#f59e0b" strokeWidth="4" strokeOpacity="0.8" />
      <rect x="166" y="136" width="668" height="658" fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeOpacity="0.6" />

      {/* ── Interior Partition Walls ── */}
      {/* Horizontal divider middle */}
      <line x1="160" y1="460" x2="840" y2="460" stroke="#f59e0b" strokeWidth="3" strokeOpacity="0.7" />
      <line x1="160" y1="500" x2="840" y2="500" stroke="#f59e0b" strokeWidth="3" strokeOpacity="0.7" />

      {/* Vertical dividers */}
      <line x1="480" y1="130" x2="480" y2="460" stroke="#f59e0b" strokeWidth="3" strokeOpacity="0.7" />
      <line x1="520" y1="130" x2="520" y2="460" stroke="#f59e0b" strokeWidth="3" strokeOpacity="0.7" />
      <line x1="360" y1="500" x2="360" y2="800" stroke="#f59e0b" strokeWidth="3" strokeOpacity="0.7" />
      <line x1="640" y1="500" x2="640" y2="800" stroke="#f59e0b" strokeWidth="3" strokeOpacity="0.7" />

      {/* Central Stairs & Elevator Core */}
      <rect x="420" y="220" width="160" height="230" fill="rgba(15, 23, 42, 0.9)" stroke="#38bdf8" strokeWidth="2" />
      <line x1="420" y1="220" x2="580" y2="450" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="4 2" />
      <line x1="580" y1="220" x2="420" y2="450" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="4 2" />
      {/* Stair steps */}
      {[240, 260, 280, 300, 320, 340, 360, 380, 400, 420].map((yStep) => (
        <line key={yStep} x1="430" y1={yStep} x2="570" y2={yStep} stroke="rgba(56, 189, 248, 0.3)" strokeWidth="1" />
      ))}

      {/* ── Door Openings & Arc Swings (Matching Image 2) ── */}
      {/* Top-left room door */}
      <path d="M 310 460 A 40 40 0 0 1 350 420" fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="2 2" />
      <line x1="310" y1="460" x2="350" y2="460" stroke="#f59e0b" strokeWidth="2" />

      {/* Top-right room door */}
      <path d="M 650 460 A 40 40 0 0 0 690 420" fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="2 2" />
      <line x1="650" y1="460" x2="690" y2="460" stroke="#f59e0b" strokeWidth="2" />

      {/* Bottom-left room door */}
      <path d="M 310 500 A 40 40 0 0 0 350 540" fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="2 2" />
      <line x1="310" y1="500" x2="350" y2="500" stroke="#f59e0b" strokeWidth="2" />

      {/* Bottom-right room door */}
      <path d="M 650 500 A 40 40 0 0 1 690 540" fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="2 2" />
      <line x1="650" y1="500" x2="690" y2="500" stroke="#f59e0b" strokeWidth="2" />

      {/* ── Furniture Schematics (Bed, Tables outlines in rooms) ── */}
      {/* Top-Left Bedroom Bed */}
      <rect x="200" y="170" width="100" height="120" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" rx="4" />
      <rect x="210" y="178" width="38" height="24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <rect x="254" y="178" width="38" height="24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />

      {/* Top-Right Master Bedroom Bed */}
      <rect x="700" y="170" width="100" height="120" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" rx="4" />
      <rect x="710" y="178" width="38" height="24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <rect x="754" y="178" width="38" height="24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />

      {/* Bottom-Left Eaver Bedroom Bed */}
      <rect x="200" y="640" width="100" height="120" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" rx="4" />
      <rect x="210" y="730" width="38" height="24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <rect x="254" y="730" width="38" height="24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />

      {/* Bottom-Right Bedroom Bed */}
      <rect x="700" y="640" width="100" height="120" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" rx="4" />
      <rect x="710" y="730" width="38" height="24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <rect x="754" y="730" width="38" height="24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />

      {/* Living Area Sofa & Table */}
      <rect x="420" y="640" width="160" height="60" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" rx="6" />
      <circle cx="500" cy="570" r="28" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
    </svg>
  );
};
