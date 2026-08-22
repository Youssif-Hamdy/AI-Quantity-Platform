"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWorker = exports.drawingQueue = void 0;
require("dotenv/config");
const bullmq_1 = require("bullmq");
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const prisma_1 = __importDefault(require("../database/prisma"));
const socketService_1 = require("./socketService");
// ── Redis Connection ──────────────────────────────────────────────────────────
// Upstash Redis uses a full TLS URL — parse it here
function getRedisConnection() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
        const url = new URL(redisUrl);
        return {
            host: url.hostname,
            port: parseInt(url.port || '6379'),
            password: url.password || undefined,
            username: url.username || undefined,
            tls: url.protocol === 'rediss:' ? {} : undefined,
        };
    }
    return {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379'),
    };
}
const redisConnection = getRedisConnection();
exports.drawingQueue = new bullmq_1.Queue('drawing-processing', {
    connection: redisConnection,
});
exports.drawingQueue.on('error', (err) => {
    console.error('[Queue Error]', err.message);
});
// ── AI Engine Path ────────────────────────────────────────────────────────────
const aiEnginePath = path_1.default.resolve(__dirname, '../../../ai-engine/main.py');
// ── Helper: emit socket event safely ─────────────────────────────────────────
function emitStatusChange(drawingId, status, errorMessage) {
    try {
        const io = (0, socketService_1.getSocket)();
        io.emit('drawing:status_changed', { drawingId, status, errorMessage });
    }
    catch (_) {
        // Socket may not be initialized in tests — ignore
    }
}
// ── Worker ───────────────────────────────────────────────────────────────────
const startWorker = () => {
    const worker = new bullmq_1.Worker('drawing-processing', async (job) => {
        const { drawingId, filePath, drawingType } = job.data;
        console.log(`[Worker] Processing drawing ${drawingId}`);
        console.log(`[Worker] PDF path   : ${filePath}`);
        console.log(`[Worker] Type       : ${drawingType}`);
        // ── Step 1: Mark as ANALYZING ──────────────────────────────────────────
        await prisma_1.default.drawing.update({
            where: { id: drawingId },
            data: { status: 'ANALYZING' },
        });
        emitStatusChange(drawingId, 'ANALYZING');
        return new Promise((resolve, reject) => {
            // Pass the drawing type as arg so detector.py skips the interactive
            // input() prompt and uses it directly.
            const pythonProcess = (0, child_process_1.spawn)('python', [aiEnginePath, filePath, drawingType], {
                cwd: path_1.default.dirname(aiEnginePath),
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
            });
            let stdout = '';
            let stderr = '';
            pythonProcess.stdout.on('data', (d) => {
                const chunk = d.toString();
                stdout += chunk;
                process.stdout.write(`[AI] ${chunk}`);
            });
            pythonProcess.stderr.on('data', (d) => {
                const chunk = d.toString();
                stderr += chunk;
                process.stderr.write(`[AI ERR] ${chunk}`);
            });
            pythonProcess.on('close', async (code) => {
                if (code !== 0) {
                    const msg = `Python process exited with code ${code}. ${stderr.trim()}`;
                    console.error(`[Worker] FAILED: ${msg}`);
                    await prisma_1.default.drawing.update({
                        where: { id: drawingId },
                        data: { status: 'FAILED', errorMessage: msg },
                    });
                    emitStatusChange(drawingId, 'FAILED', msg);
                    return reject(new Error(msg));
                }
                // ── Step 2: Parse JSON output ─────────────────────────────────────
                try {
                    const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
                    const outputDir = path_1.default.join(path_1.default.dirname(aiEnginePath), 'output');
                    // Try reading quantity.json or quantities.json
                    let quantityItems = [];
                    let quantitiesFile = path_1.default.join(outputDir, 'quantity.json');
                    try {
                        let raw = '';
                        try {
                            raw = await fs.readFile(quantitiesFile, 'utf-8');
                        }
                        catch {
                            quantitiesFile = path_1.default.join(outputDir, 'quantities.json');
                            raw = await fs.readFile(quantitiesFile, 'utf-8');
                        }
                        const parsed = JSON.parse(raw);
                        quantityItems = parsed.items ?? [];
                    }
                    catch {
                        const match = stdout.match(/\{[\s\S]*"items"[\s\S]*\}/);
                        if (match) {
                            const parsed = JSON.parse(match[0]);
                            quantityItems = parsed.items ?? [];
                        }
                    }
                    // ── Step 3: Parse vision.json to save spatial elements with box2d ──
                    const visionFile = path_1.default.join(outputDir, 'vision.json');
                    try {
                        const visionRaw = await fs.readFile(visionFile, 'utf-8');
                        const visionParsed = JSON.parse(visionRaw);
                        // Ensure DrawingPage exists
                        const page = await prisma_1.default.drawingPage.create({
                            data: {
                                drawingId,
                                pageNumber: 1,
                                imageUrl: `/uploads/${path_1.default.basename(filePath)}.png`,
                                dpi: 300,
                            },
                        });
                        const elementsToCreate = [];
                        // Architectural Rooms
                        const rooms = visionParsed.rooms || visionParsed.architectural?.rooms || [];
                        for (const r of rooms) {
                            if (r.box_2d && Array.isArray(r.box_2d)) {
                                elementsToCreate.push({
                                    pageId: page.id,
                                    category: 'ROOM',
                                    name: r.name || 'Room',
                                    box2d: r.box_2d,
                                    area: r.area || null,
                                    perimeter: r.perimeter || null,
                                    metadata: { walls_area: r.walls_area, doors_count: r.doors?.length || 0 },
                                });
                            }
                        }
                        // Civil Columns
                        const cols = visionParsed.columns || visionParsed.civil?.columns || [];
                        for (const c of cols) {
                            if (c.box_2d && Array.isArray(c.box_2d)) {
                                elementsToCreate.push({
                                    pageId: page.id,
                                    category: 'COLUMN',
                                    name: c.label || 'Column',
                                    box2d: c.box_2d,
                                    volume: c.volume || null,
                                });
                            }
                        }
                        // Beams
                        const beams = visionParsed.beams || visionParsed.civil?.beams || [];
                        for (const b of beams) {
                            if (b.box_2d && Array.isArray(b.box_2d)) {
                                elementsToCreate.push({
                                    pageId: page.id,
                                    category: 'BEAM',
                                    name: b.label || 'Beam',
                                    box2d: b.box_2d,
                                    volume: b.volume || null,
                                });
                            }
                        }
                        // Slabs
                        const slabs = visionParsed.slabs || visionParsed.civil?.slabs || [];
                        for (const s of slabs) {
                            if (s.box_2d && Array.isArray(s.box_2d)) {
                                elementsToCreate.push({
                                    pageId: page.id,
                                    category: 'SLAB',
                                    name: s.label || 'Slab',
                                    box2d: s.box_2d,
                                    area: s.area || null,
                                    volume: s.volume || null,
                                });
                            }
                        }
                        if (elementsToCreate.length > 0) {
                            await prisma_1.default.drawingElement.createMany({
                                data: elementsToCreate,
                            });
                            console.log(`[Worker] Saved ${elementsToCreate.length} spatial element(s) with box2d coordinates to DB`);
                        }
                    }
                    catch (vErr) {
                        console.warn(`[Worker] Vision JSON parsing warning:`, vErr.message);
                    }
                    // ── Step 4: Save QuantityItems to DB ────────────────────────────
                    if (quantityItems.length > 0) {
                        await prisma_1.default.quantityItem.createMany({
                            data: quantityItems.map((item, idx) => ({
                                drawingId,
                                code: `BOQ-${String(idx + 1).padStart(3, '0')}`,
                                name: item.name,
                                category: drawingType === 'civil' ? 'Structural' : 'Finishes',
                                quantity: item.quantity,
                                unit: item.unit,
                            })),
                        });
                        console.log(`[Worker] Saved ${quantityItems.length} quantity item(s) to DB`);
                    }
                    // ── Step 4: Mark COMPLETED ───────────────────────────────────────
                    await prisma_1.default.drawing.update({
                        where: { id: drawingId },
                        data: {
                            status: 'COMPLETED',
                            drawingType: drawingType.toUpperCase(),
                        },
                    });
                    emitStatusChange(drawingId, 'COMPLETED');
                    console.log(`[Worker] Drawing ${drawingId} → COMPLETED`);
                    resolve();
                }
                catch (err) {
                    const msg = `Failed to save results: ${err.message}`;
                    await prisma_1.default.drawing.update({
                        where: { id: drawingId },
                        data: { status: 'FAILED', errorMessage: msg },
                    });
                    emitStatusChange(drawingId, 'FAILED', msg);
                    reject(err);
                }
            });
        });
    }, { connection: redisConnection });
    worker.on('failed', (job, err) => {
        console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
    });
    worker.on('completed', (job) => {
        console.log(`[Worker] Job ${job?.id} completed`);
    });
    return worker;
};
exports.startWorker = startWorker;
