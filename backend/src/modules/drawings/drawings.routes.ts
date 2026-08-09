import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../../middlewares/auth';
import {
  uploadDrawing,
  getDrawing,
  getProjectDrawings,
  deleteDrawing,
} from './drawings.controller';

const router = Router();

// ── Multer Setup ──────────────────────────────────────────────────────────────
const isVercel = process.env.VERCEL === '1';
const uploadDir = isVercel 
  ? path.join('/tmp', 'drawings') 
  : path.resolve(process.cwd(), 'src/uploads/drawings');

if (!fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (error) {
    console.warn(`Could not create upload directory at ${uploadDir}`, error);
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

// ── All routes require authentication ─────────────────────────────────────────
router.use(authenticate as any);

/**
 * @swagger
 * /api/drawings/upload:
 *   post:
 *     summary: Upload a PDF drawing and queue AI processing
 *     tags: [Drawings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - projectId
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               projectId:
 *                 type: string
 *               drawingType:
 *                 type: string
 *                 enum: [ARCHITECTURAL, CIVIL, MIXED]
 *     responses:
 *       201:
 *         description: Drawing uploaded and queued
 */
router.post('/upload', upload.single('file'), uploadDrawing as any);

/**
 * @swagger
 * /api/drawings/project/{projectId}:
 *   get:
 *     summary: Get all drawings for a project
 *     tags: [Drawings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of drawings
 */
router.get('/project/:projectId', getProjectDrawings as any);

/**
 * @swagger
 * /api/drawings/{id}:
 *   get:
 *     summary: Get drawing details with pages, elements and quantities
 *     tags: [Drawings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Drawing details
 */
router.get('/:id', getDrawing as any);

/**
 * @swagger
 * /api/drawings/{id}:
 *   delete:
 *     summary: Delete a drawing
 *     tags: [Drawings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Drawing deleted
 */
router.delete('/:id', deleteDrawing as any);

export default router;
