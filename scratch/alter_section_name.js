const { sequelize } = require('../config/database.js');
const { logger } = require('../utils/logger.js');

async function run() {
  try {
    await sequelize.authenticate();
    logger.info('Database connected, running ALTER TABLE for quotation_sections.name...');
    await sequelize.query(`
      ALTER TABLE quotation_sections 
      ALTER COLUMN name TYPE TEXT;
    `);
    logger.info('✅ Column quotation_sections.name type successfully changed to TEXT.');
  } catch (error) {
    logger.error({ error }, '❌ Failed to alter table');
  } finally {
    await sequelize.close();
  }
}

run();
