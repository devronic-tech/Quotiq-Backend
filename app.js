import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { apiLimiter } from './middleware/rate-limiter.middleware.js';
import { errorHandler } from './middleware/error-handler.middleware.js';

import authRoutes from './routes/auth.routes.js';
import healthRoutes from './routes/health.routes.js';
import departmentRoutes from './routes/department.routes.js';
import customerRoutes from './routes/customer.routes.js';
import productServiceRoutes from './routes/product-service.routes.js';
import quotationRoutes from './routes/quotation.routes.js';
import invoiceRoutes from './routes/invoice.routes.js';
import aiRoutes from './routes/ai.routes.js';
import organizationRoutes from './routes/organization.routes.js';
import offerLetterRoutes from './routes/offer-letter.routes.js';
import financeRoutes from './routes/finance.routes.js';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(requestIdMiddleware);
const pinoLogger = pinoHttp.pinoHttp || pinoHttp.default || pinoHttp;
app.use(
  pinoLogger({
    logger,
    customProps: (req) => ({
      requestId: req.requestId,
    }),
    autoLogging: {
      ignore: (req) => req.url === '/api/health' || req.url === '/api/health/live' || req.url === '/api/v1/health',
    },
  })
);
app.use(hpp());

app.use('/api', apiLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/health', healthRoutes);

// v1 routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/departments', departmentRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1', productServiceRoutes);
app.use('/api/v1/quotations', quotationRoutes);
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/organization', organizationRoutes);
app.use('/api/v1/offers', offerLetterRoutes);
app.use('/api/v1/finance', financeRoutes);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Route not found',
      code: 'NOT_FOUND',
      statusCode: 404,
    },
  });
});

app.use(errorHandler);

export default app;
