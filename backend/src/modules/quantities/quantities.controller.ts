import { Response } from 'express';
import prisma from '../../database/prisma';
import { AuthRequest } from '../../middlewares/auth';
import ExcelJS from 'exceljs';

type DrawingType = Awaited<ReturnType<typeof prisma.drawing.findMany>>[0];
type QuantityItemType = Awaited<ReturnType<typeof prisma.quantityItem.findMany>>[0];

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

export const createManualQuantity = async (req: AuthRequest, res: Response) => {
  const { drawingId, type, name, category, points, value, unit, unitPrice, color } = req.body;

  if (!drawingId || !name || value === undefined) {
    return res.status(400).json({ status: 'error', message: 'drawingId, name, and value are required' });
  }

  const drawing = await prisma.drawing.findUnique({ where: { id: drawingId } });
  if (!drawing) {
    return res.status(404).json({ status: 'error', message: 'Drawing not found' });
  }

  const price = typeof unitPrice === 'number' ? unitPrice : 180;
  const total = (typeof value === 'number' ? value : 0) * price;

  const item = await prisma.quantityItem.create({
    data: {
      drawingId,
      code: `MANUAL-${Date.now().toString().slice(-4)}`,
      name,
      category: category || 'Custom Takeoff',
      quantity: value,
      unit: unit || (type === 'AREA' ? 'm²' : type === 'LENGTH' ? 'm' : 'pcs'),
      unitPrice: price,
      totalPrice: total,
      isManual: true,
      metadata: { points, color, type },
    },
  });

  res.status(201).json({ status: 'success', data: item });
};

export const exportBOQ = async (req: AuthRequest, res: Response) => {
  const projectId = req.params['projectId'] as string;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== req.user!.id) {
    return res.status(404).json({ status: 'error', message: 'Project not found' });
  }

  const drawings = await prisma.drawing.findMany({ where: { projectId } });
  const drawingIds = drawings.map((d: DrawingType) => d.id);

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
    { header: '#',           key: 'num',        width: 6  },
    { header: 'Item Code',   key: 'code',       width: 16 },
    { header: 'Description', key: 'name',       width: 45 },
    { header: 'Category',    key: 'category',   width: 20 },
    { header: 'Quantity',    key: 'quantity',   width: 14 },
    { header: 'Unit',        key: 'unit',       width: 10 },
    { header: 'Unit Rate ($)', key: 'unitPrice', width: 16 },
    { header: 'Total Price ($)', key: 'totalPrice', width: 18 },
  ];

  // Style header row
  ws.getRow(1).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  ws.getRow(1).height = 24;

  let grandTotal = 0;

  // Data rows
  quantities.forEach((q: QuantityItemType, idx: number) => {
    const price = q.unitPrice ?? 250;
    const lineTotal = q.totalPrice ?? (q.quantity * price);
    grandTotal += lineTotal;

    const row = ws.addRow({
      num: idx + 1,
      code: q.code ?? 'N/A',
      name: q.isManual ? `${q.name} (Manual)` : q.name,
      category: q.category,
      quantity: q.quantity,
      unit: q.unit,
      unitPrice: price,
      totalPrice: lineTotal,
    });

    // Alternate row shading
    if (idx % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F7' } };
      });
    }

    // Right-align numbers
    row.getCell('quantity').alignment = { horizontal: 'right' };
    row.getCell('unitPrice').alignment = { horizontal: 'right' };
    row.getCell('totalPrice').alignment = { horizontal: 'right' };
    row.getCell('num').alignment = { horizontal: 'center' };
  });

  // Totals row
  const totalRow = ws.addRow({
    name: 'GRAND TOTAL TENDER COST',
    quantity: quantities.length,
    totalPrice: grandTotal,
  });
  totalRow.font = { bold: true, size: 12 };

  // ── Stream file directly to response ──────────────────────────────────────────
  const fileName = `BOQ_${project.name.replace(/\s+/g, '_')}_${Date.now()}.xlsx`;
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  await workbook.xlsx.write(res);
  res.end();
};
