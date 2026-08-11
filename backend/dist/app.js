"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
// ── Core Middlewares ──────────────────────────────────────────────────────────
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cors_1.default)());
// CSP: allow unpkg CDN for Swagger UI assets + unsafe-inline for its init script
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", 'https://unpkg.com', 'https://cdnjs.cloudflare.com', "'unsafe-inline'"],
            styleSrc: ["'self'", 'https://unpkg.com', 'https://cdnjs.cloudflare.com', "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'https:'],
            fontSrc: ["'self'", 'https:', 'data:'],
            workerSrc: ["'self'", 'blob:'],
        },
    },
}));
app.use((0, morgan_1.default)('dev'));
app.use((0, compression_1.default)());
// ── Static Files (serve uploaded files & BOQ exports) ─────────────────────────
app.use('/uploads', express_1.default.static(path_1.default.join(process.cwd(), 'src/uploads')));
// ── Swagger UI ────────────────────────────────────────────────────────────────
const swagger_1 = require("./config/swagger");
(0, swagger_1.setupSwagger)(app);
// ── API Routes ────────────────────────────────────────────────────────────────
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const projects_routes_1 = __importDefault(require("./modules/projects/projects.routes"));
const drawings_routes_1 = __importDefault(require("./modules/drawings/drawings.routes"));
const quantities_routes_1 = __importDefault(require("./modules/quantities/quantities.routes"));
app.use('/api/auth', auth_routes_1.default);
app.use('/api/projects', projects_routes_1.default);
app.use('/api/drawings', drawings_routes_1.default);
app.use('/api/quantities', quantities_routes_1.default);
// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', message: 'API is running' });
});
// ── Global Error Handler (must be LAST) ───────────────────────────────────────
const errorHandler_1 = require("./middlewares/errorHandler");
app.use(errorHandler_1.errorHandler);
exports.default = app;
