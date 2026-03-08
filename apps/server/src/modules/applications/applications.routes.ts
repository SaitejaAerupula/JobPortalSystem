import { ApplicationStatus, NotificationType, Role } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { requireAuth, requireRole } from '../../middlewares/auth';
import { validateBody } from '../../middlewares/validate';
import { created, ok } from '../../utils/http';
import {
  createApplicationSchema,
  recruiterNotesSchema,
  updateApplicationStatusSchema
} from './applications.validation';
import {
  extractSkillsFromText,
  parseResumeTextFromUrl,
  semanticResumeJobScore
} from '../candidates/resume-analysis';
import { enqueueNotification } from '../../queue/notification-queue';

const router = Router();

const experienceTargetByLevel: Record<string, number> = {
  FRESHER: 0,
  JUNIOR: 1,
  MID: 3,
  SENIOR: 5,
  LEAD: 7
};

function normalizeSkills(skills: string[]) {
  return skills.map((skill) => skill.trim().toLowerCase()).filter(Boolean);
}

router.post('/', requireAuth, requireRole(Role.CANDIDATE), validateBody(createApplicationSchema), async (req, res) => {
  const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) {
    return res.status(404).json({ message: 'Candidate profile missing' });
  }

  const { jobId, coverLetter } = req.body as { jobId: string; coverLetter?: string };

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return res.status(404).json({ message: 'Job not found' });
  }
  if (job.status !== 'OPEN') {
    return res.status(400).json({ message: 'Job is not open for applications' });
  }

  const application = await prisma.application.create({
    data: {
      jobId,
      candidateId: profile.id,
      coverLetter
    },
    include: {
      candidate: { include: { user: true } },
      job: true
    }
  });

  const recruiter = await prisma.recruiterProfile.findUnique({ where: { id: job.recruiterId } });
  if (recruiter) {
    void enqueueNotification({
      userId: recruiter.userId,
      type: NotificationType.NEW_APPLICATION,
      title: 'New Application Received',
      message: `${application.candidate.user.fullName} applied for ${application.job.title}`,
      metadata: { applicationId: application.id, jobId }
    });
  }

  return created(res, application, 'Application submitted');
});

router.get('/:applicationId', requireAuth, async (req, res) => {
  const applicationId = String(req.params.applicationId);
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      job: { include: { company: true } },
      candidate: { include: { user: true } }
    }
  });

  if (!application) {
    return res.status(404).json({ message: 'Application not found' });
  }

  if (req.user!.role === Role.CANDIDATE) {
    const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile || application.candidateId !== profile.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
  }

  if (req.user!.role === Role.RECRUITER) {
    const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
    if (!recruiter || application.job.recruiterId !== recruiter.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
  }

  return ok(res, application);
});

router.get('/:applicationId/ats-score', requireAuth, async (req, res) => {
  const applicationId = String(req.params.applicationId);
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      job: true,
      candidate: { include: { user: true } }
    }
  });

  if (!application) {
    return res.status(404).json({ message: 'Application not found' });
  }

  if (req.user!.role === Role.CANDIDATE) {
    const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user!.id } });
    if (!profile || application.candidateId !== profile.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
  }

  if (req.user!.role === Role.RECRUITER) {
    const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
    if (!recruiter || recruiter.id !== application.job.recruiterId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
  }

  const candidateSkills = normalizeSkills(application.candidate.skills);
  const resumeText = await parseResumeTextFromUrl(application.candidate.resumeUrl);
  const resumeExtractedSkills = normalizeSkills(extractSkillsFromText(resumeText));
  const allCandidateSkills = [...new Set([...candidateSkills, ...resumeExtractedSkills])];
  const jobSkills = normalizeSkills(application.job.skillsRequired);
  const matchedSkills = jobSkills.filter((skill) => allCandidateSkills.includes(skill));

  const skillScore = jobSkills.length === 0 ? 0 : Math.round((matchedSkills.length / jobSkills.length) * 55);
  const semanticScore = Math.round(
    (semanticResumeJobScore(resumeText, [application.job.title, application.job.description, ...jobSkills].join(' ')) / 100) * 25
  );
  const requiredYears = experienceTargetByLevel[application.job.experienceLevel] ?? 0;
  const candidateYears = application.candidate.experienceYears;
  const experienceScore = Math.min(15, Math.round((Math.min(candidateYears, Math.max(requiredYears, 1)) / Math.max(requiredYears, 1)) * 15));
  const profileCompleteness = [
    application.candidate.resumeUrl,
    application.candidate.linkedInUrl,
    application.candidate.githubUrl || application.candidate.portfolioUrl
  ].filter(Boolean).length;
  const profileScore = Math.min(5, profileCompleteness * 2);

  const totalScore = Math.min(100, skillScore + semanticScore + experienceScore + profileScore);

  return ok(res, {
    applicationId: application.id,
    totalScore,
    breakdown: {
      skillScore,
      semanticScore,
      experienceScore,
      profileScore
    },
    matchedSkills,
    missingSkills: jobSkills.filter((skill) => !matchedSkills.includes(skill))
  });
});

router.patch(
  '/:applicationId/status',
  requireAuth,
  requireRole(Role.RECRUITER, Role.ADMIN),
  validateBody(updateApplicationStatusSchema),
  async (req, res) => {
  const applicationId = String(req.params.applicationId);
  const { status } = req.body as { status: ApplicationStatus };

  const existing = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { job: true }
  });
  if (!existing) {
    return res.status(404).json({ message: 'Application not found' });
  }

  if (req.user!.role === Role.RECRUITER) {
    const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
    if (!recruiter || recruiter.id !== existing.job.recruiterId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
  }

  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { status },
    include: {
      candidate: { include: { user: true } },
      job: true
    }
  });

  void enqueueNotification({
    userId: updated.candidate.userId,
    type: NotificationType.APPLICATION_STATUS,
    title: 'Application Status Updated',
    message: `Your application for ${updated.job.title} moved to ${status}`,
    metadata: { applicationId: updated.id, status }
  });

  return ok(res, updated, 'Application status updated');
}
);

router.patch(
  '/:applicationId/notes',
  requireAuth,
  requireRole(Role.RECRUITER, Role.ADMIN),
  validateBody(recruiterNotesSchema),
  async (req, res) => {
  const applicationId = String(req.params.applicationId);

  if (req.user!.role === Role.RECRUITER) {
    const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { job: true }
    });
    if (!recruiter || !application || application.job.recruiterId !== recruiter.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
  }

  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { recruiterNotes: req.body?.recruiterNotes ?? null }
  });

  return ok(res, updated, 'Recruiter notes updated');
}
);

router.delete('/:applicationId', requireAuth, requireRole(Role.CANDIDATE), async (req, res) => {
  const applicationId = String(req.params.applicationId);
  const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) {
    return res.status(404).json({ message: 'Candidate profile missing' });
  }

  const existing = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!existing || existing.candidateId !== profile.id) {
    return res.status(404).json({ message: 'Application not found' });
  }

  await prisma.application.delete({ where: { id: applicationId } });
  return ok(res, null, 'Application withdrawn');
});

export default router;
