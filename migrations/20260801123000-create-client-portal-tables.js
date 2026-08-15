'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. portal_accounts
    await queryInterface.createTable('portal_accounts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      customerId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'customers', key: 'id' },
        onDelete: 'CASCADE',
      },
      tenantId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'CASCADE',
      },
      clientCode: {
        type: Sequelize.STRING(30),
        allowNull: false,
        unique: true,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      password: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      firstName: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      lastName: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      phone: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      companyName: {
        type: Sequelize.STRING(200),
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('enabled', 'disabled'),
        defaultValue: 'enabled',
      },
      isActivated: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      lastLogin: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      portalExpiry: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      storageQuotaBytes: {
        type: Sequelize.BIGINT,
        defaultValue: 10737418240,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // 2. portal_folders
    await queryInterface.createTable('portal_folders', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      customerId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'customers', key: 'id' },
        onDelete: 'CASCADE',
      },
      tenantId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'CASCADE',
      },
      parentId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'portal_folders', key: 'id' },
        onDelete: 'SET NULL',
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      visibility: {
        type: Sequelize.ENUM(
          'public',
          'private',
          'hidden',
          'upload_only',
          'read_only',
          'company_only',
          'client_upload',
          'locked',
          'archive'
        ),
        defaultValue: 'public',
      },
      createdByRole: {
        type: Sequelize.ENUM('admin', 'client'),
        defaultValue: 'admin',
      },
      createdById: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      isLocked: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      deletionRequested: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      deletionReason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // 3. portal_files
    await queryInterface.createTable('portal_files', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      customerId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'customers', key: 'id' },
        onDelete: 'CASCADE',
      },
      tenantId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'CASCADE',
      },
      folderId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'portal_folders', key: 'id' },
        onDelete: 'SET NULL',
      },
      originalFileName: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      storageFileName: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      fileSize: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
      extension: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      mimeType: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      sha256: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      tags: {
        type: Sequelize.JSONB,
        defaultValue: [],
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      uploadedByRole: {
        type: Sequelize.ENUM('admin', 'client'),
        defaultValue: 'client',
      },
      uploadedById: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      ipAddress: {
        type: Sequelize.STRING(45),
        allowNull: true,
      },
      userAgent: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      downloadCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      currentVersion: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
      },
      wasabiObjectKey: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      wasabiUrl: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      virusScanResult: {
        type: Sequelize.STRING(50),
        defaultValue: 'clean',
      },
      previewUrl: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      deletionRequested: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      deletionReason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // 4. portal_file_versions
    await queryInterface.createTable('portal_file_versions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      fileId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'portal_files', key: 'id' },
        onDelete: 'CASCADE',
      },
      versionNumber: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      originalFileName: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      storageFileName: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      fileSize: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
      wasabiObjectKey: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      wasabiUrl: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      uploadedByRole: {
        type: Sequelize.STRING(20),
        defaultValue: 'client',
      },
      uploadedById: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // 5. portal_text_posts
    await queryInterface.createTable('portal_text_posts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      customerId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'customers', key: 'id' },
        onDelete: 'CASCADE',
      },
      tenantId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'CASCADE',
      },
      folderId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'portal_folders', key: 'id' },
        onDelete: 'SET NULL',
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      tags: {
        type: Sequelize.JSONB,
        defaultValue: [],
      },
      authorRole: {
        type: Sequelize.ENUM('admin', 'client'),
        defaultValue: 'client',
      },
      authorName: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      authorId: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      attachments: {
        type: Sequelize.JSONB,
        defaultValue: [],
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // 6. portal_links
    await queryInterface.createTable('portal_links', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      customerId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'customers', key: 'id' },
        onDelete: 'CASCADE',
      },
      tenantId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'CASCADE',
      },
      folderId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'portal_folders', key: 'id' },
        onDelete: 'SET NULL',
      },
      url: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      icon: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      websiteName: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      previewUrl: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      createdByRole: {
        type: Sequelize.ENUM('admin', 'client'),
        defaultValue: 'client',
      },
      createdById: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // 7. portal_activities
    await queryInterface.createTable('portal_activities', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      customerId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'customers', key: 'id' },
        onDelete: 'CASCADE',
      },
      tenantId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'CASCADE',
      },
      actorRole: {
        type: Sequelize.ENUM('admin', 'client'),
        allowNull: false,
      },
      actorName: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      actorId: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      actionType: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // 8. portal_notifications
    await queryInterface.createTable('portal_notifications', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      customerId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'customers', key: 'id' },
        onDelete: 'CASCADE',
      },
      tenantId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'CASCADE',
      },
      type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      isRead: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('portal_notifications');
    await queryInterface.dropTable('portal_activities');
    await queryInterface.dropTable('portal_links');
    await queryInterface.dropTable('portal_text_posts');
    await queryInterface.dropTable('portal_file_versions');
    await queryInterface.dropTable('portal_files');
    await queryInterface.dropTable('portal_folders');
    await queryInterface.dropTable('portal_accounts');
  },
};
