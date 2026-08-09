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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
                env: { ...process.env },
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
                    // The AI engine writes quantities.json to output/ dir.
                    // Also try to parse inline JSON from stdout as a fallback.
                    const quantitiesFile = path_1.default.join(path_1.default.dirname(aiEnginePath), 'output', 'quantity.json');
                    const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
                    let quantityItems = [];
                    try {
                        const raw = await fs.readFile(quantitiesFile, 'utf-8');
                        const parsed = JSON.parse(raw);
                        // QuantityResult shape: { drawing_type, items: [{name, quantity, unit}] }
                        quantityItems = parsed.items ?? [];
                    }
                    catch {
                        // Fallback: try to parse JSON from stdout
                        const match = stdout.match(/\{[\s\S]*"items"[\s\S]*\}/);
                        if (match) {
                            const parsed = JSON.parse(match[0]);
                            quantityItems = parsed.items ?? [];
                        }
                    }
                    // ── Step 3: Save QuantityItems to DB ────────────────────────────
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
