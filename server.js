require('dotenv').config();
const { env } = require('./config/env.js');
const { connectDatabase, disconnectDatabase } = require('./config/database.js');
const { logger } = require('./utils/logger.js');
const app = require('./app.js');

const PORT = env.PORT;

async function start() {
  try {
    await connectDatabase();
    
    const server = app.listen(PORT, () => {
      logger.info(`🚀 QuotaFlow API running on http://localhost:${PORT}`);
      logger.info(`📋 Environment: ${env.NODE_ENV}`);
      logger.info(`🔗 Health: http://localhost:${PORT}/api/health`);
    });

    const shutdown = async (signal) => {
      logger.info(`${signal} received. Shutting down gracefully...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          await disconnectDatabase();
          logger.info('All connections closed. Process exiting.');
          process.exit(0);
        } catch (error) {
          logger.error({ error }, 'Error during shutdown');
          process.exit(1);
        }
      });

      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason) => {
      logger.fatal({ reason }, 'Unhandled Promise Rejection');
      process.exit(1);
    });

    process.on('uncaughtException', (error) => {
      logger.fatal({ error }, 'Uncaught Exception');
      process.exit(1);
    });
  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

start();
