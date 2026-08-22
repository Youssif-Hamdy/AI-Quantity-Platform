"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSwagger = void 0;
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const path_1 = __importDefault(require("path"));
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
        title: 'AI Quantity Platform API',
        version: '1.0.0',
        description: 'API documentation for the Technical Office AI Agent backend',
    },
    servers: [
        {
            url: process.env.BASE_URL || '/',
            description: 'API Server',
        },
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
            },
        },
    },
    security: [{ bearerAuth: [] }],
};
// Build absolute path to src/modules so it works both locally and on Vercel
const modulesPath = path_1.default.join(__dirname, '..', 'modules');
const options = {
    definition: swaggerDefinition,
    apis: [
        // Try both .ts (local dev / Vercel with tsx) and .js (compiled) extensions
        `${modulesPath}/**/*.routes.ts`,
        `${modulesPath}/**/*.routes.js`,
    ],
};
const swaggerSpec = (0, swagger_jsdoc_1.default)(options);
// Use a stable CDN version for Swagger UI assets (cdnjs is less likely to be blocked by Tracking Prevention)
const SWAGGER_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css';
const SWAGGER_BUNDLE = 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.min.js';
const SWAGGER_PRESET = 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.min.js';
const setupSwagger = (app) => {
    app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerSpec, {
        customCssUrl: SWAGGER_CSS,
        customJs: [
            SWAGGER_BUNDLE,
            SWAGGER_PRESET,
        ],
    }));
    // Expose raw spec as JSON for debugging
    app.get('/api-docs.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(swaggerSpec);
    });
};
exports.setupSwagger = setupSwagger;
