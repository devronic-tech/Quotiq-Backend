const { Model, DataTypes } = require('sequelize');
const { sequelize } = require('../config/database.js');

class PortalFolder extends Model {}

PortalFolder.init(
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
    parentId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'portal_folders', key: 'id' },
      onDelete: 'SET NULL',
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    visibility: {
      type: DataTypes.ENUM(
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
      type: DataTypes.ENUM('admin', 'client'),
      defaultValue: 'admin',
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    isLocked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
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
    tableName: 'portal_folders',
    timestamps: true,
  }
);

module.exports = { PortalFolder };
