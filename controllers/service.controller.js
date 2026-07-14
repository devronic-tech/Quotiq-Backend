const { StatusCodes } = require('http-status-codes');
const { Service } = require('../models/index.js');
const { asyncHandler } = require('../utils/async-handler.js');
const { NotFoundError } = require('../utils/app-error.js');

/**
 * GET /api/v1/services
 */
const listServices = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const services = await Service.findAll({
    where: { tenantId },
    order: [['createdAt', 'DESC']],
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: services,
  });
});

/**
 * GET /api/v1/services/:id
 */
const getService = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;

  const service = await Service.findOne({ where: { id, tenantId } });
  if (!service) {
    throw new NotFoundError('Service');
  }

  res.status(StatusCodes.OK).json({
    success: true,
    data: service,
  });
});

/**
 * POST /api/v1/services
 */
const createService = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const userId = req.user?.userId;
  const { name, sac, category, price, gstRate, description } = req.body;

  const service = await Service.create({
    tenantId,
    name,
    sac: sac || null,
    category: category || null,
    price: Number(price) || 0,
    gstRate: Number(gstRate) || 0,
    description: description || null,
    createdBy: userId,
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: service,
    message: 'Service created successfully',
  });
});

/**
 * PUT /api/v1/services/:id
 */
const updateService = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const userId = req.user?.userId;
  const { id } = req.params;
  const { name, sac, category, price, gstRate, description } = req.body;

  const service = await Service.findOne({ where: { id, tenantId } });
  if (!service) {
    throw new NotFoundError('Service');
  }

  await service.update({
    name,
    sac: sac !== undefined ? sac : service.sac,
    category: category !== undefined ? category : service.category,
    price: price !== undefined ? Number(price) : service.price,
    gstRate: gstRate !== undefined ? Number(gstRate) : service.gstRate,
    description: description !== undefined ? description : service.description,
    updatedBy: userId,
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: service,
    message: 'Service updated successfully',
  });
});

/**
 * DELETE /api/v1/services/:id
 */
const deleteService = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;

  const service = await Service.findOne({ where: { id, tenantId } });
  if (!service) {
    throw new NotFoundError('Service');
  }

  await service.destroy();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Service deleted successfully',
  });
});

module.exports = {
  listServices,
  getService,
  createService,
  updateService,
  deleteService
};
