import { Sequelize } from 'sequelize';
import { logger } from '../utils/logger.js';
import { env } from './env.js';

const dialectOptions = env.DB_SSL
  ? { ssl: { require: true, rejectUnauthorized: false } }
  : { ssl: false };

export const sequelize = new Sequelize({
  dialect: 'postgres',
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  username: env.DB_USER,
  password: env.DB_PASS,
  logging: env.NODE_ENV === 'development' ? (sql) => logger.debug(sql) : false,
  dialectOptions,
  pool: {
    max: 10,
    min: 2,
    acquire: 30000,
    idle: 10000,
  },
  define: {
    underscored: false,
    timestamps: true,
  },
});

async function ensureDatabaseExists() {
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

export async function connectDatabase() {
  try {
    await ensureDatabaseExists();
    await sequelize.authenticate();
    logger.info('✅ PostgreSQL connected');

    if (env.NODE_ENV === 'development') {
      const { registerAssociations } = await import('../models/index.js');
      registerAssociations();
      // Skip sync by default on reload to keep log clean
      // await sequelize.sync();
      logger.info('✅ Database tables loaded');
    }
  } catch (error) {
    logger.fatal({ error }, '❌ Failed to connect to PostgreSQL');
    process.exit(1);
  }
}

export async function disconnectDatabase() {
  await sequelize.close();
  logger.info('PostgreSQL disconnected gracefully');
}
