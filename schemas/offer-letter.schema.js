import { z } from 'zod';

export const createOfferSchema = z.object({
  candidateName: z.string().min(1, 'Candidate name is required').max(100),
  candidateEmail: z.string().min(1, 'Candidate email is required').email('Invalid email address').max(255),
  candidatePhone: z.string().max(50).optional().nullable(),
  candidateAddress: z.string().min(1, 'Candidate address is required'),
  jobTitle: z.string().min(1, 'Job title is required').max(100),
  department: z.enum(['technical', 'social_media']),
  jobType: z.enum(['full_time', 'internship', 'freelance']),
  workplaceType: z.enum(['remote', 'onsite', 'hybrid']),
  salaryPerMonth: z.number().min(0, 'Salary must be non-negative'),
  joiningDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid joining date format' }),
  status: z.enum(['draft', 'sent', 'accepted', 'declined']).optional(),
  notes: z.string().optional().nullable(),
  letterContent: z.string().min(1, 'Letter content is required'),
});

export const updateOfferSchema = createOfferSchema.partial();
