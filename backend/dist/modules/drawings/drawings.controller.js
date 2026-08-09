"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDrawing = exports.getProjectDrawings = exports.getDrawing = exports.uploadDrawing = void 0;
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const prisma_1 = __importDefault(require("../../database/prisma"));
const queue_1 = require("../../services/queue");
// ── Upload Drawing ────────────────────────────────────────────────────────────
const uploadDrawing = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    }
    const { projectId, drawingType } = req.body;
    // Verify project belongs to user
    const project = await prisma_1.default.project.findFirst({
        where: { id: projectId, userId: req.user.id },
    });
    if (!project) {
        return res.status(404).json({ status: 'error', message: 'Project not found' });
    }
    const filePath = path_1.default.resolve(req.file.path);
    const fileSizeMb = req.file.size / (1024 * 1024);
    // Compute SHA256 hash of file
    const fileBuffer = fs_1.default.readFileSync(filePath);
    const sha256 = crypto_1.default.createHash('sha256').update(fileBuffer).digest('hex');
    // Normalize drawingType: default to UNKNOWN
    const normalizedType = ['ARCHITECTURAL', 'CIVIL', 'MIXED'].includes((drawingType || '').toUpperCase())
        ? drawingType.toUpperCase()
        : 'UNKNOWN';
    // Create Drawing record in DB
    const drawing = await prisma_1.default.drawing.create({
        data: {
            projectId,
            fileName: req.file.originalname,
            originalPath: filePath,
            fileSizeMb,
            mimeType: req.file.mimetype,
            sha256,
            status: 'PENDING',
            drawingType: normalizedType,
        },
    });
    // Add job to BullMQ queue
    // drawingType passed to Python so it skips interactive prompt
    const pythonDrawingType = normalizedType === 'UNKNOWN' ? 'architectural' : normalizedType.toLowerCase();
    await queue_1.drawingQueue.add('process-drawing', {
        drawingId: drawing.id,
        filePath,
        drawingType: pythonDrawingType,
    }, {
        attempts: 2,
        backoff: { type: 'fixed', delay: 5000 },
    });
    console.log(`[Upload] Drawing ${drawing.id} queued for processing`);
    res.status(201).json({
        status: 'success',
        message: 'Drawing uploaded and queued for AI processing',
        data: drawing,
    });
};
exports.uploadDrawing = uploadDrawing;
// ── Get Drawing by ID ─────────────────────────────────────────────────────────
const getDrawing = async (req, res) => {
    const id = req.params['id'];
    const drawing = await prisma_1.default.drawing.findUnique({
        where: { id },
        include: {
            pages: {
                include: { elements: true },
            },
            quantities: true,
        },
    });
    if (!drawing) {
        return res.status(404).json({ status: 'error', message: 'Drawing not found' });
    }
    // Verify ownership via project
    const project = await prisma_1.default.project.findFirst({
        where: { id: drawing.projectId, userId: req.user.id },
    });
    if (!project) {
        return res.status(403).json({ status: 'error', message: 'Access denied' });
    }
    res.status(200).json({ status: 'success', data: drawing });
};
exports.getDrawing = getDrawing;
// ── Get All Drawings for a Project ───────────────────────────────────────────
const getProjectDrawings = async (req, res) => {
    const projectId = req.params['projectId'];
    const project = await prisma_1.default.project.findFirst({
        where: { id: projectId, userId: req.user.id },
    });
    if (!project) {
        return res.status(404).json({ status: 'error', message: 'Project not found' });
    }
    const drawings = await prisma_1.default.drawing.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ status: 'success', data: drawings });
};
exports.getProjectDrawings = getProjectDrawings;
// ── Delete Drawing ─────────────────────────────────────────────────────────────
const deleteDrawing = async (req, res) => {
    const id = req.params['id'];
    const drawing = await prisma_1.default.drawing.findUnique({ where: { id } });
    if (!drawing) {
        return res.status(404).json({ status: 'error', message: 'Drawing not found' });
    }
    const project = await prisma_1.default.project.findFirst({
        where: { id: drawing.projectId, userId: req.user.id },
    });
    if (!project) {
        return res.status(403).json({ status: 'error', message: 'Access denied' });
    }
    // Remove file from disk
    try {
        if (fs_1.default.existsSync(drawing.originalPath)) {
            fs_1.default.unlinkSync(drawing.originalPath);
        }
    }
    catch (e) {
        console.warn('[DeleteDrawing] Could not delete file from disk:', e);
    }
    await prisma_1.default.drawing.delete({ where: { id } });
    res.status(200).json({ status: 'success', message: 'Drawing deleted' });
};
exports.deleteDrawing = deleteDrawing;
