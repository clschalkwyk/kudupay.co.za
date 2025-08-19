import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Import route modules
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import sponsorRoutes from './routes/sponsors';
import merchantRoutes from './routes/merchants';
import studentRoutes from './routes/students';
import adminRoutes from './routes/admin';

// Load environment variables
dotenv.config();

// Compute API base path based on environment.
// Rules:
// - Use API_BASE_PATH env if provided (normalize to leading slash). Set to empty to remove prefix.
// - On AWS Lambda (AWS_LAMBDA_FUNCTION_NAME is set), default to '' (no prefix).
// - Otherwise default to '/api' for local development.
const computeBasePath = (): string => {
  const env = process.env.API_BASE_PATH;
  if (typeof env === 'string') {
    const trimmed = env.trim();
    if (trimmed === '' || trimmed === '/') return '';
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return '';
  return '/api';
};
export const BASE_PATH = computeBasePath();

const app = express();

// CORS configuration
const corsOptions = {
  origin: [
    // 'http://localhost:3000',
    // 'http://localhost:5173', // Vite dev server
    // 'http://127.0.0.1:3000',
    // 'http://127.0.0.1:5173',
    // 'http://172.21.184.41:5173',
      'https://www.kudupay.co.za',
      'https://kudupay.co.za'
  ],
  credentials: true,
  optionsSuccessStatus: 200,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Observability: request ID and correlation ID middleware
app.use((req: Request, res: Response, next) => {
  try {
    const incomingReqId = (req.headers['x-request-id'] as string) || '';
    const incomingCorrId = (req.headers['x-correlation-id'] as string) || '';
    const requestId = incomingReqId || uuidv4();
    const correlationId = incomingCorrId || requestId;
    (req as any).requestId = requestId;
    (req as any).correlationId = correlationId;
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-correlation-id', correlationId);
    // Minimal request log
    console.log(`[REQ ${requestId}] ${req.method} ${req.originalUrl}`);
  } catch {}
  (next as any)();
});

// Basic in-memory metrics
const metrics = {
  started_at: new Date().toISOString(),
  requests_total: 0,
  errors_total: 0,
  by_path: {} as Record<string, number>,
  by_status: {} as Record<string, number>
};

// Metrics middleware: count requests and statuses; expose response time header
app.use((req: Request, res: Response, next) => {
  const start = Date.now();
  try {
    metrics.requests_total += 1;
    const pathKey = `${req.method} ${(req as any).path || (req.originalUrl.split('?')[0] || '')}`;
    metrics.by_path[pathKey] = (metrics.by_path[pathKey] || 0) + 1;
    res.on('finish', () => {
      try {
        const code = res.statusCode;
        const key = String(code);
        metrics.by_status[key] = (metrics.by_status[key] || 0) + 1;
        res.setHeader('x-response-time-ms', String(Date.now() - start));
      } catch {}
    });
  } catch {}
  (next as any)();
});

// Metrics endpoint
app.get(`${BASE_PATH}/metrics`, (req: Request, res: Response) => {
  res.status(200).json(metrics);
});

// Basic health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    message: 'KuduPay Backend API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API routes
// Expose a welcome/metadata endpoint at the API root (BASE_PATH) or '/' if no base path.
const API_ROOT = BASE_PATH || '/';
app.get(API_ROOT, (req: Request, res: Response) => {
  const prefix = BASE_PATH || '';
  res.json({
    message: 'Welcome to KuduPay API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: `${prefix}/auth`,
      users: `${prefix}/users`,
      sponsors: `${prefix}/sponsors`,
      merchants: `${prefix}/merchants`,
      students: `${prefix}/students`,
      admin: `${prefix}/admin`,
    },
  });
});

// Use route modules (mounted under BASE_PATH)
app.use(`${BASE_PATH}/auth`, authRoutes);
app.use(`${BASE_PATH}/users`, userRoutes);
app.use(`${BASE_PATH}/sponsors`, sponsorRoutes);
app.use(`${BASE_PATH}/merchants`, merchantRoutes);
app.use(`${BASE_PATH}/students`, studentRoutes);
app.use(`${BASE_PATH}/admin`, adminRoutes);

// 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    message: `The requested route ${req.originalUrl} does not exist`,
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: any) => {
  try { (metrics as any).errors_total += 1; } catch {}
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? ((err as any)?.stack || err.message) : 'Something went wrong',
  });
});

export default app;
