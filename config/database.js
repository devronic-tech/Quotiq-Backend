const { Sequelize } = require('sequelize');
const { logger } = require('../utils/logger.js');
const { env } = require('./env.js');

let sequelize;

if (env.DATABASE_URL) {
  sequelize = new Sequelize(env.DATABASE_URL, {
    dialect: 'postgres',
    logging: env.NODE_ENV === 'development' ? (sql) => logger.debug(sql) : false,
    pool: {
      max: 50,
      min: 5,
      acquire: 10000,
      idle: 30000,
      evict: 15000,
    },
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
      useUTC: true,
      connectTimeout: 30000,
      statement_timeout: 30000,
    },
    timezone: '+00:00',
    retry: {
      max: 5,
      match: [
        /SequelizeConnectionError/,
        /SequelizeConnectionRefusedError/,
        /SequelizeHostNotFoundError/,
        /SequelizeHostNotReachableError/,
        /SequelizeInvalidConnectionError/,
        /SequelizeConnectionTimedOutError/,
      ],
    },
    define: {
      underscored: false,
      timestamps: true,
    },
  });
  logger.info('✅ Using DATABASE_URL connection (Neon - Optimized)');
} else {
  const localDialectOptions = env.DB_SSL
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : { ssl: false };

  sequelize = new Sequelize({
    dialect: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    username: env.DB_USER,
    password: env.DB_PASS,
    logging: env.NODE_ENV === 'development' ? (sql) => logger.debug(sql) : false,
    dialectOptions: {
      ...localDialectOptions,
      useUTC: true,
    },
    pool: {
      max: 200,
      min: 10,
      acquire: 20000,
      idle: 60000,
      evict: 20000,
    },
    timezone: '+00:00',
    define: {
      underscored: false,
      timestamps: true,
    },
  });
  logger.info('Pool using local database connection');
}

async function ensureDatabaseExists() {
  if (env.DATABASE_URL) {
    logger.info('☁️ Using cloud database (DATABASE_URL), skipping local DB creation');
    return;
  }
  const dialectOptions = env.DB_SSL
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : { ssl: false };

  const adminSequelize = new Sequelize({
    dialect: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: 'postgres',
    username: env.DB_USER,
    password: env.DB_PASS,
    logging: false,
    dialectOptions,
  });

  try {
    await adminSequelize.authenticate();
    const [results] = await adminSequelize.query(
      `SELECT 1 FROM pg_database WHERE datname = '${env.DB_NAME}'`
    );

    if (results.length === 0) {
      logger.info(`📦 Creating database "${env.DB_NAME}"...`);
      const safeName = env.DB_NAME.replace(/[^a-zA-Z0-9_]/g, '');
      await adminSequelize.query(`CREATE DATABASE "${safeName}"`);
      logger.info(`✅ Database "${env.DB_NAME}" created`);
    } else {
      logger.info(`✅ Database "${env.DB_NAME}" already exists`);
    }
  } finally {
    await adminSequelize.close();
  }
}

async function connectDatabase() {
  try {
    await ensureDatabaseExists();
    await sequelize.authenticate();
    logger.info('✅ PostgreSQL connected');

    // Register associations in ALL environments so Sequelize models are loaded and associated
    const { registerAssociations } = require('../models/index.js');
    registerAssociations();

    // Sync database models (CREATE TABLE IF NOT EXISTS) so tables are created on fresh deployments
    if (env.NODE_ENV === 'development') {
      await sequelize.sync();
      logger.info('✅ Database tables loaded and synced (dev-only sync)');
    } else {
      logger.info('🚀 Production/Staging: skipping auto-sync. Ensure migrations are run.');
    }
  } catch (error) {
    logger.fatal({ error }, '❌ Failed to connect to PostgreSQL');
    process.exit(1);
  }
}

async function disconnectDatabase() {
  await sequelize.close();
  logger.info('PostgreSQL disconnected gracefully');
}

module.exports = {
  sequelize,
  connectDatabase,
  disconnectDatabase
};
