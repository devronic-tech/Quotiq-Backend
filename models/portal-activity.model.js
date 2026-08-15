const { Model, DataTypes } = require('sequelize');
const { sequelize } = require('../config/database.js');

class PortalActivity extends Model {}

PortalActivity.init(
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
    actorRole: {
      type: DataTypes.ENUM('admin', 'client'),
      allowNull: false,
    },
    actorName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    actorId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    actionType: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'portal_activities',
    timestamps: true,
  }
);

module.exports = { PortalActivity };
