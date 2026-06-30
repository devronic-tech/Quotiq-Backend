import { StatusCodes } from 'http-status-codes';
import { sequelize } from '../config/database.js';
import { Quotation, QuotationSection, QuotationItem, Organization, Customer, Department } from '../models/index.js';
import { asyncHandler } from '../utils/async-handler.js';
import { NotFoundError } from '../utils/app-error.js';

/**
 * GET /api/v1/quotations
 */
export const listQuotations = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const quotations = await Quotation.findAll({
    where: { tenantId },
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'name', 'company', 'email'] },
      { model: Department, as: 'department', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'DESC']],
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: quotations,
  });
});

/**
 * GET /api/v1/quotations/:id
 */
export const getQuotation = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;

  const quotation = await Quotation.findOne({
    where: { id, tenantId },
    include: [
      { model: Customer, as: 'customer' },
      { model: Department, as: 'department' },
      {
        model: QuotationSection,
        as: 'sections',
        include: [{ model: QuotationItem, as: 'items' }],
      },
    ],
    order: [
      [{ model: QuotationSection, as: 'sections' }, 'sortOrder', 'ASC'],
      [{ model: QuotationSection, as: 'sections' }, { model: QuotationItem, as: 'items' }, 'sortOrder', 'ASC'],
    ],
  });

  if (!quotation) {
    throw new NotFoundError('Quotation');
  }

  res.status(StatusCodes.OK).json({
    success: true,
    data: quotation,
  });
});

/**
 * PATCH /api/v1/quotations/:id/status
 */
export const patchQuotationStatus = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['draft', 'pending', 'sent', 'accepted', 'rejected', 'approved', 'expired'];
  if (!validStatuses.includes(status)) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      error: { message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
    });
  }

  const quotation = await Quotation.findOne({ where: { id, tenantId } });
  if (!quotation) throw new NotFoundError('Quotation');

  await quotation.update({ status });

  res.status(StatusCodes.OK).json({
    success: true,
    data: quotation,
  });
});

/**
 * POST /api/v1/quotations
 */
export const createQuotation = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const userId = req.user?.userId;
  const input = req.body;

  const result = await sequelize.transaction(async (t) => {
    const org = await Organization.findByPk(tenantId, { transaction: t });
    if (!org) {
      throw new Error('Organization not found');
    }

    const quotationNumber = `${org.quotationPrefix}-${String(org.nextQuotationNumber).padStart(4, '0')}`;
    await org.increment('nextQuotationNumber', { by: 1, transaction: t });

    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;

    if (input.sections) {
      for (const sec of input.sections) {
        for (const item of sec.items) {
          const itemSub = item.quantity * item.unitPrice;
          const itemDisc = itemSub * ((item.discount || 0) / 100);
          const itemTaxable = itemSub - itemDisc;
          const itemTax = itemTaxable * ((item.tax || 0) / 100);

          subtotal += itemSub;
          discountTotal += itemDisc;
          taxTotal += itemTax;
        }
      }
    }

    const grandTotal = subtotal - discountTotal + taxTotal;

    // Resolve customerName to customerId
    let resolvedCustomerId = input.customerId;
    if (input.customerName) {
      let customer = await Customer.findOne({
        where: { tenantId, name: input.customerName },
        transaction: t
      });
      if (!customer) {
        customer = await Customer.create({
          tenantId,
          name: input.customerName,
          email: '',
          phone: '',
          address: '',
          company: ''
        }, { transaction: t });
      }
      resolvedCustomerId = customer.id;
    }

    // Resolve departmentName to departmentId
    let resolvedDepartmentId = input.departmentId;
    if (input.departmentName) {
      let department = await Department.findOne({
        where: { tenantId, name: input.departmentName },
        transaction: t
      });
      if (!department) {
        department = await Department.create({
          tenantId,
          name: input.departmentName
        }, { transaction: t });
      }
      resolvedDepartmentId = department.id;
    }

    const quotation = await Quotation.create(
      {
        tenantId,
        customerId: resolvedCustomerId,
        departmentId: resolvedDepartmentId || null,
        quotationNumber,
        projectName: input.projectName,
        projectType: input.projectType || null,
        description: input.description || null,
        status: 'draft',
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        paymentTerms: input.paymentTerms || null,
        termsAndConditions: input.termsAndConditions || null,
        notes: input.notes || null,
        currency: input.currency || 'USD',
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        createdBy: userId,
      },
      { transaction: t }
    );

    if (input.sections) {
      let secOrder = 0;
      for (const sec of input.sections) {
        const section = await QuotationSection.create(
          {
            quotationId: quotation.id,
            name: sec.name,
            sortOrder: sec.sortOrder !== undefined ? sec.sortOrder : secOrder++,
          },
          { transaction: t }
        );

        let itemOrder = 0;
        for (const item of sec.items) {
          await QuotationItem.create(
            {
              sectionId: section.id,
              productId: item.productId || null,
              serviceId: item.serviceId || null,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit || 'units',
              unitPrice: item.unitPrice,
              discount: item.discount || 0,
              tax: item.tax || 0,
              sortOrder: itemOrder++,
            },
            { transaction: t }
          );
        }
      }
    }

    return await Quotation.findByPk(quotation.id, {
      include: [
        { model: Customer, as: 'customer' },
        { model: Department, as: 'department' },
        {
          model: QuotationSection,
          as: 'sections',
          include: [{ model: QuotationItem, as: 'items' }],
        },
      ],
      transaction: t,
    });
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: result,
    message: 'Quotation created successfully',
  });
});

/**
 * PUT /api/v1/quotations/:id
 */
export const updateQuotation = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const userId = req.user?.userId;
  const { id } = req.params;
  const input = req.body;

  const quotation = await Quotation.findOne({ where: { id, tenantId } });
  if (!quotation) {
    throw new NotFoundError('Quotation');
  }

  const result = await sequelize.transaction(async (t) => {
    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;

    if (input.sections) {
      for (const sec of input.sections) {
        for (const item of sec.items) {
          const itemSub = item.quantity * item.unitPrice;
          const itemDisc = itemSub * ((item.discount || 0) / 100);
          const itemTaxable = itemSub - itemDisc;
          const itemTax = itemTaxable * ((item.tax || 0) / 100);

          subtotal += itemSub;
          discountTotal += itemDisc;
          taxTotal += itemTax;
        }
      }
    }

    const grandTotal = subtotal - discountTotal + taxTotal;

    await quotation.update(
      {
        customerId: input.customerId,
        departmentId: input.departmentId || null,
        projectName: input.projectName,
        projectType: input.projectType || null,
        description: input.description || null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        paymentTerms: input.paymentTerms || null,
        termsAndConditions: input.termsAndConditions || null,
        notes: input.notes || null,
        currency: input.currency || 'USD',
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        updatedBy: userId,
      },
      { transaction: t }
    );

    if (input.sections) {
      await QuotationSection.destroy({
        where: { quotationId: quotation.id },
        transaction: t,
      });

      let secOrder = 0;
      for (const sec of input.sections) {
        const section = await QuotationSection.create(
          {
            quotationId: quotation.id,
            name: sec.name,
            sortOrder: secOrder++,
          },
          { transaction: t }
        );

        let itemOrder = 0;
        for (const item of sec.items) {
          await QuotationItem.create(
            {
              sectionId: section.id,
              productId: item.productId || null,
              serviceId: item.serviceId || null,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit || 'units',
              unitPrice: item.unitPrice,
              discount: item.discount || 0,
              tax: item.tax || 0,
              sortOrder: itemOrder++,
            },
            { transaction: t }
          );
        }
      }
    }

    return await Quotation.findByPk(quotation.id, {
      include: [
        { model: Customer, as: 'customer' },
        { model: Department, as: 'department' },
        {
          model: QuotationSection,
          as: 'sections',
          include: [{ model: QuotationItem, as: 'items' }],
        },
      ],
      transaction: t,
    });
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: result,
    message: 'Quotation updated successfully',
  });
});

/**
 * DELETE /api/v1/quotations/:id
 */
export const deleteQuotation = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;

  const quotation = await Quotation.findOne({ where: { id, tenantId } });
  if (!quotation) {
    throw new NotFoundError('Quotation');
  }

  await quotation.destroy();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Quotation deleted successfully',
  });
});
