"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const errorHandler = (err, _req, res, _next) => {
    console.error('[Error]', err);
    // Zod validation er
    if (err?.name === 'ZodError' || err?.issues) {
        return res.status(400).json({
            status: 'error',
            message: 'Validation failed',
            errors: err.issues ?? err.errors ?? [],
        });
    }
    // Prisma unique constraint
    if (err?.code === 'P2002') {
        return res.status(409).json({
            status: 'error',
            message: 'A record with this value already exists.',
        });
    }
    // Multer file size / type
    if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ status: 'error', message: 'File too large (max 50 MB)' });
    }
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || 'Internal Server Error';
    res.status(statusCode).json({ status: 'error', message });
};
exports.errorHandler = errorHandler;
