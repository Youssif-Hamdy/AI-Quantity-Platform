from fastapi import FastAPI, File, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import shutil
import tempfile
import os
import json
from pathlib import Path

# Import your DXF logic
import read_cad_full
import cad_renderer

app = FastAPI(title="DXF Tester")

static_dir = Path(__file__).parent / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

@app.get("/", response_class=HTMLResponse)
async def index():
    with open(static_dir / "dxf.html", "r", encoding="utf-8") as f:
        return f.read()

@app.post("/api/process_dxf")
async def process_dxf(file: UploadFile = File(...)):
    try:
        # Create temp files
        fd, temp_dxf = tempfile.mkstemp(suffix=".dxf")
        os.close(fd)
        
        with open(temp_dxf, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # 1. Parse DXF to JSON
        parsed_data = read_cad_full.read_cad_full(temp_dxf)
        
        # 2. Render to SVG
        fd_svg, temp_svg = tempfile.mkstemp(suffix=".svg")
        os.close(fd_svg)
        
        renderer = cad_renderer.CADRenderer(parsed_data)
        renderer.render(temp_svg)
        
        # Read the generated SVG
        with open(temp_svg, "r", encoding="utf-8") as f:
            svg_content = f.read()
            
        # Clean up
        os.remove(temp_dxf)
        os.remove(temp_svg)
        
        return {
            "success": True,
            "svg_content": svg_content,
            "stats": {
                "layers": len(parsed_data["layers"]),
                "blocks": len(parsed_data["block_definitions"]),
                "entities": len(parsed_data["modelspace_entities"]),
                "dimensions": len(parsed_data["dimensions"])
            }
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("dxf_app:app", host="127.0.0.1", port=8001, reload=True)
