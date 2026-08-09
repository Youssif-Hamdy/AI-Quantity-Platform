import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import path from 'path';
import swaggerJSDoc from 'swagger-jsdoc';

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
const modulesPath = path.join(__dirname, '..', 'modules');

const options: swaggerJSDoc.Options = {
  definition: swaggerDefinition,
  apis: [
    // Try both .ts (local dev / Vercel with tsx) and .js (compiled) extensions
    `${modulesPath}/**/*.routes.ts`,
    `${modulesPath}/**/*.routes.js`,
  ],
};

const swaggerSpec = swaggerJSDoc(options);

// Use a stable CDN version for Swagger UI assets (cdnjs is less likely to be blocked by Tracking Prevention)
const SWAGGER_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css';
const SWAGGER_BUNDLE = 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.min.js';
const SWAGGER_PRESET = 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.min.js';

export const setupSwagger = (app: Express) => {
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCssUrl: SWAGGER_CSS,
      customJs: [
        SWAGGER_BUNDLE,
        SWAGGER_PRESET,
      ],
    })
  );

  // Expose raw spec as JSON for debugging
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
};
