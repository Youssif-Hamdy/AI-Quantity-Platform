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

      // Create unique JOB_DIR
      const fs = await import('fs/promises');
      const crypto = await import('crypto');
      const jobDir = path.join(path.dirname(aiEnginePath), '.jobs', crypto.randomUUID());
      await fs.mkdir(jobDir, { recursive: true });

      return new Promise<void>((resolve, reject) => {
        // Pass the drawing type as arg so detector.py skips the interactive prompt.
        const pythonProcess = spawn('python', [aiEnginePath, filePath, drawingType], {
          cwd: path.dirname(aiEnginePath),
          env: { ...process.env, PYTHONIOENCODING: 'utf-8', JOB_DIR: jobDir },
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
          const cleanup = async () => {
            try {
              await fs.rm(jobDir, { recursive: true, force: true });
            } catch (e) {
              console.error(`[Worker] Failed to cleanup jobDir ${jobDir}:`, e);
            }
          };

          if (code !== 0) {
            const msg = `Python process exited with code ${code}. ${stderr.trim()}`;
            console.error(`[Worker] FAILED: ${msg}`);
            await prisma.drawing.update({
              where: { id: drawingId },
              data: { status: 'FAILED', errorMessage: msg },
            });
            emitStatusChange(drawingId, 'FAILED', msg);
            await cleanup();
            return reject(new Error(msg));
          }

          // ── Step 2: Parse JSON output ─────────────────────────────────────
          try {
            const quantitiesFile = path.join(jobDir, 'output', 'quantity.json');
            let quantityItems: Array<{ name: string; quantity: number; unit: string }> = [];

            try {
              let raw = '';
              try {
                raw = await fs.readFile(quantitiesFile, 'utf-8');
              } catch {
                const altFile = path.join(jobDir, 'output', 'quantities.json');
                raw = await fs.readFile(altFile, 'utf-8');
              }
              const parsed = JSON.parse(raw);
              quantityItems = parsed.items ?? [];
            } catch {
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

            // ── Step 4: Handle Canvas JSON and Images ─────────────────────────
            const canvasFile = path.join(jobDir, 'output', 'canvas.json');
            let canvasData: any = null;
            try {
              const canvasRaw = await fs.readFile(canvasFile, 'utf-8');
              canvasData = JSON.parse(canvasRaw);
            } catch (err) {
              console.warn(`[Worker] Could not read canvas.json`);
            }

            const tempPagesDir = path.join(jobDir, 'temp', 'pages');
            const uploadDir = path.join(process.cwd(), 'src/uploads/drawings', drawingId);
            await fs.mkdir(uploadDir, { recursive: true });

            let pageRecords: any[] = [];
            try {
              const files = await fs.readdir(tempPagesDir);
              for (const file of files) {
                if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')) {
                  const match = file.match(/page_(\d+)/);
                  const pageNum = match ? parseInt(match[1]) : 1;
                  
                  const srcPath = path.join(tempPagesDir, file);
                  const destFileName = `page_${pageNum}${path.extname(file)}`;
                  const destPath = path.join(uploadDir, destFileName);
                  
                  await fs.copyFile(srcPath, destPath);
                  
                  const page = await prisma.drawingPage.create({
                    data: {
                      drawingId,
                      pageNumber: pageNum,
                      imageUrl: `/uploads/drawings/${drawingId}/${destFileName}`,
                      widthPx: canvasData?.width || null,
                      heightPx: canvasData?.height || null,
                      scaleMeters: canvasData?.scale_ratio || null
                    }
                  });
                  pageRecords.push(page);
                }
              }
            } catch (err) {
              console.warn(`[Worker] Could not process images from temp/pages`);
            }

            if (canvasData && canvasData.elements && pageRecords.length > 0) {
               const firstPage = pageRecords.find((p: any) => p.pageNumber === 1) || pageRecords[0];
               
               const elementsToInsert = canvasData.elements.map((el: any) => {
                 // ── Category mapping ──────────────────────────────────────
                 let category = 'ROOM';
                 if (el.type === 'wall')   category = 'WALL';
                 if (el.type === 'column') category = 'COLUMN';
                 if (el.type === 'beam')   category = 'BEAM';
                 if (el.type === 'slab')   category = 'SLAB';
                 if (el.type === 'door')   category = 'DOOR';
                 if (el.type === 'window') category = 'WINDOW';

                 // ── Metric extraction ─────────────────────────────────────
                 const metrics = el.metrics || {};
                 const metadata = { ...metrics, color: el.color, id: el.id };

                 // Parse area (e.g. "42.50 m²" → 42.50)
                 let area: number | null = null;
                 const areaStr = metrics.area || '';
                 if (areaStr) {
                   const m = areaStr.match(/[\d.]+/);
                   if (m) area = parseFloat(m[0]);
                 }

                 // Parse length for beams/walls
                 let length: number | null = null;
                 const lenStr = metrics.length || '';
                 if (lenStr) {
                   const m = lenStr.match(/[\d.]+/);
                   if (m) length = parseFloat(m[0]);
                 }

                 // ── box_2d — use pre-computed field if available ───────────
                 let box2d: number[] = [0, 0, 0, 0];
                 if (el.box_2d && Array.isArray(el.box_2d) && el.box_2d.length === 4) {
                   box2d = el.box_2d;
                 } else if (el.polygon && Array.isArray(el.polygon) && el.polygon.length > 0) {
                   const xs = el.polygon.map((p: any) => p.x);
                   const ys = el.polygon.map((p: any) => p.y);
                   box2d = [Math.round(Math.min(...ys)), Math.round(Math.min(...xs)),
                             Math.round(Math.max(...ys)), Math.round(Math.max(...xs))];
                 } else if (el.center) {
                   const cx = Math.round(el.center.x > 1.0 ? el.center.x : el.center.x * 1000);
                   const cy = Math.round(el.center.y > 1.0 ? el.center.y : el.center.y * 1000);
                   box2d = [cy - 20, cx - 20, cy + 20, cx + 20];
                 } else if (el.start && el.end) {
                   const pts = [el.start, el.end];
                   const xs = pts.map((p: any) => p.x > 1.0 ? p.x : p.x * 1000);
                   const ys = pts.map((p: any) => p.y > 1.0 ? p.y : p.y * 1000);
                   box2d = [Math.round(Math.min(...ys)), Math.round(Math.min(...xs)),
                             Math.round(Math.max(...ys)), Math.round(Math.max(...xs))];
                 } else if (el.position) {
                   const px = el.position.x > 1.0 ? el.position.x : el.position.x * 1000;
                   const py = el.position.y > 1.0 ? el.position.y : el.position.y * 1000;
                   box2d = [Math.round(py - 15), Math.round(px - 15),
                             Math.round(py + 15), Math.round(px + 15)];
                 }

                 return {
                   pageId:   firstPage.id,
                   category: category as any,
                   name:     el.name || el.label || el.type || 'Unknown',
                   polygon:  el.polygon || null,
                   box2d,
                   area,
                   length,
                   metadata,
                 };
               });

               await prisma.drawingElement.createMany({
                 data: elementsToInsert,
               });
               console.log(`[Worker] Saved ${elementsToInsert.length} canvas elements to DB`);
            }


            // ── Step 5: Mark COMPLETED ───────────────────────────────────────
            await prisma.drawing.update({
              where: { id: drawingId },
              data: {
                status: 'COMPLETED',
                drawingType: drawingType.toUpperCase() as any,
              },
            });
            emitStatusChange(drawingId, 'COMPLETED');

            console.log(`[Worker] Drawing ${drawingId} → COMPLETED`);
            await cleanup();
            resolve();
          } catch (err: any) {
            const msg = `Failed to save results: ${err.message}`;
            await prisma.drawing.update({
              where: { id: drawingId },
              data: { status: 'FAILED', errorMessage: msg },
            });
            emitStatusChange(drawingId, 'FAILED', msg);
            await cleanup();
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
