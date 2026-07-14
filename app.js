const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const hpp = require('hpp');
const pinoHttp = require('pino-http');
const { env } = require('./config/env.js');
const { logger } = require('./utils/logger.js');
const { requestIdMiddleware } = require('./middleware/request-id.middleware.js');
const { apiLimiter } = require('./middleware/rate-limiter.middleware.js');
const { errorHandler } = require('./middleware/error-handler.middleware.js');

const authRoutes = require('./routes/auth.routes.js');
const healthRoutes = require('./routes/health.routes.js');
const departmentRoutes = require('./routes/department.routes.js');
const customerRoutes = require('./routes/customer.routes.js');
const productServiceRoutes = require('./routes/product-service.routes.js');
const quotationRoutes = require('./routes/quotation.routes.js');
const invoiceRoutes = require('./routes/invoice.routes.js');
const aiRoutes = require('./routes/ai.routes.js');
const organizationRoutes = require('./routes/organization.routes.js');
const offerLetterRoutes = require('./routes/offer-letter.routes.js');
const financeRoutes = require('./routes/finance.routes.js');

const app = express();

// Parse CORS origins — supports comma-separated list
const allowedOrigins = env.CORS_ORIGIN
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, mobile apps)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
  optionsSuccessStatus: 200, // Some browsers (IE11) choke on 204
};

app.use(helmet());
app.use(cors(corsOptions));
// Handle CORS preflight (OPTIONS) for all routes
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(requestIdMiddleware);
const pinoLogger = pinoHttp.pinoHttp || pinoHttp.default || pinoHttp;
app.use(
  pinoLogger({
    logger,
    autoLogging: true,
    serializers: {
      req: () => undefined,
      res: () => undefined,
      err: (err) => ({
        type: err.type || err.name,
        message: err.message,
        stack: env.NODE_ENV === 'development' ? err.stack : undefined,
      }),
    },
    customProps: (req) => ({
      requestId: req.requestId,
    }),
    customSuccessMessage: (req, res, responseTime) => {
      return `${req.method} ${req.url} - ${res.statusCode} (${responseTime}ms)`;
    },
    customErrorMessage: (req, res, err) => {
      return `${req.method} ${req.url} - ${res.statusCode} - Error: ${err.message}`;
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

module.exports = app;
