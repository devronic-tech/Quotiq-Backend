import { z } from 'zod';

export const productSchema = z.object({
  name: z.string().min(1, 'Product name is required').max(200).trim(),
  sku: z.string().max(100).trim().optional(),
  hsn: z.string().max(20).trim().optional(),
  category: z.string().max(100).trim().optional(),
  price: z.coerce.number().min(0, 'Price must be 0 or positive'),
  gstRate: z.coerce.number().min(0, 'GST rate must be positive').max(100, 'GST rate cannot exceed 100'),
  description: z.string().trim().optional(),
});

export const serviceSchema = z.object({
  name: z.string().min(1, 'Service name is required').max(200).trim(),
  sac: z.string().max(20).trim().optional(),
  category: z.string().max(100).trim().optional(),
  price: z.coerce.number().min(0, 'Price must be 0 or positive'),
  gstRate: z.coerce.number().min(0, 'GST rate must be positive').max(100, 'GST rate cannot exceed 100'),
  description: z.string().trim().optional(),
});
