import { StatusCodes } from 'http-status-codes';
import { sequelize } from '../config/database.js';
import { Customer, CustomerAddress } from '../models/index.js';
import { asyncHandler } from '../utils/async-handler.js';
import { NotFoundError } from '../utils/app-error.js';

/**
 * GET /api/v1/customers
 */
export const listCustomers = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const customers = await Customer.findAll({
    where: { tenantId },
    include: [{ model: CustomerAddress, as: 'addresses' }],
    order: [['createdAt', 'DESC']],
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: customers,
  });
});

/**
 * GET /api/v1/customers/:id
 */
export const getCustomer = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;

  const customer = await Customer.findOne({
    where: { id, tenantId },
    include: [{ model: CustomerAddress, as: 'addresses' }],
  });

  if (!customer) {
    throw new NotFoundError('Customer');
  }

  res.status(StatusCodes.OK).json({
    success: true,
    data: customer,
  });
});

/**
 * POST /api/v1/customers
 */
export const createCustomer = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const userId = req.user?.userId;
  const input = req.body;

  const result = await sequelize.transaction(async (t) => {
    const customer = await Customer.create(
      {
        tenantId,
        name: input.name,
        company: input.company || null,
        email: input.email || null,
        phone: input.phone || null,
        gstNumber: input.gstNumber || null,
        panNumber: input.panNumber || null,
        notes: input.notes || null,
        createdBy: userId,
      },
      { transaction: t }
    );

    if (input.addresses && Array.isArray(input.addresses)) {
      for (const addr of input.addresses) {
        await CustomerAddress.create(
          {
            customerId: customer.id,
            type: addr.type,
            street: addr.street || null,
            city: addr.city || null,
            state: addr.state || null,
            zipCode: addr.zipCode || null,
            country: addr.country || null,
          },
          { transaction: t }
        );
      }
    }

    return await Customer.findByPk(customer.id, {
      include: [{ model: CustomerAddress, as: 'addresses' }],
      transaction: t,
    });
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: result,
    message: 'Customer created successfully',
  });
});

/**
 * PUT /api/v1/customers/:id
 */
export const updateCustomer = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const userId = req.user?.userId;
  const { id } = req.params;
  const input = req.body;

  const customer = await Customer.findOne({ where: { id, tenantId } });
  if (!customer) {
    throw new NotFoundError('Customer');
  }

  const result = await sequelize.transaction(async (t) => {
    await customer.update(
      {
        name: input.name,
        company: input.company || null,
        email: input.email || null,
        phone: input.phone || null,
        gstNumber: input.gstNumber || null,
        panNumber: input.panNumber || null,
        notes: input.notes || null,
        updatedBy: userId,
      },
      { transaction: t }
    );

    if (input.addresses && Array.isArray(input.addresses)) {
      await CustomerAddress.destroy({
        where: { customerId: customer.id },
        transaction: t,
      });

      for (const addr of input.addresses) {
        await CustomerAddress.create(
          {
            customerId: customer.id,
            type: addr.type,
            street: addr.street || null,
            city: addr.city || null,
            state: addr.state || null,
            zipCode: addr.zipCode || null,
            country: addr.country || null,
          },
          { transaction: t }
        );
      }
    }

    return await Customer.findByPk(customer.id, {
      include: [{ model: CustomerAddress, as: 'addresses' }],
      transaction: t,
    });
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: result,
    message: 'Customer updated successfully',
  });
});

/**
 * DELETE /api/v1/customers/:id
 */
export const deleteCustomer = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;

  const customer = await Customer.findOne({ where: { id, tenantId } });
  if (!customer) {
    throw new NotFoundError('Customer');
  }

  await customer.destroy();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Customer deleted successfully',
  });
});
