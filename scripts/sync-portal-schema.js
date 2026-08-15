const { sequelize } = require('../config/database.js');
const {
  PortalAccount,
  PortalFolder,
  PortalFile,
  PortalFileVersion,
  PortalTextPost,
  PortalLink,
  PortalActivity,
  PortalNotification,
} = require('../models/index.js');
const { logger } = require('../utils/logger.js');

async function fixSchema() {
  try {
    await sequelize.authenticate();
    logger.info('Connected to PostgreSQL for portal schema refresh.');

    // Drop old/partial portal tables if they exist
    logger.info('Dropping outdated portal tables...');
    await sequelize.query(`
      DROP TABLE IF EXISTS "portal_notifications" CASCADE;
      DROP TABLE IF EXISTS "portal_activities" CASCADE;
      DROP TABLE IF EXISTS "portal_links" CASCADE;
      DROP TABLE IF EXISTS "portal_text_posts" CASCADE;
      DROP TABLE IF EXISTS "portal_file_versions" CASCADE;
      DROP TABLE IF EXISTS "portal_files" CASCADE;
      DROP TABLE IF EXISTS "portal_folders" CASCADE;
      DROP TABLE IF EXISTS "portal_accounts" CASCADE;
      DROP TYPE IF EXISTS "public"."enum_portal_accounts_status" CASCADE;
      DROP TYPE IF EXISTS "public"."enum_portal_folders_visibility" CASCADE;
      DROP TYPE IF EXISTS "public"."enum_portal_folders_createdByRole" CASCADE;
      DROP TYPE IF EXISTS "public"."enum_portal_files_uploadedByRole" CASCADE;
      DROP TYPE IF EXISTS "public"."enum_portal_text_posts_authorRole" CASCADE;
      DROP TYPE IF EXISTS "public"."enum_portal_links_createdByRole" CASCADE;
      DROP TYPE IF EXISTS "public"."enum_portal_activities_actorRole" CASCADE;
    `);

    // Sync portal models cleanly
    logger.info('Creating clean Portal tables...');
    await PortalAccount.sync({ force: true });
    await PortalFolder.sync({ force: true });
    await PortalFile.sync({ force: true });
    await PortalFileVersion.sync({ force: true });
    await PortalTextPost.sync({ force: true });
    await PortalLink.sync({ force: true });
    await PortalActivity.sync({ force: true });
    await PortalNotification.sync({ force: true });

    logger.info('✅ All portal tables recreated cleanly with exact schema!');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, '❌ Error recreating portal schema');
    process.exit(1);
  }
}

fixSchema();
