const { Model, DataTypes } = require('sequelize');
const { sequelize } = require('../config/database.js');

class PortalFileVersion extends Model {}

PortalFileVersion.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    fileId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'portal_files', key: 'id' },
      onDelete: 'CASCADE',
    },
    versionNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
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
    },
    wasabiObjectKey: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    wasabiUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    uploadedByRole: {
      type: DataTypes.STRING(20),
      defaultValue: 'client',
    },
    uploadedById: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'portal_file_versions',
    timestamps: true,
  }
);

module.exports = { PortalFileVersion };
