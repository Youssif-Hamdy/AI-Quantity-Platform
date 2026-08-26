import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

const router = Router();

// ── Multer for DWG uploads (memory-efficient temp files) ──────────────────────
const isVercel = process.env.VERCEL === '1';
const dwgTempDir = isVercel
  ? path.join('/tmp', 'dwg-convert')
  : path.resolve(process.cwd(), 'src/uploads/dwg-temp');

if (!fs.existsSync(dwgTempDir)) {
  try { fs.mkdirSync(dwgTempDir, { recursive: true }); } catch (_) {}
}

const dwgStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, dwgTempDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const dwgUpload = multer({
  storage: dwgStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.dwg') {
      cb(null, true);
    } else {
      cb(new Error('Only .dwg files are accepted'));
    }
  },
});

// ── Python DWG→DXF Converter (using ezdxf) ───────────────────────────────────
function convertDwgToDxf(dwgPath: string, dxfPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Inline Python script: uses ezdxf to convert DWG→DXF
    const pythonScript = `
import sys
try:
    import ezdxf
    doc, _ = ezdxf.recover.readfile(sys.argv[1])
    doc.saveas(sys.argv[2])
    print("OK")
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
`;

    // Resolve Python path — prefer the ai-engine venv if available
    const aiEngineDir = path.resolve(__dirname, '../../../ai-engine');
    const venvPython = path.join(aiEngineDir, '.venv', 'Scripts', 'python.exe');
    const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python';

    const proc = spawn(pythonCmd, ['-c', pythonScript, dwgPath, dxfPath], {
      cwd: aiEngineDir,
    });

    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`DWG conversion failed: ${stderr.trim()}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Could not start Python: ${err.message}. Make sure Python & ezdxf are installed.`));
    });
  });
}

/**
 * @swagger
 * /api/convert/dwg-to-dxf:
 *   post:
 *     summary: Convert a DWG binary file to DXF text format
 *     tags: [Convert]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The .dwg file to convert
 *     responses:
 *       200:
 *         description: DXF text content
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dxfText:
 *                   type: string
 *       400:
 *         description: Invalid file type
 *       500:
 *         description: Conversion failed
 */
router.post('/dwg-to-dxf', dwgUpload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ status: 'error', message: 'No .dwg file uploaded' });
  }

  const dwgPath = path.resolve(req.file.path);
  const dxfPath = dwgPath.replace(/\.dwg$/i, '.dxf');

  try {
    await convertDwgToDxf(dwgPath, dxfPath);

    if (!fs.existsSync(dxfPath)) {
      throw new Error('DXF output file not created');
    }

    const dxfText = fs.readFileSync(dxfPath, 'utf-8');

    res.status(200).json({ dxfText });

  } catch (err: any) {
    console.error('[DWG Convert] Error:', err.message);
    res.status(500).json({
      status: 'error',
      message: err.message || 'DWG conversion failed',
      hint: 'Make sure Python and ezdxf are installed in the ai-engine virtual environment',
    });
  } finally {
    // Cleanup temp files
    for (const f of [dwgPath, dxfPath]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
    }
  }
});

export default router;
