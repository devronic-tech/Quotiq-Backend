import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { sequelize } from '../config/database.js';

const router = Router();

router.get('/', (_req, res) => {
  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    },
  });
});

router.get('/ready', async (_req, res) => {
  const checks = {};

  try {
    await sequelize.authenticate();
    checks.postgres = 'connected';
  } catch {
    checks.postgres = 'disconnected';
  }

  const isReady = checks.postgres === 'connected';
  const statusCode = isReady ? StatusCodes.OK : StatusCodes.SERVICE_UNAVAILABLE;

  res.status(statusCode).json({
    success: isReady,
    data: {
      status: isReady ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    },
  });
});

router.get('/live', (_req, res) => {
  res.status(StatusCodes.OK).json({
    success: true,
    data: {
      status: 'alive',
      pid: process.pid,
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
