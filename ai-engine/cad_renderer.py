import json
import math
import sys

ACI_COLORS = {1: '#FF0000', 2: '#FFFF00', 3: '#00FF00', 4: '#00FFFF', 5: '#0000FF', 6: '#FF00FF', 7: '#000000', 8: '#808080', 9: '#C0C0C0'}

def get_color(index):
    if index is None or index < 1 or index > 9:
        return '#000000'
    return ACI_COLORS.get(index, '#000000')

class CADRenderer:
    def __init__(self, data):
        self.data = data
        self.blocks = data.get('block_definitions', {})
        self.min_x, self.min_y, self.max_x, self.max_y = float('inf'), float('inf'), float('-inf'), float('-inf')
        self._calculate_bounds()
        if self.min_x == float('inf'):
            self.min_x, self.min_y, self.max_x, self.max_y = 0, 0, 100, 100
        pad = max((self.max_x - self.min_x) * 0.1, 10)
        self.min_x -= pad; self.min_y -= pad; self.max_x += pad; self.max_y += pad
        self.width = self.max_x - self.min_x
        self.height = self.max_y - self.min_y

    def _update_bounds(self, x, y):
        self.min_x = min(self.min_x, x); self.max_x = max(self.max_x, x)
        self.min_y = min(self.min_y, y); self.max_y = max(self.max_y, y)

    def _calculate_bounds(self):
        for e in self.data.get('modelspace_entities', []):
            t = e.get('type')
            if t == 'LINE':
                self._update_bounds(*e['start']); self._update_bounds(*e['end'])
            elif t in ('LWPOLYLINE', 'POLYLINE'):
                for p in e['points']:
                    self._update_bounds(p[0], p[1])
            elif t in ('CIRCLE', 'ARC', 'ELLIPSE'):
                self._update_bounds(e['center'][0], e['center'][1])
            elif t == 'INSERT':
                self._update_bounds(e['position'][0], e['position'][1])
            elif t in ('TEXT', 'MTEXT'):
                self._update_bounds(e['position'][0], e['position'][1])
            elif t == 'POINT':
                self._update_bounds(e['position'][0], e['position'][1])

    def render(self, output_path):
        svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{self.min_x} {self.min_y} {self.width} {self.height}" width="100%" height="100%">']
        svg.append('<style>text { font-family: monospace; }</style>')
        svg.append(f'<rect x="{self.min_x}" y="{self.min_y}" width="{self.width}" height="{self.height}" fill="white" />')
        svg.append('<g id="modelspace">')
        for e in self.data.get('modelspace_entities', []):
            svg.extend(self._render_entity(e))
        svg.append('</g></svg>')
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write("\n".join(svg))

    def _render_entity(self, e, transform='', is_root=True):
        svg = []
        t = e.get('type')
        color = get_color(e.get('color_index'))
        stroke = f'stroke="{color}" stroke-width="{self.width/1000}" fill="none"'
        
        def fy(y):
            if is_root:
                return (self.max_y - y) + self.min_y
            return -y

        if t == 'LINE':
            x1, y1 = e['start']; x2, y2 = e['end']
            svg.append(f'<line x1="{x1}" y1="{fy(y1)}" x2="{x2}" y2="{fy(y2)}" {stroke} transform="{transform}" />')
        elif t in ('LWPOLYLINE', 'POLYLINE'):
            points = e.get('points', [])
            if points:
                pts_str = ' '.join([f'{p[0]},{fy(p[1])}' for p in points])
                if e.get('closed'): svg.append(f'<polygon points="{pts_str}" {stroke} transform="{transform}" />')
                else: svg.append(f'<polyline points="{pts_str}" {stroke} transform="{transform}" />')
        elif t == 'CIRCLE':
            cx, cy = e['center']; r = e['radius']
            svg.append(f'<circle cx="{cx}" cy="{fy(cy)}" r="{r}" {stroke} transform="{transform}" />')
        elif t == 'ARC':
            cx, cy = e['center']; r = e['radius']
            pts_cad = []
            sa_cad = math.radians(e['start_angle'])
            ea_cad = math.radians(e['end_angle'])
            if ea_cad < sa_cad: ea_cad += 2 * math.pi
            steps = max(10, int(abs(math.degrees(ea_cad - sa_cad)) / 5))
            astep_cad = (ea_cad - sa_cad) / steps
            for i in range(steps + 1):
                a = sa_cad + i * astep_cad
                pts_cad.append((cx + r * math.cos(a), cy + r * math.sin(a)))
            pts_str = ' '.join([f'{p[0]},{fy(p[1])}' for p in pts_cad])
            svg.append(f'<polyline points="{pts_str}" {stroke} transform="{transform}" />')
        elif t in ('TEXT', 'MTEXT'):
            x, y = e['position']
            text = e.get('content', '').replace('<', '&lt;').replace('>', '&gt;')
            h = e.get('height', self.width/100)
            rot = -e.get('rotation_deg', 0)
            t_text = f'{transform} translate({x},{fy(y)}) rotate({rot})'
            svg.append(f'<text x="0" y="0" font-size="{h}" fill="{color}" transform="{t_text}">{text}</text>')
        elif t == 'INSERT':
            bname = e['block_name']; x, y = e['position']; rot = -e.get('rotation_deg', 0); sx, sy = e.get('scale', (1, 1))
            # Flip Y scale if needed? No, block scale is usually uniform.
            # But wait, if sx and sy are positive, and we flipped Y locally, the block renders correctly!
            ins_transform = f'{transform} translate({x},{fy(y)}) rotate({rot}) scale({sx},{sy})'
            block = self.blocks.get(bname)
            if block:
                bx, by = block.get('base_point', (0,0))
                # Since local internal entities have their Y negated (fy = -y), 
                # we need to translate by +by to correctly shift the negated coordinates.
                ins_transform += f' translate({-bx},{by})'
                svg.append(f'<g id="block_{bname}">')
                for be in block.get('entities', []):
                    svg.extend(self._render_entity(be, ins_transform, is_root=False))
                svg.append('</g>')
        return svg

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python cad_renderer.py input.json output.svg")
        sys.exit(1)
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        data = json.load(f)
    CADRenderer(data).render(sys.argv[2])
    print(f"Rendered {sys.argv[2]}")
