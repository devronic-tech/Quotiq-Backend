/**
 * Database Migration Runner Script
 * 
 * Safety features:
 * 1. PostgreSQL session-level advisory lock to prevent concurrent migrations (e.g. multi-node rolling deployments).
 * 2. Runs each migration file inside a database transaction.
 * 3. Automatic pg_dump backup (if pg_dump is available on path) in production, unless bypassed.
 * 4. Tracks applied migrations in the "_migrations_meta" table.
 * 5. Supports dry-run, rollback, status reporting, and baseline setting for legacy databases.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Sequelize } = require('sequelize');
const { env } = require('../config/env.js');
const { sequelize } = require('../config/database.js');
const { logger } = require('../utils/logger.js');

// Advisory Lock ID for migration runner (arbitrary large number)
const MIGRATION_LOCK_ID = 14867392;
const MIGRATIONS_DIR = path.join(__dirname, '../migrations');
const BACKUPS_DIR = path.join(__dirname, '../backups');
const META_TABLE = '_migrations_meta';

// Helper to format timestamps
function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// 1. Database Backup Function
function performBackup() {
  if (env.NODE_ENV !== 'production' && env.NODE_ENV !== 'staging') {
    logger.info('ℹ️ Skipping auto-backup in development environment.');
    return true;
  }

  const bypass = process.argv.includes('--force-backup-skip') || process.env.DB_MIGRATE_FORCE === 'true';
  
  // Verify pg_dump is available
  let pgDumpPath = 'pg_dump';
  try {
    execSync('pg_dump --version', { stdio: 'ignore' });
  } catch (err) {
    if (bypass) {
      logger.warn('⚠️ pg_dump not found in PATH, but backup check bypassed via flags.');
      return true;
    }
    logger.error('❌ CRITICAL: pg_dump utility is not available on this server.');
    logger.error('   To ensure data safety, we highly recommend running a manual backup of your database.');
    logger.error('   Once backed up, run this command with the --force-backup-skip flag, e.g.:');
    logger.error('   npm run db:migrate -- --force-backup-skip');
    logger.error('   Or set environment variable DB_MIGRATE_FORCE=true');
    process.exit(1);
  }

  // Create backups directory if it doesn't exist
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  const backupFile = path.join(BACKUPS_DIR, `backup-${env.DB_NAME}-${getTimestamp()}.sql`);
  logger.info(`📦 Taking database backup: ${backupFile}...`);

  try {
    const backupEnv = { ...process.env };
    let backupCmd = '';

    if (env.DATABASE_URL) {
      backupCmd = `pg_dump "${env.DATABASE_URL}" -F c -b -v -f "${backupFile}"`;
    } else {
      backupEnv.PGPASSWORD = env.DB_PASS;
      backupCmd = `pg_dump -h "${env.DB_HOST}" -p "${env.DB_PORT}" -U "${env.DB_USER}" -d "${env.DB_NAME}" -F c -b -v -f "${backupFile}"`;
    }

    execSync(backupCmd, { env: backupEnv, stdio: 'inherit' });
    logger.info('✅ Backup completed successfully.');
    return true;
  } catch (error) {
    logger.error({ error }, '❌ Database backup failed!');
    if (bypass) {
      logger.warn('⚠️ Backup failed, but proceeding anyway due to override flag.');
      return true;
    }
    logger.error('   Aborting migration due to failed backup. Resolve pg_dump errors or bypass with --force-backup-skip.');
    process.exit(1);
  }
}

// 2. Main Migration Logic
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isStatus = args.includes('--status');
  const isRollback = args.includes('--rollback');
  const baselineIndex = args.indexOf('--baseline');
  const baselineTarget = baselineIndex !== -1 ? args[baselineIndex + 1] : null;

  logger.info('🏁 Database Migration tool started.');

  // Ensure migrations folder exists
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  }

  // Authenticate
  try {
    await sequelize.authenticate();
    logger.info('🔌 Connected to the database.');
  } catch (error) {
    logger.fatal({ error }, '❌ Failed to connect to the database.');
    process.exit(1);
  }

  const queryInterface = sequelize.getQueryInterface();

  // Create metadata table if not exists
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "${META_TABLE}" (
      "name" VARCHAR(255) PRIMARY KEY,
      "appliedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Acquire PostgreSQL advisory lock (session-level) to prevent concurrent executions
  logger.info('🔒 Acquiring database migration advisory lock...');
  try {
    await sequelize.query(`SELECT pg_advisory_lock(${MIGRATION_LOCK_ID});`);
    logger.info('🔒 Advisory lock acquired.');
  } catch (error) {
    logger.fatal({ error }, '❌ Failed to acquire advisory lock. Another migration runner might be active.');
    await sequelize.close();
    process.exit(1);
  }

  try {
    // Read local migration files (sorted alphabetically)
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.js'))
      .sort();

    // Fetch applied migrations from DB
    const [appliedRows] = await sequelize.query(`SELECT name FROM "${META_TABLE}" ORDER BY name ASC;`);
    const appliedSet = new Set(appliedRows.map(r => r.name));

    // Handle STATUS command
    if (isStatus) {
      logger.info('📋 Migration Status Report:');
      console.log('\n┌──────────────────────────────────────────────┬────────────┐');
      console.log('│ Migration File                               │ Status     │');
      console.log('├──────────────────────────────────────────────┼────────────┤');
      for (const file of files) {
        const status = appliedSet.has(file) ? '✅ APPLIED ' : '⏳ PENDING ';
        console.log(`│ ${file.padEnd(44)} │ ${status} │`);
      }
      if (files.length === 0) {
        console.log('│ (No migration files found in migrations/)    │            │');
      }
      console.log('└──────────────────────────────────────────────┴────────────┘\n');
      return;
    }

    // Handle BASELINE command
    if (baselineTarget) {
      if (!files.includes(baselineTarget)) {
        throw new Error(`Baseline target file "${baselineTarget}" was not found in the migrations folder.`);
      }

      logger.info(`🚩 Baselining database up to and including: ${baselineTarget}`);
      
      for (const file of files) {
        if (file <= baselineTarget) {
          if (!appliedSet.has(file)) {
            logger.info(`✍️ Marking as applied (baselined): ${file}`);
            await sequelize.query(`INSERT INTO "${META_TABLE}" (name) VALUES (?);`, {
              replacements: [file]
            });
          }
        }
      }
      logger.info('✅ Baselining completed successfully.');
      return;
    }

    // Handle ROLLBACK command
    if (isRollback) {
      // Find the last applied migration
      const appliedList = files.filter(f => appliedSet.has(f));
      if (appliedList.length === 0) {
        logger.info('ℹ️ No applied migrations found to roll back.');
        return;
      }
      const lastMigration = appliedList[appliedList.length - 1];

      logger.warn(`⚠️ Preparing to ROLL BACK migration: ${lastMigration}`);
      
      // Perform database backup first!
      performBackup();

      if (isDryRun) {
        logger.info(`[DRY RUN] Would roll back migration: ${lastMigration}`);
        return;
      }

      const migrationPath = path.join(MIGRATIONS_DIR, lastMigration);
      const migration = require(migrationPath);

      if (typeof migration.down !== 'function') {
        throw new Error(`Migration ${lastMigration} does not export a "down" function.`);
      }

      const transaction = await sequelize.transaction();
      try {
        logger.info(`⏳ Executing down() for ${lastMigration}...`);
        await migration.down(queryInterface, Sequelize, transaction);

        logger.info(`🗑️ Removing from metadata table: ${lastMigration}`);
        await sequelize.query(`DELETE FROM "${META_TABLE}" WHERE name = ?;`, {
          replacements: [lastMigration],
          transaction
        });

        await transaction.commit();
        logger.info(`✅ Successfully rolled back: ${lastMigration}`);
      } catch (error) {
        await transaction.rollback();
        logger.error({ error }, `❌ Rollback failed for ${lastMigration}. Changes rolled back.`);
        throw error;
      }
      return;
    }

    // Default: MIGRATE (run pending migrations)
    const pendingList = files.filter(f => !appliedSet.has(f));
    if (pendingList.length === 0) {
      logger.info('✅ Database is already up to date. No pending migrations.');
      return;
    }

    logger.info(`📈 Found ${pendingList.length} pending migration(s) to apply.`);

    if (isDryRun) {
      logger.info('[DRY RUN] Pending migrations to run:');
      pendingList.forEach(m => console.log(`  - ${m}`));
      return;
    }

    // Perform database backup first!
    performBackup();

    // Run each pending migration in order, wrapping each in a transaction
    for (const migrationFile of pendingList) {
      logger.info(`⏳ Applying migration: ${migrationFile}`);
      const migrationPath = path.join(MIGRATIONS_DIR, migrationFile);
      const migration = require(migrationPath);

      if (typeof migration.up !== 'function') {
        throw new Error(`Migration ${migrationFile} does not export an "up" function.`);
      }

      const transaction = await sequelize.transaction();
      const startTime = Date.now();

      try {
        await migration.up(queryInterface, Sequelize, transaction);

        await sequelize.query(`INSERT INTO "${META_TABLE}" (name) VALUES (?);`, {
          replacements: [migrationFile],
          transaction
        });

        await transaction.commit();
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info(`✅ Applied: ${migrationFile} (${duration}s)`);
      } catch (error) {
        await transaction.rollback();
        logger.error({ error }, `❌ Migration failed at ${migrationFile}. Database state rolled back.`);
        throw error;
      }
    }

    logger.info('🎉 All pending migrations applied successfully.');

  } finally {
    // Release advisory lock
    logger.info('🔓 Releasing advisory lock...');
    try {
      await sequelize.query(`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID});`);
      logger.info('🔓 Advisory lock released.');
    } catch (error) {
      logger.error({ error }, '⚠️ Error releasing advisory lock.');
    }

    // Disconnect
    await sequelize.close();
    logger.info('🔌 Closed database connection. Done.');
  }
}

// Run the script
main().catch(error => {
  logger.error({ error }, '❌ Migration runner crashed.');
  process.exit(1);
});
