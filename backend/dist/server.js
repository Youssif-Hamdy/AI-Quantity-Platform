"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = __importDefault(require("./app"));
const http_1 = __importDefault(require("http"));
const socketService_1 = require("./services/socketService");
const queue_1 = require("./services/queue");
const PORT = process.env.PORT || 5000;
const startServer = async () => {
    try {
        const server = http_1.default.createServer(app_1.default);
        // Initialize Socket.io
        (0, socketService_1.initSocket)(server);
        // Start BullMQ Worker for AI processing
        const worker = (0, queue_1.startWorker)();
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
    }
    catch (error) {
        console.error('[Server] Failed to start:', error);
        process.exit(1);
    }
};
startServer();
