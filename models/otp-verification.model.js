const { Model, DataTypes } = require('sequelize');
const { sequelize } = require('../config/database.js');

class OtpVerification extends Model {}

OtpVerification.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    otp: {
      type: DataTypes.STRING(255), // Will store bcrypt hash of the OTP
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('login', 'signup', 'forgot_password'),
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'otp_verifications',
    timestamps: true,
    indexes: [
      { fields: ['email', 'type'] },
      { fields: ['expiresAt'] },
    ],
  }
);

module.exports = {
  OtpVerification,
};
