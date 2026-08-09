import { Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import prisma from '../../database/prisma';
import { AuthRequest } from '../../middlewares/auth';
import { drawingQueue } from '../../services/queue';

// ── Upload Drawing ────────────────────────────────────────────────────────────
export const uploadDrawing = async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ status: 'error', message: 'No file uploaded' });
  }

  const { projectId, drawingType } = req.body;

  // Verify project belongs to user
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: req.user.id },
  });
  if (!project) {
    return res.status(404).json({ status: 'error', message: 'Project not found' });
  }

  const filePath = path.resolve(req.file.path);
  const fileSizeMb = req.file.size / (1024 * 1024);

  // Compute SHA256 hash of file
  const fileBuffer = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // Normalize drawingType: default to UNKNOWN
  const normalizedType = (['ARCHITECTURAL', 'CIVIL', 'MIXED'] as const).includes(
    (drawingType || '').toUpperCase()
  )
    ? (drawingType.toUpperCase() as 'ARCHITECTURAL' | 'CIVIL' | 'MIXED')
    : 'UNKNOWN';

  // Create Drawing record in DB
  const drawing = await prisma.drawing.create({
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
  const pythonDrawingType =
    normalizedType === 'UNKNOWN' ? 'architectural' : normalizedType.toLowerCase();

  await drawingQueue.add(
    'process-drawing',
    {
      drawingId: drawing.id,
      filePath,
      drawingType: pythonDrawingType,
    },
    {
      attempts: 2,
      backoff: { type: 'fixed', delay: 5000 },
    }
  );

  console.log(`[Upload] Drawing ${drawing.id} queued for processing`);

  res.status(201).json({
    status: 'success',
    message: 'Drawing uploaded and queued for AI processing',
    data: drawing,
  });
};

// ── Get Drawing by ID ─────────────────────────────────────────────────────────
export const getDrawing = async (req: AuthRequest, res: Response) => {
  const id = req.params['id'] as string;

  const drawing = await prisma.drawing.findUnique({
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
  const project = await prisma.project.findFirst({
    where: { id: drawing.projectId, userId: req.user.id },
  });
  if (!project) {
    return res.status(403).json({ status: 'error', message: 'Access denied' });
  }

  res.status(200).json({ status: 'success', data: drawing });
};

// ── Get All Drawings for a Project ───────────────────────────────────────────
export const getProjectDrawings = async (req: AuthRequest, res: Response) => {
  const projectId = req.params['projectId'] as string;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: req.user.id },
  });
  if (!project) {
    return res.status(404).json({ status: 'error', message: 'Project not found' });
  }

  const drawings = await prisma.drawing.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json({ status: 'success', data: drawings });
};

// ── Delete Drawing ─────────────────────────────────────────────────────────────
export const deleteDrawing = async (req: AuthRequest, res: Response) => {
  const id = req.params['id'] as string;

  const drawing = await prisma.drawing.findUnique({ where: { id } });
  if (!drawing) {
    return res.status(404).json({ status: 'error', message: 'Drawing not found' });
  }

  const project = await prisma.project.findFirst({
    where: { id: drawing.projectId, userId: req.user.id },
  });
  if (!project) {
    return res.status(403).json({ status: 'error', message: 'Access denied' });
  }

  // Remove file from disk
  try {
    if (fs.existsSync(drawing.originalPath)) {
      fs.unlinkSync(drawing.originalPath);
    }
  } catch (e) {
    console.warn('[DeleteDrawing] Could not delete file from disk:', e);
  }

  await prisma.drawing.delete({ where: { id } });

  res.status(200).json({ status: 'success', message: 'Drawing deleted' });
};
