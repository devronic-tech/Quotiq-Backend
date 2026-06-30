import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export class RefreshToken extends Model {}

RefreshToken.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    hashedToken: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    device: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'unknown',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'refresh_tokens',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['hashedToken'] },
      { fields: ['expiresAt'] },
    ],
  }
);
