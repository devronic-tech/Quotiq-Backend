/**
 * Migration: create-otp-verifications
 * Timestamp: 20260714111421
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
    await queryInterface.createTable('otp_verifications', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      otp: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      type: {
        type: Sequelize.ENUM('login', 'signup', 'forgot_password'),
        allowNull: false,
      },
      expiresAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      verified: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    }, { transaction });

    // Add indexes
    await queryInterface.addIndex('otp_verifications', ['email', 'type'], {
      name: 'otp_verifications_email_type_idx',
      transaction,
    });
    await queryInterface.addIndex('otp_verifications', ['expiresAt'], {
      name: 'otp_verifications_expires_at_idx',
      transaction,
    });
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
    await queryInterface.dropTable('otp_verifications', { transaction });
    // Clean up PostgreSQL custom enum type
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_otp_verifications_type";', { transaction });
  }
};
