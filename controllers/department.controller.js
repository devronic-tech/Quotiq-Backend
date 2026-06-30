import { StatusCodes } from 'http-status-codes';
import { Department } from '../models/index.js';
import { asyncHandler } from '../utils/async-handler.js';
import { NotFoundError } from '../utils/app-error.js';

/**
 * GET /api/v1/departments
 */
export const listDepartments = asyncHandler(async (req, res) => {
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
export const createDepartment = asyncHandler(async (req, res) => {
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
export const updateDepartment = asyncHandler(async (req, res) => {
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
export const deleteDepartment = asyncHandler(async (req, res) => {
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
