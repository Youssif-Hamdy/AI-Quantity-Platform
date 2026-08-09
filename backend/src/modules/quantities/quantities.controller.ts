import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import prisma from '../../database/prisma';
import { AuthRequest } from '../../middlewares/auth';
import ExcelJS from 'exceljs';
import { Drawing, QuantityItem } from '@prisma/client';

export const getQuantities = async (req: AuthRequest, res: Response) => {
  const drawingId = req.query['drawingId'] as string;

  if (!drawingId) {
    return res.status(400).json({ status: 'error', message: 'drawingId query param is required' });
  }

  const quantities = await prisma.quantityItem.findMany({
    where: { drawingId },
    orderBy: { createdAt: 'asc' },
  });

  res.status(200).json({ status: 'success', data: quantities });
};

export const exportBOQ = async (req: AuthRequest, res: Response) => {
  const projectId = req.params['projectId'] as string;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== req.user!.id) {
    return res.status(404).json({ status: 'error', message: 'Project not found' });
  }

  const drawings = await prisma.drawing.findMany({ where: { projectId } });
  const drawingIds = drawings.map((d: Drawing) => d.id);

  const quantities = await prisma.quantityItem.findMany({
    where: { drawingId: { in: drawingIds } },
    orderBy: { createdAt: 'asc' },
  });

  // ── Build Excel ──────────────────────────────────────────────────────────────
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AI Quantity Platform';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Bill of Quantities');

  // Header style
  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F3864' },
  };
  const headerFont: Partial<ExcelJS.Font> = { color: { argb: 'FFFFFFFF' }, bold: true, size: 12 };

  ws.columns = [
    { header: '#',           key: 'num',      width: 6  },
    { header: 'Item Code',   key: 'code',     width: 16 },
    { header: 'Description', key: 'name',     width: 45 },
    { header: 'Category',    key: 'category', width: 20 },
    { header: 'Quantity',    key: 'quantity', width: 14 },
    { header: 'Unit',        key: 'unit',     width: 10 },
  ];

  // Style header row
  ws.getRow(1).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  ws.getRow(1).height = 24;

  // Data rows
  quantities.forEach((q: QuantityItem, idx: number) => {
    const row = ws.addRow({
      num: idx + 1,
      code: q.code ?? 'N/A',
      name: q.name,
      category: q.category,
      quantity: q.quantity,
      unit: q.unit,
    });

    // Alternate row shading
    if (idx % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F7' } };
      });
    }

    // Right-align numbers
    row.getCell('quantity').alignment = { horizontal: 'right' };
    row.getCell('num').alignment = { horizontal: 'center' };
  });

  // Totals row
  const totalRow = ws.addRow({ name: 'TOTAL ITEMS', quantity: quantities.length });
  totalRow.font = { bold: true };

  // ── Save file ────────────────────────────────────────────────────────────────
  const exportsDir = path.resolve(process.cwd(), 'src/uploads/exports');
  if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

  const fileName = `BOQ_${project.name.replace(/\s+/g, '_')}_${Date.now()}.xlsx`;
  const filePath = path.join(exportsDir, fileName);
  await workbook.xlsx.writeFile(filePath);

  const stats = fs.statSync(filePath);
  const fileSizeMb = stats.size / (1024 * 1024);

  const boqExport = await prisma.bOQExport.create({
    data: { projectId, filePath, fileSizeMb },
  });

  res.status(200).json({
    status: 'success',
    data: boqExport,
    downloadUrl: `/uploads/exports/${fileName}`,
  });
};
