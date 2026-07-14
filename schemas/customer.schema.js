const { z } = require('zod');

const addressSchema = z.object({
  type: z.enum(['billing', 'shipping']),
  street: z.string().max(255).trim().optional(),
  city: z.string().max(100).trim().optional(),
  state: z.string().max(100).trim().optional(),
  zipCode: z.string().max(20).trim().optional(),
  country: z.string().max(100).trim().optional(),
});

const customerSchema = z.object({
  name: z.string().min(1, 'Customer contact name is required').max(200).trim(),
  company: z.string().max(200).trim().optional(),
  email: z.string().email('Invalid email address').toLowerCase().trim().or(z.literal('')).optional(),
  phone: z.string().max(50).trim().optional(),
  gstNumber: z.string().max(15).trim().optional(),
  panNumber: z.string().max(10).trim().optional(),
  notes: z.string().trim().optional(),
  status: z.enum(['active', 'completed', 'discarded']).optional(),
  departmentId: z.string().uuid().or(z.literal('')).nullable().optional(),
  notesList: z.array(z.any()).optional(),
  followupsList: z.array(z.any()).optional(),
  addresses: z.array(addressSchema).optional(),
});

module.exports = {
  addressSchema,
  customerSchema
};
