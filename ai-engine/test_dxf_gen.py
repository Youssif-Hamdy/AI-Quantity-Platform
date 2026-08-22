import ezdxf

doc = ezdxf.new('R2010')
msp = doc.modelspace()

# Create a layer
doc.layers.add('MY_LAYER', color=2)

# Lines
msp.add_line((0, 0), (10, 0), dxfattribs={'layer': 'MY_LAYER'})
msp.add_line((10, 0), (10, 10), dxfattribs={'layer': 'MY_LAYER'})

# Circle
msp.add_circle((5, 5), radius=2, dxfattribs={'layer': 'MY_LAYER'})

# Polyline with Bulge
msp.add_lwpolyline([(0, 10, 0, 0, 0.5), (10, 10, 0, 0, 0)], dxfattribs={'layer': 'MY_LAYER'})

# Block
blk = doc.blocks.new(name='DOOR')
blk.add_line((0,0), (0, 3))
blk.add_arc((0,0), radius=3, start_angle=0, end_angle=90)

# Insert block
msp.add_blockref('DOOR', (5, 0), dxfattribs={'rotation': 90, 'xscale': 0.8, 'yscale': 0.8})

# Text
msp.add_text('Hello CAD', dxfattribs={'height': 0.5, 'rotation': 45}).set_placement((2, 2))

# Hatch
hatch = msp.add_hatch(color=3)
hatch.paths.add_polyline_path([(12, 0), (15, 0), (15, 3), (12, 3)], is_closed=True)

doc.saveas('test.dxf')
print('test.dxf created')

