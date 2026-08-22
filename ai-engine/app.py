from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import shutil
from pathlib import Path

from main import run
from config import OUTPUT_DIR, TEMP_DIR, INPUT_DIR

app = FastAPI(title="AI Quantity Platform - Test Viewer")

# Serve the static HTML frontend
static_dir = Path(__file__).parent / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

@app.get("/", response_class=HTMLResponse)
async def index():
    with open(static_dir / "index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.post("/api/process")
async def process_file(
    file: UploadFile = File(...),
    drawing_type: str = Form(None)
):
    """Uploads a drawing, runs the pipeline, and returns the Canvas JSON."""
    
    # Save uploaded file
    input_path = INPUT_DIR / file.filename
    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        # Run the AI engine pipeline
        # (we use the preset type if provided, otherwise it defaults to architectural)
        dt = drawing_type if drawing_type in ["architectural", "civil", "mixed"] else "architectural"
        
        # Run pipeline
        run(str(input_path), preset_drawing_type=dt)
        
        # Read the resulting canvas json
        canvas_file = OUTPUT_DIR / "canvas.json"
        if not canvas_file.exists():
            return JSONResponse({"error": "Failed to generate canvas.json"}, status_code=500)
            
        import json
        with open(canvas_file, "r", encoding="utf-8") as f:
            canvas_data = json.load(f)
            
        # Also return the first page image so we can draw it as a background
        pages_dir = TEMP_DIR / "pages"
        first_page = None
        if pages_dir.exists():
            for p in pages_dir.glob("page_1.*"):
                first_page = p
                break
        
        bg_url = None
        if first_page and first_page.exists():
            # Copy to static so frontend can fetch it
            dest = static_dir / f"bg{first_page.suffix}"
            shutil.copy2(first_page, dest)
            bg_url = f"/static/bg{first_page.suffix}"
            
        # Return the visual editor preview image
        preview_page = OUTPUT_DIR / "preview.png"
        preview_url = None
        if preview_page.exists():
            dest_preview = static_dir / "preview.png"
            shutil.copy2(preview_page, dest_preview)
            preview_url = "/static/preview.png"
            
        return {
            "success": True,
            "canvas_data": canvas_data,
            "background_image": bg_url,
            "preview_image": preview_url
        }
        
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
