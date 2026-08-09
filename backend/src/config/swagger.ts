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
      url: process.env.BASE_URL || 'http://localhost:5000',
      description: 'Server',
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

// Use a stable CDN version for Swagger UI assets
const SWAGGER_CDN = 'https://unpkg.com/swagger-ui-dist@5.11.0';

export const setupSwagger = (app: Express) => {
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCssUrl: `${SWAGGER_CDN}/swagger-ui.css`,
      customJs: [
        `${SWAGGER_CDN}/swagger-ui-bundle.js`,
        `${SWAGGER_CDN}/swagger-ui-standalone-preset.js`,
      ],
    })
  );

  // Expose raw spec as JSON for debugging
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
};
