import { ApplicationStatus } from '@prisma/client';
import { z } from 'zod';

export const createApplicationSchema = z.object({
  jobId: z.string().min(1),
  coverLetter: z.string().max(2000).optional()
});

export const updateApplicationStatusSchema = z.object({
  status: z.nativeEnum(ApplicationStatus)
});

export const recruiterNotesSchema = z.object({
  recruiterNotes: z.string().max(3000).nullable().optional()
});
