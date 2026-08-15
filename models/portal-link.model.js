const { Model, DataTypes } = require('sequelize');
const { sequelize } = require('../config/database.js');

class PortalLink extends Model {}

PortalLink.init(
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
    url: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    icon: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    websiteName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    previewUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdByRole: {
      type: DataTypes.ENUM('admin', 'client'),
      defaultValue: 'client',
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'portal_links',
    timestamps: true,
  }
);

module.exports = { PortalLink };
