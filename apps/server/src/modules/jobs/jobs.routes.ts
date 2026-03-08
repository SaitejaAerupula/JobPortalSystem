import { Router } from 'express';
import { ExperienceLevel, JobStatus, JobType, Role, WorkMode } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { requireAuth, requireRole } from '../../middlewares/auth';
import { validateBody } from '../../middlewares/validate';
import { ok, created } from '../../utils/http';
import { createJobSchema, updateJobSchema, updateJobStatusSchema } from './jobs.validation';
import {
  extractSkillsFromText,
  parseResumeTextFromUrl,
  semanticResumeJobScore
} from '../candidates/resume-analysis';
import {
  analyzeJobScamRisk,
  buildFairnessSnapshot,
  computeExplainableCandidateScore
} from './job-insights';

const router = Router();

function normalizeSkills(skills: string[]) {
  return skills.map((skill) => skill.trim().toLowerCase()).filter(Boolean);
}

function parseEnumValue<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = String(value).toUpperCase();
  return values.includes(normalized as T) ? (normalized as T) : undefined;
}

router.get('/', async (req, res) => {
  const { search, location, jobType, workMode, experienceLevel, page = '1', limit = '10' } = req.query;
  const pageNum = Number(page);
  const limitNum = Number(limit);
  const safePage = Number.isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
  const safeLimit = Number.isNaN(limitNum) || limitNum < 1 || limitNum > 50 ? 10 : limitNum;
  const parsedJobType = parseEnumValue(jobType, Object.values(JobType));
  const parsedWorkMode = parseEnumValue(workMode, Object.values(WorkMode));
  const parsedExperienceLevel = parseEnumValue(experienceLevel, Object.values(ExperienceLevel));

  const jobs = await prisma.job.findMany({
    where: {
      status: JobStatus.OPEN,
      title: search ? { contains: String(search), mode: 'insensitive' } : undefined,
      location: location ? { contains: String(location), mode: 'insensitive' } : undefined,
      jobType: parsedJobType,
      workMode: parsedWorkMode,
      experienceLevel: parsedExperienceLevel
    },
    include: {
      company: true
    },
    skip: (safePage - 1) * safeLimit,
    take: safeLimit,
    orderBy: { createdAt: 'desc' }
  });

  return ok(res, jobs);
});

router.get('/recommendations/me', requireAuth, requireRole(Role.CANDIDATE), async (req, res) => {
  const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) {
    return res.status(404).json({ message: 'Candidate profile missing' });
  }

  const candidateSkills = normalizeSkills(profile.skills);
  const resumeText = await parseResumeTextFromUrl(profile.resumeUrl);
  const resumeSkills = normalizeSkills(extractSkillsFromText(resumeText));
  const allCandidateSkills = [...new Set([...candidateSkills, ...resumeSkills])];
  const jobs = await prisma.job.findMany({
    where: { status: JobStatus.OPEN },
    include: { company: true },
    orderBy: { createdAt: 'desc' }
  });

  const requiredYearsByLevel: Record<ExperienceLevel, number> = {
    FRESHER: 0,
    JUNIOR: 1,
    MID: 3,
    SENIOR: 5,
    LEAD: 7
  };

  const recommendations = jobs
    .map((job) => {
      const requiredSkills = normalizeSkills(job.skillsRequired);
      const matchedSkills = requiredSkills.filter((skill) => allCandidateSkills.includes(skill));
      const skillScore = requiredSkills.length === 0 ? 0 : Math.round((matchedSkills.length / requiredSkills.length) * 100);
      const semanticScore = semanticResumeJobScore(
        resumeText,
        [job.title, job.description, ...(job.skillsRequired ?? [])].join(' ')
      );
      const requiredYears = requiredYearsByLevel[job.experienceLevel] ?? 0;
      const experienceScore = Math.round(
        (Math.min(profile.experienceYears, Math.max(requiredYears, 1)) / Math.max(requiredYears, 1)) * 100
      );
      const score = Math.min(
        100,
        Math.round(skillScore * 0.5 + semanticScore * 0.35 + experienceScore * 0.15)
      );

      return {
        ...job,
        recommendation: {
          score,
          skillScore,
          semanticScore,
          experienceScore,
          matchedSkills,
          missingSkills: requiredSkills.filter((skill) => !matchedSkills.includes(skill))
        }
      };
    })
    .sort((a, b) => b.recommendation.score - a.recommendation.score)
    .slice(0, 10);

  return ok(res, recommendations);
});

router.get('/:jobId/copilot-ranking', requireAuth, requireRole(Role.RECRUITER, Role.ADMIN), async (req, res) => {
  const jobId = String(req.params.jobId);
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return res.status(404).json({ message: 'Job not found' });
  }

  if (req.user!.role === Role.RECRUITER) {
    const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
    if (!recruiter || recruiter.id !== job.recruiterId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
  }

  const applications = await prisma.application.findMany({
    where: { jobId },
    include: {
      candidate: {
        include: {
          user: true
        }
      }
    },
    orderBy: { appliedAt: 'asc' }
  });

  const scored = await Promise.all(
    applications.map(async (application) => {
      const resumeText = await parseResumeTextFromUrl(application.candidate.resumeUrl);
      const resumeSkills = extractSkillsFromText(resumeText);
      const allSkills = [...new Set([...(application.candidate.skills ?? []), ...resumeSkills])];

      const score = computeExplainableCandidateScore({
        candidateSkills: allSkills,
        jobSkills: job.skillsRequired,
        candidateYears: application.candidate.experienceYears,
        jobLevel: job.experienceLevel,
        resumeText,
        jobText: `${job.title} ${job.description} ${(job.skillsRequired ?? []).join(' ')}`
      });

      return {
        applicationId: application.id,
        candidateId: application.candidateId,
        candidateName: application.candidate.user.fullName,
        candidateEmail: application.candidate.user.email,
        location: application.candidate.location ?? 'UNKNOWN',
        experienceBucket:
          application.candidate.experienceYears <= 1
            ? '0-1'
            : application.candidate.experienceYears <= 3
              ? '2-3'
              : application.candidate.experienceYears <= 6
                ? '4-6'
                : '7+',
        score: score.totalScore,
        explanation: {
          skills: score.components.skills,
          experience: score.components.experience,
          projectRelevance: score.components.projectRelevance,
          text: `Score ${score.totalScore}/100 (skills +${score.components.skills}, experience +${score.components.experience}, project relevance +${score.components.projectRelevance})`
        },
        matchedSkills: score.matchedSkills,
        missingSkills: score.missingSkills
      };
    })
  );

  const ranked = scored.sort((a, b) => b.score - a.score);
  const shortlist = ranked.slice(0, Math.min(5, ranked.length));
  const fairness = buildFairnessSnapshot({
    locationGroups: ranked.map((r) => r.location),
    selectedLocationGroups: shortlist.map((r) => r.location),
    experienceGroups: ranked.map((r) => r.experienceBucket),
    selectedExperienceGroups: shortlist.map((r) => r.experienceBucket)
  });

  return ok(res, {
    job: {
      id: job.id,
      title: job.title
    },
    totalApplicants: ranked.length,
    shortlist: shortlist.map((candidate) => ({
      applicationId: candidate.applicationId,
      candidateId: candidate.candidateId,
      candidateName: candidate.candidateName,
      candidateEmail: candidate.candidateEmail,
      score: candidate.score,
      explanation: candidate.explanation,
      matchedSkills: candidate.matchedSkills,
      missingSkills: candidate.missingSkills
    })),
    fairnessAudit: fairness
  });
});

router.get('/:jobId/scam-risk', async (req, res) => {
  const jobId = String(req.params.jobId);
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { company: true }
  });
  if (!job) {
    return res.status(404).json({ message: 'Job not found' });
  }

  const duplicate = await prisma.job.findFirst({
    where: {
      id: { not: jobId },
      title: { equals: job.title, mode: 'insensitive' },
      description: { equals: job.description, mode: 'insensitive' }
    }
  });

  const risk = analyzeJobScamRisk({
    title: job.title,
    description: job.description,
    minSalary: job.minSalary,
    maxSalary: job.maxSalary,
    experienceLevel: job.experienceLevel,
    website: job.company.website,
    duplicateSignal: Boolean(duplicate)
  });

  return ok(res, {
    jobId: job.id,
    title: job.title,
    company: job.company.name,
    ...risk
  });
});

router.get('/:jobId', async (req, res) => {
  const jobId = String(req.params.jobId);
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { company: true }
  });
  if (!job) {
    return res.status(404).json({ message: 'Job not found' });
  }
  return ok(res, job);
});

router.post('/', requireAuth, requireRole(Role.RECRUITER), validateBody(createJobSchema), async (req, res) => {
  const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
  if (!recruiter) {
    return res.status(404).json({ message: 'Recruiter profile missing' });
  }

  const job = await prisma.job.create({
    data: {
      ...req.body,
      companyId: recruiter.companyId,
      recruiterId: recruiter.id
    }
  });

  return created(res, job, 'Job created');
});

router.patch('/:jobId', requireAuth, requireRole(Role.RECRUITER, Role.ADMIN), validateBody(updateJobSchema), async (req, res) => {
  const jobId = String(req.params.jobId);
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return res.status(404).json({ message: 'Job not found' });
  }

  if (req.user!.role === Role.RECRUITER) {
    const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
    if (!recruiter || recruiter.id !== job.recruiterId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
  }

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: req.body
  });

  return ok(res, updated, 'Job updated');
});

router.patch(
  '/:jobId/status',
  requireAuth,
  requireRole(Role.RECRUITER, Role.ADMIN),
  validateBody(updateJobStatusSchema),
  async (req, res) => {
    const jobId = String(req.params.jobId);
    const { status } = req.body as { status: JobStatus };

    const current = await prisma.job.findUnique({ where: { id: jobId } });
    if (!current) {
      return res.status(404).json({ message: 'Job not found' });
    }

    if (req.user!.role === Role.RECRUITER) {
      const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
      if (!recruiter || recruiter.id !== current.recruiterId) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: { status }
    });

    return ok(res, updated, 'Job status updated');
  }
);

router.delete('/:jobId', requireAuth, requireRole(Role.RECRUITER, Role.ADMIN), async (req, res) => {
  const jobId = String(req.params.jobId);

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return res.status(404).json({ message: 'Job not found' });
  }

  if (req.user!.role === Role.RECRUITER) {
    const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
    if (!recruiter || recruiter.id !== job.recruiterId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
  }

  await prisma.job.delete({ where: { id: jobId } });
  return ok(res, null, 'Job deleted');
});

router.get('/:jobId/applications', requireAuth, requireRole(Role.RECRUITER, Role.ADMIN), async (req, res) => {
  const jobId = String(req.params.jobId);

  if (req.user!.role === Role.RECRUITER) {
    const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
    if (!recruiter) {
      return res.status(404).json({ message: 'Recruiter profile missing' });
    }
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.recruiterId !== recruiter.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
  }

  const applications = await prisma.application.findMany({
    where: { jobId },
    include: {
      candidate: { include: { user: true } }
    },
    orderBy: { appliedAt: 'desc' }
  });

  return ok(res, applications);
});

export default router;
