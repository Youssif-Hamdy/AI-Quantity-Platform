"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportBOQ = exports.getQuantities = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const prisma_1 = __importDefault(require("../../database/prisma"));
const exceljs_1 = __importDefault(require("exceljs"));
const getQuantities = async (req, res) => {
    const drawingId = req.query['drawingId'];
    if (!drawingId) {
        return res.status(400).json({ status: 'error', message: 'drawingId query param is required' });
    }
    const quantities = await prisma_1.default.quantityItem.findMany({
        where: { drawingId },
        orderBy: { createdAt: 'asc' },
    });
    res.status(200).json({ status: 'success', data: quantities });
};
exports.getQuantities = getQuantities;
const exportBOQ = async (req, res) => {
    const projectId = req.params['projectId'];
    const project = await prisma_1.default.project.findUnique({ where: { id: projectId } });
    if (!project || project.userId !== req.user.id) {
        return res.status(404).json({ status: 'error', message: 'Project not found' });
    }
    const drawings = await prisma_1.default.drawing.findMany({ where: { projectId } });
    const drawingIds = drawings.map((d) => d.id);
    const quantities = await prisma_1.default.quantityItem.findMany({
        where: { drawingId: { in: drawingIds } },
        orderBy: { createdAt: 'asc' },
    });
    // ── Build Excel ──────────────────────────────────────────────────────────────
    const workbook = new exceljs_1.default.Workbook();
    workbook.creator = 'AI Quantity Platform';
    workbook.created = new Date();
    const ws = workbook.addWorksheet('Bill of Quantities');
    // Header style
    const headerFill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F3864' },
    };
    const headerFont = { color: { argb: 'FFFFFFFF' }, bold: true, size: 12 };
    ws.columns = [
        { header: '#', key: 'num', width: 6 },
        { header: 'Item Code', key: 'code', width: 16 },
        { header: 'Description', key: 'name', width: 45 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Quantity', key: 'quantity', width: 14 },
        { header: 'Unit', key: 'unit', width: 10 },
    ];
    // Style header row
    ws.getRow(1).eachCell((cell) => {
        cell.fill = headerFill;
        cell.font = headerFont;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    ws.getRow(1).height = 24;
    // Data rows
    quantities.forEach((q, idx) => {
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
    const exportsDir = path_1.default.resolve(process.cwd(), 'src/uploads/exports');
    if (!fs_1.default.existsSync(exportsDir))
        fs_1.default.mkdirSync(exportsDir, { recursive: true });
    const fileName = `BOQ_${project.name.replace(/\s+/g, '_')}_${Date.now()}.xlsx`;
    const filePath = path_1.default.join(exportsDir, fileName);
    await workbook.xlsx.writeFile(filePath);
    const stats = fs_1.default.statSync(filePath);
    const fileSizeMb = stats.size / (1024 * 1024);
    const boqExport = await prisma_1.default.bOQExport.create({
        data: { projectId, filePath, fileSizeMb },
    });
    res.status(200).json({
        status: 'success',
        data: boqExport,
        downloadUrl: `/uploads/exports/${fileName}`,
    });
};
exports.exportBOQ = exportBOQ;
