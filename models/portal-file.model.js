const { Model, DataTypes } = require('sequelize');
const { sequelize } = require('../config/database.js');

class PortalFile extends Model {}

PortalFile.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    customerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'customers', key: 'id' },
      onDelete: 'CASCADE',
    },
    tenantId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'organizations', key: 'id' },
      onDelete: 'CASCADE',
    },
    folderId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'portal_folders', key: 'id' },
      onDelete: 'SET NULL',
    },
    originalFileName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    storageFileName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    fileSize: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
    },
    extension: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    mimeType: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    sha256: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    tags: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    uploadedByRole: {
      type: DataTypes.ENUM('admin', 'client'),
      defaultValue: 'client',
    },
    uploadedById: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    downloadCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    currentVersion: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    wasabiObjectKey: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    wasabiUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    virusScanResult: {
      type: DataTypes.STRING(50),
      defaultValue: 'clean',
    },
    previewUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    deletionRequested: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    deletionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'portal_files',
    timestamps: true,
  }
);

module.exports = { PortalFile };
