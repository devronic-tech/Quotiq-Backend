const { z } = require('zod');

const invoiceItemSchema = z.object({
  description: z.string().min(1, 'Item description is required'),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  unit: z.string().max(50).trim().optional(),
  unitPrice: z.coerce.number().min(0, 'Unit price cannot be negative'),
  discount: z.coerce.number().min(0).max(100).optional().default(0),
  tax: z.coerce.number().min(0).max(100).optional().default(0),
});

const invoiceSchema = z.object({
  quotationId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  type: z.enum(['tax', 'proforma', 'commercial', 'credit_note', 'debit_note']).default('tax'),
  issueDate: z.string().datetime().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  paymentTerms: z.string().trim().optional().nullable(),
  currency: z.string().length(3).default('USD'),
  items: z.array(invoiceItemSchema).optional(),
}).refine(data => data.quotationId || (data.customerId && data.items && data.items.length > 0), {
  message: "Either quotationId, or customerId along with manual line items, must be provided.",
  path: ["_root"],
});

const recordPaymentSchema = z.object({
  amount: z.coerce.number().positive('Payment amount must be positive'),
  paymentDate: z.string().datetime().optional(),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'cheque', 'card', 'upi']),
  transactionReference: z.string().max(100).trim().optional(),
  notes: z.string().trim().optional(),
});

module.exports = {
  invoiceSchema,
  recordPaymentSchema
};
