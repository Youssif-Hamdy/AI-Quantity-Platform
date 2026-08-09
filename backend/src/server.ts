import 'dotenv/config';
import app from './app';
import http from 'http';
import { initSocket } from './services/socketService';
import { startWorker } from './services/queue';

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    const server = http.createServer(app);

    // Initialize Socket.io
    initSocket(server);

    // Start BullMQ Worker for AI processing
    const worker = startWorker();
    console.log('[Worker] BullMQ drawing-processing worker started');

    server.listen(PORT, () => {
      console.log(`[Server] Running on http://localhost:${PORT}`);
      console.log(`[Docs]   Swagger UI → http://localhost:${PORT}/api-docs`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\n[Server] Shutting down...');
      await worker.close();
      server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
};

startServer();
