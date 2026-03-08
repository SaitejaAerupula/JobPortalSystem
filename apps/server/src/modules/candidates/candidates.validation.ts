import { z } from 'zod';

export const updateCandidateProfileSchema = z
  .object({
    headline: z.string().max(140).optional(),
    bio: z.string().max(3000).optional(),
    skills: z.array(z.string().min(1)).max(100).optional(),
    experienceYears: z.number().int().min(0).max(60).optional(),
    location: z.string().max(120).optional(),
    linkedInUrl: z.string().url().optional(),
    githubUrl: z.string().url().optional(),
    portfolioUrl: z.string().url().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required'
  });
