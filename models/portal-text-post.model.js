const { Model, DataTypes } = require('sequelize');
const { sequelize } = require('../config/database.js');

class PortalTextPost extends Model {}

PortalTextPost.init(
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
    title: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    tags: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    authorRole: {
      type: DataTypes.ENUM('admin', 'client'),
      defaultValue: 'client',
    },
    authorName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    authorId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    attachments: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'portal_text_posts',
    timestamps: true,
  }
);

module.exports = { PortalTextPost };
