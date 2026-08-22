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
<<<<<<< HEAD
            const quantitiesFile = path.join(jobDir, 'output', 'quantity.json');
=======
            const fs = await import('fs/promises');
            const outputDir = path.join(path.dirname(aiEnginePath), 'output');
            
            // Try reading quantity.json or quantities.json
>>>>>>> 0af4b7ca6d930092ac5612f983684d52058d043f
            let quantityItems: Array<{ name: string; quantity: number; unit: string }> = [];
            let quantitiesFile = path.join(outputDir, 'quantity.json');

            try {
              let raw = '';
              try {
                raw = await fs.readFile(quantitiesFile, 'utf-8');
              } catch {
                quantitiesFile = path.join(outputDir, 'quantities.json');
                raw = await fs.readFile(quantitiesFile, 'utf-8');
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

            // ── Step 3: Parse vision.json to save spatial elements with box2d ──
            const visionFile = path.join(outputDir, 'vision.json');
            try {
              const visionRaw = await fs.readFile(visionFile, 'utf-8');
              const visionParsed = JSON.parse(visionRaw);

              // Ensure DrawingPage exists
              const page = await prisma.drawingPage.create({
                data: {
                  drawingId,
                  pageNumber: 1,
                  imageUrl: `/uploads/${path.basename(filePath)}.png`,
                  dpi: 300,
                },
              });

              const elementsToCreate: any[] = [];

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
                await prisma.drawingElement.createMany({
                  data: elementsToCreate,
                });
                console.log(`[Worker] Saved ${elementsToCreate.length} spatial element(s) with box2d coordinates to DB`);
              }
            } catch (vErr: any) {
              console.warn(`[Worker] Vision JSON parsing warning:`, vErr.message);
            }

            // ── Step 4: Save QuantityItems to DB ────────────────────────────
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
               const firstPage = pageRecords.find(p => p.pageNumber === 1) || pageRecords[0];
               
               const elementsToInsert = canvasData.elements.map((el: any) => {
                 let category = 'ROOM';
                 if (el.type === 'column') category = 'COLUMN';
                 if (el.type === 'beam') category = 'BEAM';
                 if (el.type === 'slab') category = 'SLAB';
                 if (el.type === 'door') category = 'DOOR';
                 if (el.type === 'window') category = 'WINDOW';

                 const metadata = { ...el.metrics, color: el.color, id: el.id };
                 let box2d: number[] = [0, 0, 0, 0];
                 if (el.polygon && Array.isArray(el.polygon) && el.polygon.length > 0) {
                     const xs = el.polygon.map((p: any) => p.x);
                     const ys = el.polygon.map((p: any) => p.y);
                     box2d = [Math.round(Math.min(...ys)), Math.round(Math.min(...xs)), Math.round(Math.max(...ys)), Math.round(Math.max(...xs))];
                 } else if (el.position || el.center || el.start) {
                     const pt = el.position || el.center || el.start;
                     box2d = [Math.round(pt.y - 10), Math.round(pt.x - 10), Math.round(pt.y + 10), Math.round(pt.x + 10)];
                 }

                 return {
                   pageId: firstPage.id,
                   category: category as any,
                   name: el.name || el.label || el.type,
                   polygon: el.polygon || null,
                   box2d: box2d,
                   metadata: metadata
                 };
               });

               await prisma.drawingElement.createMany({
                 data: elementsToInsert
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
