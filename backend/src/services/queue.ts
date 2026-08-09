import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import { spawn } from 'child_process';
import path from 'path';
import prisma from '../database/prisma';
import { getSocket } from './socketService';

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

export const drawingQueue = new Queue('drawing-processing', {
  connection: redisConnection,
});

drawingQueue.on('error', (err) => {
  console.error('[Queue Error]', err.message);
});

// ── AI Engine Path ────────────────────────────────────────────────────────────
const aiEnginePath = path.resolve(__dirname, '../../../ai-engine/main.py');

// ── Helper: emit socket event safely ─────────────────────────────────────────
function emitStatusChange(drawingId: string, status: string, errorMessage?: string) {
  try {
    const io = getSocket();
    io.emit('drawing:status_changed', { drawingId, status, errorMessage });
  } catch (_) {
    // Socket may not be initialized in tests — ignore
  }
}

// ── Worker ───────────────────────────────────────────────────────────────────
export const startWorker = () => {
  const worker = new Worker(
    'drawing-processing',
    async (job) => {
      const { drawingId, filePath, drawingType } = job.data as {
        drawingId: string;
        filePath: string;
        drawingType: string;   // 'architectural' | 'civil' | 'mixed'
      };

      console.log(`[Worker] Processing drawing ${drawingId}`);
      console.log(`[Worker] PDF path   : ${filePath}`);
      console.log(`[Worker] Type       : ${drawingType}`);

      // ── Step 1: Mark as ANALYZING ──────────────────────────────────────────
      await prisma.drawing.update({
        where: { id: drawingId },
        data: { status: 'ANALYZING' },
      });
      emitStatusChange(drawingId, 'ANALYZING');

      return new Promise<void>((resolve, reject) => {
        // Pass the drawing type as arg so detector.py skips the interactive
        // input() prompt and uses it directly.
        const pythonProcess = spawn('python', [aiEnginePath, filePath, drawingType], {
          cwd: path.dirname(aiEnginePath),
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        });

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (d: Buffer) => {
          const chunk = d.toString();
          stdout += chunk;
          process.stdout.write(`[AI] ${chunk}`);
        });

        pythonProcess.stderr.on('data', (d: Buffer) => {
          const chunk = d.toString();
          stderr += chunk;
          process.stderr.write(`[AI ERR] ${chunk}`);
        });

        pythonProcess.on('close', async (code) => {
          if (code !== 0) {
            const msg = `Python process exited with code ${code}. ${stderr.trim()}`;
            console.error(`[Worker] FAILED: ${msg}`);
            await prisma.drawing.update({
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
            const quantitiesFile = path.join(path.dirname(aiEnginePath), 'output', 'quantity.json');
            const fs = await import('fs/promises');

            let quantityItems: Array<{ name: string; quantity: number; unit: string }> = [];

            try {
              const raw = await fs.readFile(quantitiesFile, 'utf-8');
              const parsed = JSON.parse(raw);
              // QuantityResult shape: { drawing_type, items: [{name, quantity, unit}] }
              quantityItems = parsed.items ?? [];
            } catch {
              // Fallback: try to parse JSON from stdout
              const match = stdout.match(/\{[\s\S]*"items"[\s\S]*\}/);
              if (match) {
                const parsed = JSON.parse(match[0]);
                quantityItems = parsed.items ?? [];
              }
            }

            // ── Step 3: Save QuantityItems to DB ────────────────────────────
            if (quantityItems.length > 0) {
              await prisma.quantityItem.createMany({
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
            await prisma.drawing.update({
              where: { id: drawingId },
              data: {
                status: 'COMPLETED',
                drawingType: drawingType.toUpperCase() as any,
              },
            });
            emitStatusChange(drawingId, 'COMPLETED');

            console.log(`[Worker] Drawing ${drawingId} → COMPLETED`);
            resolve();
          } catch (err: any) {
            const msg = `Failed to save results: ${err.message}`;
            await prisma.drawing.update({
              where: { id: drawingId },
              data: { status: 'FAILED', errorMessage: msg },
            });
            emitStatusChange(drawingId, 'FAILED', msg);
            reject(err);
          }
        });
      });
    },
    { connection: redisConnection }
  );

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
  });

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job?.id} completed`);
  });

  return worker;
};
