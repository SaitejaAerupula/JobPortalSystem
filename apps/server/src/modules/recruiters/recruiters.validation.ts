import { z } from 'zod';

export const updateRecruiterSchema = z
  .object({
    designation: z.string().max(100).optional(),
    phone: z.string().max(25).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required'
  });

const companyBase = {
  name: z.string().min(2).max(120),
  website: z.string().url().optional(),
  description: z.string().max(3000).optional(),
  logoUrl: z.string().url().optional(),
  location: z.string().max(120).optional(),
  size: z.string().max(60).optional(),
  industry: z.string().max(100).optional()
};

export const createCompanySchema = z.object(companyBase);

export const updateCompanySchema = z
  .object({
    ...companyBase,
    name: companyBase.name.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required'
  });
