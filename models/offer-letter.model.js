const { Model, DataTypes } = require('sequelize');
const { sequelize } = require('../config/database.js');

class OfferLetter extends Model {}

OfferLetter.init(
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
    offerNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    candidateName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    candidateEmail: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    candidatePhone: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
    },
    candidateAddress: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    jobTitle: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    department: {
      type: DataTypes.ENUM('technical', 'social_media'),
      allowNull: false,
    },
    jobType: {
      type: DataTypes.ENUM('full_time', 'internship', 'freelance'),
      allowNull: false,
    },
    workplaceType: {
      type: DataTypes.ENUM('remote', 'onsite', 'hybrid'),
      allowNull: false,
    },
    salaryPerMonth: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    joiningDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('draft', 'sent', 'accepted', 'declined'),
      allowNull: false,
      defaultValue: 'draft',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    letterContent: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'offer_letters',
    timestamps: true,
  }
);

module.exports = {
  OfferLetter
};
