import app, { BASE_PATH } from './app';
import { ensureIndexesOnce } from './services/sponsorship.store';

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  try {
    console.log('[Startup] Ensuring required DynamoDB indexes...');
    await ensureIndexesOnce();
    console.log('[Startup] Index check passed. Starting server...');
  } catch (err) {
    console.error('[Startup] Fatal: Required DynamoDB indexes missing or unreachable. Exiting.');
    console.error(err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    const base = BASE_PATH || '/';
    console.log(`🦌 KuduPay Backend API is running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`🚀 API base: http://localhost:${PORT}${base}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

bootstrap();

export default app;