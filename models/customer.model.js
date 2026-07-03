import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Customer extends Model {}

Customer.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tenantId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'organizations', key: 'id' },
      onDelete: 'CASCADE',
    },
    name: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    company: {
      type: DataTypes.STRING(200),
      allowNull: true,
      defaultValue: null,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
      validate: {
        isEmailOrEmpty(value) {
          if (value && value !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            throw new Error('Invalid email format');
          }
        },
      },
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
    },
    gstNumber: {
      type: DataTypes.STRING(15),
      allowNull: true,
      defaultValue: null,
    },
    panNumber: {
      type: DataTypes.STRING(10),
      allowNull: true,
      defaultValue: null,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'active',
    },
    departmentId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'departments', key: 'id' },
      onDelete: 'SET NULL',
    },
    notesList: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    followupsList: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    updatedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
    deletedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'customers',
    paranoid: true,
    timestamps: true,
  }
);
