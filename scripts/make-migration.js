/**
 * Migration Generator Script
 * 
 * Generates a timestamp-prefixed migration file template in the migrations folder.
 * Usage: node scripts/make-migration.js <migration-description>
 */

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

function getUTCTimestamp() {
  const now = new Date();
  return now.getUTCFullYear().toString() +
    (now.getUTCMonth() + 1).toString().padStart(2, '0') +
    now.getUTCDate().toString().padStart(2, '0') +
    now.getUTCHours().toString().padStart(2, '0') +
    now.getUTCMinutes().toString().padStart(2, '0') +
    now.getUTCSeconds().toString().padStart(2, '0');
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('❌ Error: Please provide a description for the migration.');
    console.log('Usage: node scripts/make-migration.js <description>');
    console.log('Example: node scripts/make-migration.js add-phone-to-users');
    process.exit(1);
  }

  const rawDescription = args.join('-');
  const cleanDescription = rawDescription
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-') // Replace non-alphanumeric with dashes
    .replace(/-+/g, '-')          // Collapse multiple dashes
    .replace(/^-|-$/g, '');       // Trim leading/trailing dashes

  if (!cleanDescription) {
    console.error('❌ Error: Invalid migration description. Use letters, numbers, and dashes.');
    process.exit(1);
  }

  // Ensure migrations directory exists
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  }

  const timestamp = getUTCTimestamp();
  const filename = `${timestamp}-${cleanDescription}.js`;
  const filePath = path.join(MIGRATIONS_DIR, filename);

  const template = `/**
 * Migration: ${cleanDescription}
 * Timestamp: ${timestamp}
 */

module.exports = {
  /**
   * Run the migration schema modifications.
   * Ensure all DDL statements pass the transaction object.
   * 
   * @param {import('sequelize').QueryInterface} queryInterface 
   * @param {import('sequelize').Sequelize} Sequelize 
   * @param {import('sequelize').Transaction} transaction 
   */
  up: async (queryInterface, Sequelize, transaction) => {
    // Example:
    // await queryInterface.addColumn('Users', 'phoneNumber', {
    //   type: Sequelize.STRING,
    //   allowNull: true
    // }, { transaction });
  },

  /**
   * Revert the migration schema modifications.
   * Ensure all DDL statements pass the transaction object.
   * 
   * @param {import('sequelize').QueryInterface} queryInterface 
   * @param {import('sequelize').Sequelize} Sequelize 
   * @param {import('sequelize').Transaction} transaction 
   */
  down: async (queryInterface, Sequelize, transaction) => {
    // Example:
    // await queryInterface.removeColumn('Users', 'phoneNumber', { transaction });
  }
};
`;

  fs.writeFileSync(filePath, template, 'utf8');
  console.log(`\n✅ Created migration file:`);
  console.log(`👉 ${filePath}\n`);
}

main();
