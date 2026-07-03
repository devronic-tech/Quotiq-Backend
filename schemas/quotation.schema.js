import { z } from 'zod';

export const lineItemSchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().uuid().optional().nullable(),
  serviceId: z.string().uuid().optional().nullable(),
  description: z.string().min(1, 'Description is required').max(500),
  quantity: z.number().positive('Quantity must be positive'),
  unit: z.string().default('units'),
  unitPrice: z.number().min(0, 'Unit price cannot be negative'),
  discount: z.number().min(0).max(100).default(0),
  tax: z.number().min(0).max(100).default(0),
});

export const sectionSchema = z.object({
  name: z.string().min(1, 'Section name is required').max(5000),
  items: z.array(lineItemSchema).min(1, 'At least one item is required in each section'),
});

export const createQuotationSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID').optional().nullable(),
  customerName: z.string().min(1, 'Customer name is required').max(200).trim().optional(),
  departmentId: z.string().uuid('Invalid department ID').optional().nullable(),
  departmentName: z.string().max(200).trim().optional().nullable(),
  projectName: z.string().min(1, 'Project name is required').max(300).trim(),
  projectType: z.string().max(100).trim().optional(),
  description: z.string().max(5000).trim().optional(),
  validUntil: z.string().datetime().optional().nullable(),
  paymentTerms: z.string().max(1000).optional(),
  termsAndConditions: z.string().max(5000).optional(),
  notes: z.string().max(2000).optional(),
  currency: z.string().length(3).default('USD'),
  sections: z.array(sectionSchema).min(1, 'At least one section is required'),
});

export const updateQuotationSchema = createQuotationSchema.partial();
