import 'dotenv/config';
import app from '../src/app';

// Root health check for Vercel
app.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'AI Quantity Platform API is running',
    version: '1.0.0',
    docs: '/api-docs',
  });
});

// Export the Express app as a Vercel Serverless Function
export default app;
