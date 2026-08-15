const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database.js');

const PortalDocumentComment = sequelize.define(
  'PortalDocumentComment',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    fileId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    customerId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    tenantId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    authorRole: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'client', // 'admin' | 'client'
    },
    authorName: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'User',
    },
    authorId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    noteType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'comment', // 'client_note' | 'internal_note' | 'comment'
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    tableName: 'portal_document_comments',
    timestamps: true,
  }
);

module.exports = { PortalDocumentComment };
