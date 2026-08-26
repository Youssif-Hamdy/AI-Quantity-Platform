import 'dotenv/config';
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import path from 'path';

const app: Application = express();

// ── Core Middlewares ──────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
// CSP: allow unpkg CDN for Swagger UI assets + unsafe-inline for its init script
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc:   ["'self'"],
        scriptSrc:    ["'self'", 'https://unpkg.com', 'https://cdnjs.cloudflare.com', "'unsafe-inline'"],
        styleSrc:     ["'self'", 'https://unpkg.com', 'https://cdnjs.cloudflare.com', "'unsafe-inline'"],
        imgSrc:       ["'self'", 'data:', 'https:'],
        connectSrc:   ["'self'", 'https:'],
        fontSrc:      ["'self'", 'https:', 'data:'],
        workerSrc:    ["'self'", 'blob:'],
      },
    },
  })
);
app.use(morgan('dev'));
app.use(compression());

// ── Static Files (serve uploaded files & BOQ exports) ─────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), 'src/uploads')));

// ── Swagger UI ────────────────────────────────────────────────────────────────
import { setupSwagger } from './config/swagger';
setupSwagger(app as any);

// ── API Routes ────────────────────────────────────────────────────────────────
import authRoutes from './modules/auth/auth.routes';
import projectRoutes from './modules/projects/projects.routes';
import drawingRoutes from './modules/drawings/drawings.routes';
import quantityRoutes from './modules/quantities/quantities.routes';
import dwgConvertRoutes from './modules/drawings/dwg-convert.routes';


app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/drawings', drawingRoutes);
app.use('/api/quantities', quantityRoutes);
app.use('/api/convert', dwgConvertRoutes);


// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', message: 'API is running' });
});

// ── Global Error Handler (must be LAST) ───────────────────────────────────────
import { errorHandler } from './middlewares/errorHandler';
app.use(errorHandler as any);

export default app;
