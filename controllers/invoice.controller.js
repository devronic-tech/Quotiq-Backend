import { StatusCodes } from 'http-status-codes';
import { sequelize } from '../config/database.js';
import { Invoice, InvoiceItem, Payment, Quotation, QuotationSection, QuotationItem, Organization, Customer, Department } from '../models/index.js';
import { asyncHandler } from '../utils/async-handler.js';
import { NotFoundError } from '../utils/app-error.js';

/**
 * GET /api/v1/invoices
 */
export const listInvoices = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const invoices = await Invoice.findAll({
    where: { tenantId },
    include: [
      { model: Customer, as: 'customer', attributes: ['id', 'name', 'company', 'email'] },
    ],
    order: [['createdAt', 'DESC']],
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: invoices,
  });
});

/**
 * GET /api/v1/invoices/:id
 */
export const getInvoice = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;

  const invoice = await Invoice.findOne({
    where: { id, tenantId },
    include: [
      { model: Customer, as: 'customer' },
      { model: InvoiceItem, as: 'items' },
      { model: Payment, as: 'payments' },
      {
        model: Quotation,
        as: 'quotation',
        include: [{ model: Department, as: 'department' }],
      },
    ],
    order: [
      [{ model: Payment, as: 'payments' }, 'paymentDate', 'DESC'],
    ],
  });

  if (!invoice) {
    throw new NotFoundError('Invoice');
  }

  res.status(StatusCodes.OK).json({
    success: true,
    data: invoice,
  });
});

/**
 * PATCH /api/v1/invoices/:id/status
 */
export const patchInvoiceStatus = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['draft', 'unpaid', 'partially_paid', 'paid', 'overdue', 'voided'];
  if (!validStatuses.includes(status)) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      error: { message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
    });
  }

  const invoice = await Invoice.findOne({ where: { id, tenantId } });
  if (!invoice) throw new NotFoundError('Invoice');

  await invoice.update({ status });

  res.status(StatusCodes.OK).json({
    success: true,
    data: invoice,
  });
});

/**
 * POST /api/v1/invoices
 */
export const createInvoice = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const userId = req.user?.userId;
  const input = req.body;

  const result = await sequelize.transaction(async (t) => {
    const org = await Organization.findByPk(tenantId, { transaction: t });
    if (!org) {
      throw new Error('Organization not found');
    }

    const invoiceNumber = `${org.invoicePrefix}-${String(org.nextInvoiceNumber).padStart(4, '0')}`;
    await org.increment('nextInvoiceNumber', { by: 1, transaction: t });

    let finalCustomerId;
    let finalCurrency;
    let finalPaymentTerms = input.paymentTerms || null;
    let itemsToInsert = [];

    if (input.quotationId) {
      const quotation = await Quotation.findOne({
        where: { id: input.quotationId, tenantId },
        include: [
          {
            model: QuotationSection,
            as: 'sections',
            include: [{ model: QuotationItem, as: 'items' }],
          },
        ],
        transaction: t,
      });

      if (!quotation) {
        throw new NotFoundError('Quotation');
      }

      finalCustomerId = quotation.customerId;
      finalCurrency = quotation.currency;
      finalPaymentTerms = finalPaymentTerms || quotation.paymentTerms;

      if (quotation.sections) {
        for (const sec of quotation.sections) {
          if (sec.items) {
            for (const item of sec.items) {
              itemsToInsert.push({
                description: item.description,
                quantity: item.quantity,
                unit: item.unit,
                unitPrice: item.unitPrice,
                discount: item.discount,
                tax: item.tax,
              });
            }
          }
        }
      }
    } else {
      if (!input.customerId) {
        throw new Error('CustomerId is required for manual invoices');
      }
      if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
        throw new Error('Line items are required for manual invoices');
      }
      finalCustomerId = input.customerId;
      finalCurrency = input.currency || 'USD';
      itemsToInsert = input.items;
    }

    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;

    for (const item of itemsToInsert) {
      const itemSub = item.quantity * item.unitPrice;
      const itemDisc = itemSub * ((item.discount || 0) / 100);
      const itemTaxable = itemSub - itemDisc;
      const itemTax = itemTaxable * ((item.tax || 0) / 100);

      subtotal += itemSub;
      discountTotal += itemDisc;
      taxTotal += itemTax;
    }

    const grandTotal = subtotal - discountTotal + taxTotal;

    const invoice = await Invoice.create(
      {
        tenantId,
        quotationId: input.quotationId || null,
        customerId: finalCustomerId,
        invoiceNumber,
        type: input.type || 'tax',
        status: 'unpaid',
        issueDate: input.issueDate ? new Date(input.issueDate) : new Date(),
        dueDate: input.dueDate ? new Date(input.dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        paymentTerms: finalPaymentTerms,
        currency: finalCurrency,
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        amountPaid: 0,
        createdBy: userId,
      },
      { transaction: t }
    );

    for (const item of itemsToInsert) {
      await InvoiceItem.create(
        {
          invoiceId: invoice.id,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit || 'units',
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          tax: item.tax || 0,
        },
        { transaction: t }
      );
    }

    return await Invoice.findByPk(invoice.id, {
      include: [
        { model: Customer, as: 'customer' },
        { model: InvoiceItem, as: 'items' },
      ],
      transaction: t,
    });
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: result,
    message: 'Invoice created successfully',
  });
});

/**
 * POST /api/v1/invoices/:id/payments
 */
export const recordPayment = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;
  const input = req.body;

  const invoice = await Invoice.findOne({ where: { id, tenantId } });
  if (!invoice) {
    throw new NotFoundError('Invoice');
  }

  // Reject if already fully paid
  if (invoice.status === 'paid') {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      error: { message: 'This invoice is already fully paid. No further payments can be recorded.' },
    });
  }

  const currentlyPaid = Number(invoice.amountPaid);
  const grandTotal = Number(invoice.grandTotal);
  const balance = grandTotal - currentlyPaid;

  // Reject if payment amount exceeds remaining balance
  const paymentAmount = Number(input.amount);
  if (paymentAmount <= 0) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      error: { message: 'Payment amount must be greater than zero.' },
    });
  }
  if (paymentAmount > balance) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      error: { message: `Payment amount ₹${paymentAmount.toLocaleString('en-IN')} exceeds the remaining balance of ₹${balance.toLocaleString('en-IN')}.` },
    });
  }

  const result = await sequelize.transaction(async (t) => {
    const payment = await Payment.create(
      {
        invoiceId: invoice.id,
        amount: paymentAmount,
        paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
        paymentMethod: input.paymentMethod,
        transactionReference: input.transactionReference || null,
        notes: input.notes || null,
      },
      { transaction: t }
    );

    // Cap amountPaid to grandTotal (never allow overpayment)
    const newAmountPaid = Math.min(currentlyPaid + paymentAmount, grandTotal);

    let status = 'partially_paid';
    if (newAmountPaid >= grandTotal) {
      status = 'paid';
    } else if (newAmountPaid === 0) {
      status = 'unpaid';
    }

    await invoice.update({ amountPaid: newAmountPaid, status }, { transaction: t });

    return { payment, invoice };
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: result,
    message: 'Payment recorded successfully',
  });
});

/**
 * DELETE /api/v1/invoices/:id
 */
export const deleteInvoice = asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  const { id } = req.params;

  const invoice = await Invoice.findOne({ where: { id, tenantId } });
  if (!invoice) {
    throw new NotFoundError('Invoice');
  }

  await invoice.destroy();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Invoice deleted successfully',
  });
});
