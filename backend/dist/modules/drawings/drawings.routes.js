"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const auth_1 = require("../../middlewares/auth");
const drawings_controller_1 = require("./drawings.controller");
const router = (0, express_1.Router)();
// ── Multer Setup ──────────────────────────────────────────────────────────────
const uploadDir = path_1.default.resolve(process.cwd(), 'src/uploads/drawings');
if (!fs_1.default.existsSync(uploadDir))
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}-${file.originalname}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        }
        else {
            cb(new Error('Only PDF files are allowed'));
        }
    },
});
// ── All routes require authentication ─────────────────────────────────────────
router.use(auth_1.authenticate);
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
router.post('/upload', upload.single('file'), drawings_controller_1.uploadDrawing);
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
router.get('/project/:projectId', drawings_controller_1.getProjectDrawings);
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
router.get('/:id', drawings_controller_1.getDrawing);
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
router.delete('/:id', drawings_controller_1.deleteDrawing);
exports.default = router;
