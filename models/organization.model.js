const { Model, DataTypes } = require('sequelize');
const { sequelize } = require('../config/database.js');

class Organization extends Model {}

Organization.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    logo: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
    },
    website: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
    },
    address: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'USD',
    },
    taxRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },
    quotationPrefix: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'QT',
    },
    invoicePrefix: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'INV',
    },
    nextQuotationNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    nextInvoiceNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {
        defaultPaymentTerms: 'Net 30',
        defaultQuotationValidity: 30,
        defaultInvoiceDueDays: 30,
        brandColors: {
          primary: '#001B48',
          secondary: '#02457A',
          accent: '#018ABE',
        },
      },
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
    tableName: 'organizations',
    paranoid: true,
    timestamps: true,
  }
);

function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

module.exports = {
  Organization,
  generateSlug
};
