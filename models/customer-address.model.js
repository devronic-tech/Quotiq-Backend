import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export class CustomerAddress extends Model {}

CustomerAddress.init(
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
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'billing',
    },
    street: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: null,
    },
    state: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: null,
    },
    zipCode: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: null,
    },
    country: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: null,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'customer_addresses',
    timestamps: true,
  }
);
