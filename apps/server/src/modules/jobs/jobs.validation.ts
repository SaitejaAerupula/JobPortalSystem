import { ExperienceLevel, JobStatus, JobType, WorkMode } from '@prisma/client';
import { z } from 'zod';

const baseJob = {
  title: z.string().min(3).max(120),
  description: z.string().min(20),
  skillsRequired: z.array(z.string().min(1)).min(1),
  minSalary: z.number().int().nonnegative().optional(),
  maxSalary: z.number().int().nonnegative().optional(),
  currency: z.string().min(3).max(5).optional(),
  location: z.string().min(2),
  workMode: z.nativeEnum(WorkMode),
  jobType: z.nativeEnum(JobType),
  experienceLevel: z.nativeEnum(ExperienceLevel),
  openings: z.number().int().positive().max(100).optional(),
  status: z.nativeEnum(JobStatus).optional(),
  expiresAt: z.string().datetime().optional()
};

export const createJobSchema = z.object(baseJob);

export const updateJobSchema = z
  .object({
    ...baseJob,
    title: baseJob.title.optional(),
    description: baseJob.description.optional(),
    skillsRequired: baseJob.skillsRequired.optional(),
    location: baseJob.location.optional(),
    workMode: baseJob.workMode.optional(),
    jobType: baseJob.jobType.optional(),
    experienceLevel: baseJob.experienceLevel.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required'
  });

export const updateJobStatusSchema = z.object({
  status: z.nativeEnum(JobStatus)
});
