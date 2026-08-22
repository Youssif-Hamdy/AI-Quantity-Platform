"""
read_cad_full.py
-----------------
A DEEP DXF reader. Goes beyond basic geometry (lines/polylines/circles) to
capture nearly everything needed to faithfully understand or reconstruct a
drawing: table definitions (layers, linetypes, text styles, dim styles),
block DEFINITIONS (not just where they're placed), hatches/fills, splines,
ellipses, attributes on blocks (e.g. door tags), and styling info
(color/linetype/lineweight) per entity.

Install requirement:
    pip install ezdxf

Usage:
    python read_cad_full.py drawing.dxf
    python read_cad_full.py drawing.dxf --json output.json
    python read_cad_full.py drawing.dxf --json output.json --quiet

Still out of scope (DXF format limitations / rare in practice):
    - XREFs (external reference files) are listed but not resolved/followed
    - Raster IMAGE/WIPEOUT entities are noted but pixel data isn't read
    - Custom XDATA / proprietary app-specific data (varies per CAD vendor)
    - True DWG binary format (convert to DXF first, e.g. with the free
      ODA File Converter, or use the ODA/Teigha SDK for native DWG I/O)
"""

import sys
import json
import argparse
from collections import defaultdict

import ezdxf
from ezdxf.entities import Insert


# ---------------------------------------------------------------------------
# Header / document-level metadata
# ---------------------------------------------------------------------------

def extract_header(doc) -> dict:
    h = doc.header
    return {
        "dxf_version": doc.dxfversion,
        "units_code": h.get("$INSUNITS", "unknown"),  # 1=inches,4=mm,6=meters,etc.
        "drawing_limits_min": tuple(h.get("$LIMMIN", (0, 0))),
        "drawing_limits_max": tuple(h.get("$LIMMAX", (0, 0))),
        "extents_min": tuple(h.get("$EXTMIN", (0, 0, 0)))[:2],
        "extents_max": tuple(h.get("$EXTMAX", (0, 0, 0)))[:2],
        "current_layer": h.get("$CLAYER", "0"),
        "angle_base": h.get("$ANGBASE", 0),
    }


# ---------------------------------------------------------------------------
# Tables: layers, linetypes, text styles, dimension styles
# ---------------------------------------------------------------------------

def extract_layers(doc) -> list:
    layers = []
    for layer in doc.layers:
        layers.append({
            "name": layer.dxf.name,
            "color_index": layer.dxf.color,
            "linetype": layer.dxf.linetype,
            "lineweight": layer.dxf.lineweight,
            "is_on": not layer.is_off(),
            "is_frozen": layer.is_frozen(),
            "is_locked": layer.is_locked(),
            "plot": bool(layer.dxf.plot) if layer.dxf.hasattr("plot") else True,
        })
    return layers


def extract_linetypes(doc) -> list:
    out = []
    for lt in doc.linetypes:
        out.append({
            "name": lt.dxf.name,
            "description": lt.dxf.description,
            "pattern_length": getattr(lt.dxf, "pattern_length", None),
        })
    return out


def extract_text_styles(doc) -> list:
    out = []
    for st in doc.styles:
        out.append({
            "name": st.dxf.name,
            "font_file": st.dxf.font,
            "height": st.dxf.height,
            "width_factor": st.dxf.width,
            "oblique_angle": st.dxf.oblique,
        })
    return out


def extract_dim_styles(doc) -> list:
    out = []
    for ds in doc.dimstyles:
        out.append({
            "name": ds.dxf.name,
            "text_height": getattr(ds.dxf, "dimtxt", None),
            "arrow_size": getattr(ds.dxf, "dimasz", None),
            "scale": getattr(ds.dxf, "dimscale", None),
        })
    return out


# ---------------------------------------------------------------------------
# Block DEFINITIONS (the actual symbol geometry, not just placements)
# ---------------------------------------------------------------------------

def summarize_entity_geometry(entity) -> dict:
    """Lightweight geometric summary for an entity, used both for modelspace
    entities and for entities nested inside block definitions."""
    t = entity.dxftype()
    base = {"type": t, "layer": entity.dxf.layer if entity.dxf.hasattr("layer") else "0"}

    try:
        if t == "LINE":
            base["start"] = tuple(round(v, 3) for v in entity.dxf.start.xyz[:2])
            base["end"] = tuple(round(v, 3) for v in entity.dxf.end.xyz[:2])
        elif t in ("LWPOLYLINE",):
            base["points"] = [(round(p[0], 3), round(p[1], 3), round(p[2], 3) if len(p)>2 else 0.0) for p in entity.get_points("xyb")]
            base["closed"] = entity.closed
        elif t == "POLYLINE":
            base["points"] = [(round(v.dxf.location.x, 3), round(v.dxf.location.y, 3)) for v in entity.vertices]
            base["closed"] = entity.is_closed
        elif t == "CIRCLE":
            base["center"] = (round(entity.dxf.center.x, 3), round(entity.dxf.center.y, 3))
            base["radius"] = round(entity.dxf.radius, 3)
        elif t == "ARC":
            base["center"] = (round(entity.dxf.center.x, 3), round(entity.dxf.center.y, 3))
            base["radius"] = round(entity.dxf.radius, 3)
            base["start_angle"] = entity.dxf.start_angle
            base["end_angle"] = entity.dxf.end_angle
        elif t == "ELLIPSE":
            base["center"] = (round(entity.dxf.center.x, 3), round(entity.dxf.center.y, 3))
            base["major_axis_endpoint"] = tuple(round(v, 3) for v in entity.dxf.major_axis.xyz[:2])
            base["ratio"] = entity.dxf.ratio
        elif t == "SPLINE":
            base["control_points"] = [(round(p[0], 3), round(p[1], 3)) for p in entity.control_points]
            base["degree"] = entity.dxf.degree
        elif t in ("SOLID", "3DFACE"):
            base["points"] = [(round(p[0], 3), round(p[1], 3)) for p in entity.get_points()] if hasattr(entity, "get_points") else None
        elif t == "POINT":
            base["position"] = (round(entity.dxf.location.x, 3), round(entity.dxf.location.y, 3))
        elif t == "HATCH":
            base["pattern_name"] = entity.dxf.pattern_name
            base["is_solid_fill"] = bool(entity.dxf.solid_fill)
            base["boundary_path_count"] = len(entity.paths)
        elif t in ("TEXT",):
            base["content"] = entity.dxf.text
            base["position"] = (round(entity.dxf.insert.x, 3), round(entity.dxf.insert.y, 3))
            base["height"] = entity.dxf.height
            base["rotation_deg"] = getattr(entity.dxf, 'rotation', 0.0)
        elif t == "MTEXT":
            base["content"] = entity.text
            base["position"] = (round(entity.dxf.insert.x, 3), round(entity.dxf.insert.y, 3))
            base["rotation_deg"] = getattr(entity.dxf, 'rotation', 0.0)
        elif t == "INSERT":
            base["block_name"] = entity.dxf.name
            base["position"] = (round(entity.dxf.insert.x, 3), round(entity.dxf.insert.y, 3))
            base["rotation_deg"] = entity.dxf.rotation
            base["scale"] = (
                round(getattr(entity.dxf, 'xscale', 1.0), 3),
                round(getattr(entity.dxf, 'yscale', 1.0), 3)
            )
        elif t in ("LEADER", "MLEADER"):
            base["note"] = "leader/callout present"
        elif t == "IMAGE":
            base["note"] = "raster image reference (pixel data not extracted)"
    except Exception as ex:
        base["extraction_warning"] = str(ex)

    return base


def extract_block_definitions(doc) -> dict:
    """
    Real symbol geometry for every block. E.g. block 'DOOR_36' will contain
    the actual arc + line entities that draw a door leaf and swing arc -
    this is what an INSERT reference in modelspace actually points to.
    Model-space and paper-space anonymous blocks are skipped.
    """
    definitions = {}
    for block in doc.blocks:
        name = block.name
        if name.startswith("*"):  # skip anonymous/system blocks (*Model_Space, *Paper_Space, etc.)
            continue
        entities = [summarize_entity_geometry(e) for e in block if e.dxftype() != "ATTDEF"]
        attdefs = [
            {"tag": e.dxf.tag, "prompt": e.dxf.prompt, "default": e.dxf.text}
            for e in block if e.dxftype() == "ATTDEF"
        ]
        definitions[name] = {
            "base_point": (round(block.block.dxf.base_point.x, 3), round(block.block.dxf.base_point.y, 3)),
            "entity_count": len(entities),
            "entities": entities,
            "attribute_definitions": attdefs,  # e.g. a "DOOR_TAG" field on a door block
        }
    return definitions


# ---------------------------------------------------------------------------
# Modelspace entities (with attributes on inserts, e.g. door/room tags)
# ---------------------------------------------------------------------------

def extract_insert_attributes(insert: Insert) -> list:
    """ATTRIB values attached to a block reference, e.g. a door tag 'D-01'
    or a room-number field placed via a block with attributes."""
    attribs = []
    if insert.attribs:
        for a in insert.attribs:
            attribs.append({"tag": a.dxf.tag, "value": a.dxf.text})
    return attribs


def extract_modelspace_entities(msp) -> list:
    entities = []
    for e in msp:
        summary = summarize_entity_geometry(e)
        # style info common to (almost) every entity
        summary["color_index"] = e.dxf.color if e.dxf.hasattr("color") else None
        summary["linetype"] = e.dxf.linetype if e.dxf.hasattr("linetype") else None
        summary["lineweight"] = e.dxf.lineweight if e.dxf.hasattr("lineweight") else None
        if e.dxftype() == "INSERT":
            summary["attributes"] = extract_insert_attributes(e)
        entities.append(summary)
    return entities


def extract_dimensions(msp) -> list:
    dims = []
    for e in msp.query("DIMENSION"):
        try:
            measurement = e.get_measurement()
        except Exception:
            measurement = None
        dims.append({
            "layer": e.dxf.layer,
            "dimstyle": e.dxf.dimstyle,
            "measurement": measurement,
            "text_override": e.dxf.text if e.dxf.text != "<>" else None,
        })
    return dims


def summarize_layers_usage(msp) -> dict:
    counts = defaultdict(int)
    for e in msp:
        counts[e.dxf.layer] += 1
    return dict(sorted(counts.items(), key=lambda kv: -kv[1]))


def summarize_entity_types(msp) -> dict:
    counts = defaultdict(int)
    for e in msp:
        counts[e.dxftype()] += 1
    return dict(sorted(counts.items(), key=lambda kv: -kv[1]))


# ---------------------------------------------------------------------------
# Top-level orchestration
# ---------------------------------------------------------------------------

def read_cad_full(filepath: str) -> dict:
    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()

    return {
        "file": filepath,
        "header": extract_header(doc),
        "layers": extract_layers(doc),
        "linetypes": extract_linetypes(doc),
        "text_styles": extract_text_styles(doc),
        "dim_styles": extract_dim_styles(doc),
        "block_definitions": extract_block_definitions(doc),
        "modelspace_entity_type_counts": summarize_entity_types(msp),
        "modelspace_layer_usage": summarize_layers_usage(msp),
        "modelspace_entities": extract_modelspace_entities(msp),
        "dimensions": extract_dimensions(msp),
    }


def main():
    parser = argparse.ArgumentParser(description="Deep-read a DXF CAD file: tables, block definitions, styled entities.")
    parser.add_argument("dxf_path", help="Path to the .dxf file")
    parser.add_argument("--json", help="Path to save full structured data as JSON", default=None)
    parser.add_argument("--quiet", action="store_true", help="Only print summary counts, skip full entity dump")
    args = parser.parse_args()

    try:
        data = read_cad_full(args.dxf_path)
    except IOError:
        print(f"Error: could not open file '{args.dxf_path}'")
        sys.exit(1)
    except ezdxf.DXFStructureError:
        print(f"Error: '{args.dxf_path}' is not a valid/readable DXF file.")
        sys.exit(1)

    h = data["header"]
    print(f"\nFile: {data['file']}")
    print(f"DXF version: {h['dxf_version']}   Units code: {h['units_code']}   Current layer: {h['current_layer']}")

    print(f"\nLayers defined:      {len(data['layers'])}")
    print(f"Linetypes defined:   {len(data['linetypes'])}")
    print(f"Text styles defined: {len(data['text_styles'])}")
    print(f"Dim styles defined:  {len(data['dim_styles'])}")
    print(f"Block definitions:   {len(data['block_definitions'])}")

    print("\nEntity type counts (modelspace):")
    for etype, count in data["modelspace_entity_type_counts"].items():
        print(f"  {etype:<15} {count}")

    print("\nLayer usage (modelspace):")
    for layer, count in data["modelspace_layer_usage"].items():
        print(f"  {layer:<25} {count}")

    if data["block_definitions"] and not args.quiet:
        print("\nBlock definitions (symbol geometry available for each):")
        for name, block in data["block_definitions"].items():
            attr_note = f", {len(block['attribute_definitions'])} attribute field(s)" if block["attribute_definitions"] else ""
            print(f"  - {name}: {block['entity_count']} entities{attr_note}")

    print(f"\nDimensions found: {len(data['dimensions'])}")

    if args.json:
        with open(args.json, "w") as f:
            json.dump(data, f, indent=2)
        print(f"\nFull structured data saved to: {args.json}")


if __name__ == "__main__":
    main()
