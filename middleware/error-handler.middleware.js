const { StatusCodes } = require('http-status-codes');
const pkg = require('sequelize');
const { UniqueConstraintError, ValidationError: SequelizeValidationError, ForeignKeyConstraintError, DatabaseError } = pkg;
const { AppError } = require('../utils/app-error.js');
const { logger } = require('../utils/logger.js');
const { env } = require('../config/env.js');

function errorHandler(err, req, res, _next) {
  let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details;
  let isOperational = false;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
    isOperational = err.isOperational;
  }
  else if (err instanceof UniqueConstraintError) {
    statusCode = StatusCodes.CONFLICT;
    code = 'DUPLICATE_KEY';
    message = 'A resource with this value already exists';
    details = Object.fromEntries(
      err.errors.map((e) => [e.path ?? 'field', [e.message]])
    );
    isOperational = true;
  }
  else if (err instanceof SequelizeValidationError) {
    statusCode = StatusCodes.BAD_REQUEST;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = Object.fromEntries(
      err.errors.map((e) => [e.path ?? 'field', [e.message]])
    );
    isOperational = true;
  }
  else if (err instanceof ForeignKeyConstraintError) {
    statusCode = StatusCodes.BAD_REQUEST;
    code = 'FOREIGN_KEY_ERROR';
    message = 'Referenced resource does not exist';
    isOperational = true;
  }
  else if (err instanceof DatabaseError) {
    statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    code = 'DATABASE_ERROR';
    message = 'A database error occurred';
    isOperational = false;
  }
  else if (err.name === 'JsonWebTokenError') {
    statusCode = StatusCodes.UNAUTHORIZED;
    code = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
    isOperational = true;
  } else if (err.name === 'TokenExpiredError') {
    statusCode = StatusCodes.UNAUTHORIZED;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired';
    isOperational = true;
  }

  if (isOperational) {
    logger.warn({ err, requestId: req.requestId, statusCode }, message);
  } else {
    logger.error({ err, requestId: req.requestId, statusCode }, 'Unhandled error');
  }

  const response = {
    success: false,
    error: {
      message,
      code,
      statusCode,
      details,
      ...(env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    },
    requestId: req.requestId,
  };

  res.status(statusCode).json(response);
}

module.exports = {
  errorHandler
};
