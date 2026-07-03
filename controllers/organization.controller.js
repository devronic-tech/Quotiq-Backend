import { Organization } from '../models/index.js';
import { StatusCodes } from 'http-status-codes';
import { asyncHandler } from '../utils/async-handler.js';
import { NotFoundError } from '../utils/app-error.js';

/**
 * GET /api/v1/organization
 */
export const getOrganization = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const org = await Organization.findByPk(tenantId);
  if (!org) {
    throw new NotFoundError('Organization');
  }

  res.status(StatusCodes.OK).json({
    success: true,
    data: org,
  });
});

/**
 * PUT /api/v1/organization
 */
export const updateOrganization = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { name, email, phone, website, address, currency, settings } = req.body;

  const org = await Organization.findByPk(tenantId);
  if (!org) {
    throw new NotFoundError('Organization');
  }

  await org.update({
    name,
    email,
    phone,
    website,
    address: address || org.address,
    currency: currency || org.currency,
    settings: {
      ...org.settings,
      ...settings,
    },
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: org,
    message: 'Organization settings updated successfully',
  });
});
