const { StatusCodes } = require('http-status-codes');
const { Department } = require('../models/index.js');
const { asyncHandler } = require('../utils/async-handler.js');
const { NotFoundError } = require('../utils/app-error.js');

/**
 * GET /api/v1/departments
 */
const listDepartments = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const userId = req.user?.userId;

  let departments = await Department.findAll({
    where: { tenantId },
    order: [['name', 'ASC']],
  });

  const hasTechnical = departments.some(d => d.name.toLowerCase() === 'technical');
  const hasSocialMedia = departments.some(d => d.name.toLowerCase() === 'social media');

  let createdNew = false;
  if (!hasTechnical) {
    await Department.create({
      name: 'Technical',
      tenantId,
      createdBy: userId,
    });
    createdNew = true;
  }
  if (!hasSocialMedia) {
    await Department.create({
      name: 'Social Media',
      tenantId,
      createdBy: userId,
    });
    createdNew = true;
  }

  if (createdNew) {
    departments = await Department.findAll({
      where: { tenantId },
      order: [['name', 'ASC']],
    });
  }

  res.status(StatusCodes.OK).json({
    success: true,
    data: departments,
  });
});

/**
 * POST /api/v1/departments
 */
const createDepartment = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const userId = req.user?.userId;
  const { name } = req.body;

  const department = await Department.create({
    name,
    tenantId,
    createdBy: userId,
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: department,
    message: 'Department created successfully',
  });
});

/**
 * PUT /api/v1/departments/:id
 */
const updateDepartment = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const userId = req.user?.userId;
  const { id } = req.params;
  const { name } = req.body;

  const department = await Department.findOne({ where: { id, tenantId } });
  if (!department) {
    throw new NotFoundError('Department');
  }

  await department.update({ name, updatedBy: userId });

  res.status(StatusCodes.OK).json({
    success: true,
    data: department,
    message: 'Department updated successfully',
  });
});

/**
 * DELETE /api/v1/departments/:id
 */
const deleteDepartment = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;

  const department = await Department.findOne({ where: { id, tenantId } });
  if (!department) {
    throw new NotFoundError('Department');
  }

  await department.destroy();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Department deleted successfully',
  });
});

module.exports = {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment
};
