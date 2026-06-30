import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export class QuotationSection extends Model {}

QuotationSection.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    quotationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'quotations', key: 'id' },
      onDelete: 'CASCADE',
    },
    name: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'quotation_sections',
    timestamps: true,
  }
);
