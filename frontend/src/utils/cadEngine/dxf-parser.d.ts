// Type declaration for dxf-parser (no @types package available)
declare module 'dxf-parser' {
  export interface DxfParserVertex {
    x: number;
    y: number;
    z?: number;
    startWidth?: number;
    endWidth?: number;
    bulge?: number;
  }

  export interface DxfParserEntity {
    type: string;
    layer?: string;
    color?: number;
    colorIndex?: number;
    handle?: string;
    // LINE
    start?: { x: number; y: number; z?: number };
    end?: { x: number; y: number; z?: number };
    // CIRCLE / ARC
    center?: { x: number; y: number; z?: number };
    radius?: number;
    startAngle?: number;
    endAngle?: number;
    // LWPOLYLINE / POLYLINE
    vertices?: DxfParserVertex[];
    closed?: boolean;
    width?: number;
    // TEXT / MTEXT
    text?: string;
    position?: { x: number; y: number; z?: number };
    startPoint?: { x: number; y: number; z?: number };
    height?: number;
    // INSERT
    name?: string;
    xScale?: number;
    yScale?: number;
    rotation?: number;
  }

  export interface DxfParserLayer {
    name: string;
    color?: number;
    colorIndex?: number;
    lineType?: string;
    frozen?: boolean;
  }

  export interface DxfParserResult {
    entities: DxfParserEntity[];
    blocks?: Record<string, { entities: DxfParserEntity[] }>;
    tables?: {
      layer?: {
        layers: Record<string, DxfParserLayer>;
      };
    };
    header?: Record<string, any>;
  }

  class DxfParser {
    constructor();
    parseSync(source: string): DxfParserResult;
    parse(source: string, done: (err: Error | null, data: DxfParserResult | null) => void): void;
  }

  export default DxfParser;
}
