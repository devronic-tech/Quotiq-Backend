# Database Migrations System

This directory contains versioned, incremental database migration scripts. In staging and production environments, automatic schema sync (`sequelize.sync()`) is disabled to prevent accidental data loss. All schema changes must be applied via these migration scripts.

---

## Safety Features

1. **Advisory Locking**: Prevents race conditions by using a PostgreSQL session-level advisory lock. If multiple containers/servers start up at the same time (e.g. rolling deployments), only one instance will run the migrations; others will wait or exit safely.
2. **Transaction Isolation**: Each migration script is executed within a database transaction. If any part of the migration fails, the entire transaction is rolled back, leaving your database clean.
3. **Database Backup**: In staging and production environments, the migration script automatically attempts to create a compressed database backup in `backend/backups` using `pg_dump` before applying any migrations. If `pg_dump` is missing, it will halt to prevent unsafe operations (unless explicitly bypassed).

---

## Commands Reference

The following npm scripts are configured in the `backend/package.json`:

### 1. Create a New Migration
Generates a new timestamped migration skeleton in `backend/migrations/`:
```bash
npm run db:migration <description>
# Example:
npm run db:migration add-avatar-url-to-users
```

### 2. View Migration Status
Lists all local migrations, showing whether they are `PENDING` or `APPLIED`:
```bash
npm run db:status
```

### 3. Run Pending Migrations
Applies all pending migrations sequentially:
```bash
npm run db:migrate
```
*Note: In production/staging, if `pg_dump` is not in your environment PATH, this command will error out to enforce safety. If you have taken a manual backup, run it with the bypass flag:*
```bash
npm run db:migrate -- --force-backup-skip
# Or set env variable: DB_MIGRATE_FORCE=true
```

### 4. Rollback Last Migration
Reverts the last applied migration (runs the `down` function):
```bash
npm run db:rollback
```
*Note: Like migrate, this requires a backup or the bypass flag in production.*

### 5. Preview Migrations (Dry Run)
Prints the list of migrations that *would* be executed or rolled back, without changing the database:
```bash
npm run db:migrate -- --dry-run
npm run db:rollback -- --dry-run
```

### 6. Baseline an Existing Production Database
If you have an existing database that already contains tables corresponding to some migrations, you must mark those migrations as `APPLIED` without executing their SQL queries. 
To mark all migrations up to and including a specific file as applied:
```bash
node scripts/migrate.js --baseline <migration-filename>
# Example:
node scripts/migrate.js --baseline 20260714120000-init-schema.js
```

---

## How to Write Migrations

Every migration file exports an `up` (for applying) and a `down` (for rolling back) function. 

> [!IMPORTANT]
> **Pass the transaction object!** You MUST pass the `transaction` parameter to every database action inside the migration so that Sequelize can tie all DDL commands to the same transaction block. Failing to do so will result in schema updates completing outside the transaction, meaning failures will not roll back.

### Example Migration Template

```javascript
module.exports = {
  up: async (queryInterface, Sequelize, transaction) => {
    // 1. Add a column
    await queryInterface.addColumn('Users', 'avatarUrl', {
      type: Sequelize.STRING(512),
      allowNull: true
    }, { transaction });

    // 2. Add an index
    await queryInterface.addIndex('Users', ['avatarUrl'], {
      name: 'idx_users_avatar_url',
      transaction
    });
  },

  down: async (queryInterface, Sequelize, transaction) => {
    // Revert in reverse order
    await queryInterface.removeIndex('Users', 'idx_users_avatar_url', { transaction });
    await queryInterface.removeColumn('Users', 'avatarUrl', { transaction });
  }
};
```
