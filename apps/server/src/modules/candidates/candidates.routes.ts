import { Router } from 'express';
import { NotificationType, Role } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { requireAuth, requireRole } from '../../middlewares/auth';
import { validateBody } from '../../middlewares/validate';
import { uploadResume } from '../../middlewares/upload';
import { ok } from '../../utils/http';
import { updateCandidateProfileSchema } from './candidates.validation';
import {
  buildRoleSearchLinks,
  extractSkillsFromText,
  generateSkillGapRoadmap,
  getEligibilityLabel,
  parseResumeTextFromUrl,
  semanticResumeJobScore,
  suggestRolesFromSkills
} from './resume-analysis';
import { ExperienceLevel, JobStatus } from '@prisma/client';
import { enqueueNotification } from '../../queue/notification-queue';
import {
  buildAdaptiveLearningPath,
  buildInterviewReadiness,
  collectRejectedSkillSignals
} from './adaptive-engine';

const router = Router();

router.use(requireAuth, requireRole(Role.CANDIDATE));

router.get('/me', async (req, res) => {
  const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user!.id } });
  return ok(res, profile);
});

router.patch('/me', validateBody(updateCandidateProfileSchema), async (req, res) => {
  const profile = await prisma.candidateProfile.update({
    where: { userId: req.user!.id },
    data: req.body
  });
  return ok(res, profile, 'Profile updated');
});

router.post('/me/resume', uploadResume.single('resume'), async (req, res) => {
  const resumeUrl = req.file ? `/uploads/resumes/${req.file.filename}` : undefined;
  if (!resumeUrl) {
    return res.status(400).json({ message: 'Upload a resume PDF in field `resume`' });
  }

  const parsedText = await parseResumeTextFromUrl(resumeUrl);
  const extractedSkills = extractSkillsFromText(parsedText);

  const currentProfile = await prisma.candidateProfile.findUnique({ where: { userId: req.user!.id } });
  const existingSkills = (currentProfile?.skills as string[] | null) ?? [];
  const mergedSkills = [...new Set([...existingSkills, ...extractedSkills])];

  const profile = await prisma.candidateProfile.update({
    where: { userId: req.user!.id },
    data: { resumeUrl, skills: mergedSkills }
  });

  return ok(
    res,
    {
      profile,
      extractedSkills,
      suggestedRoles: suggestRolesFromSkills(mergedSkills)
    },
    'Resume analyzed and profile updated'
  );
});

router.get('/me/resume-analysis', async (req, res) => {
  const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile?.resumeUrl) {
    return res.status(404).json({ message: 'Resume not uploaded yet' });
  }

  const resumeText = await parseResumeTextFromUrl(profile.resumeUrl);
  const resumeSkills = extractSkillsFromText(resumeText);
  const profileSkills = (profile.skills as string[] | null) ?? [];
  const combinedSkills = [...new Set([...profileSkills, ...resumeSkills])];
  const suggestedRoles = suggestRolesFromSkills(combinedSkills).map((roleInfo) => ({
    ...roleInfo,
    links: buildRoleSearchLinks(roleInfo.role)
  }));

  return ok(res, {
    extractedSkills: combinedSkills,
    resumeQuality: {
      words: resumeText.trim().split(/\s+/).filter(Boolean).length,
      hasProjectsSection: /project/i.test(resumeText),
      hasExperienceSection: /experience/i.test(resumeText),
      hasEducationSection: /education/i.test(resumeText)
    },
    suggestedRoles
  });
});

router.get('/me/skill-gap-roadmap', async (req, res) => {
  const targetRole = typeof req.query.role === 'string' ? req.query.role : undefined;
  const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user!.id } });

  if (!profile) {
    return res.status(404).json({ message: 'Candidate profile missing' });
  }

  const resumeText = await parseResumeTextFromUrl(profile.resumeUrl);
  const resumeSkills = extractSkillsFromText(resumeText);
  const profileSkills = (profile.skills as string[] | null) ?? [];
  const combinedSkills = [...new Set([...profileSkills, ...resumeSkills])];

  if (!combinedSkills.length) {
    return res.status(400).json({ message: 'No skills found yet. Upload resume or update profile skills first.' });
  }

  const roadmap = generateSkillGapRoadmap(combinedSkills, targetRole);
  return ok(res, roadmap);
});

router.get('/me/job-eligibility', async (req, res) => {
  const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) {
    return res.status(404).json({ message: 'Candidate profile missing' });
  }

  const minScore = Number(req.query.minScore ?? 65);
  const safeMinScore = Number.isNaN(minScore) ? 65 : Math.max(0, Math.min(100, minScore));

  const resumeText = await parseResumeTextFromUrl(profile.resumeUrl);
  const resumeSkills = extractSkillsFromText(resumeText);
  const profileSkills = (profile.skills as string[] | null) ?? [];
  const candidateSkills = [...new Set([...profileSkills, ...resumeSkills])].map((s) => s.toLowerCase());

  if (!candidateSkills.length) {
    return res.status(400).json({ message: 'No skills found yet. Upload resume or update profile skills first.' });
  }

  const roleSuitability = suggestRolesFromSkills(candidateSkills).map((role) => ({
    ...role,
    atsRoleFitScore: role.matchPercent,
    fitLabel: getEligibilityLabel(role.matchPercent),
    links: buildRoleSearchLinks(role.role)
  }));

  const jobs = await prisma.job.findMany({
    where: { status: JobStatus.OPEN },
    include: { company: true },
    orderBy: { createdAt: 'desc' }
  });

  const existingApplications = await prisma.application.findMany({
    where: { candidateId: profile.id },
    select: { jobId: true }
  });
  const alreadyAppliedJobIds = new Set(existingApplications.map((app) => app.jobId));

  const requiredYearsByLevel: Record<ExperienceLevel, number> = {
    FRESHER: 0,
    JUNIOR: 1,
    MID: 3,
    SENIOR: 5,
    LEAD: 7
  };

  const scoredJobs = jobs.map((job) => {
    const requiredSkills = (job.skillsRequired ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const matchedSkills = requiredSkills.filter((s) => candidateSkills.includes(s));
    const missingSkills = requiredSkills.filter((s) => !matchedSkills.includes(s));

    const skillScore = requiredSkills.length ? Math.round((matchedSkills.length / requiredSkills.length) * 55) : 0;
    const semanticScore = Math.round(
      (semanticResumeJobScore(resumeText, [job.title, job.description, ...requiredSkills].join(' ')) / 100) * 30
    );
    const requiredYears = requiredYearsByLevel[job.experienceLevel] ?? 0;
    const experienceScore = Math.round(
      (Math.min(profile.experienceYears, Math.max(requiredYears, 1)) / Math.max(requiredYears, 1)) * 15
    );

    const atsScore = Math.min(100, skillScore + semanticScore + experienceScore);

    return {
      jobId: job.id,
      title: job.title,
      location: job.location,
      company: job.company.name,
      atsScore,
      fitLabel: getEligibilityLabel(atsScore),
      matchedSkills,
      missingSkills,
      isEligible: atsScore >= safeMinScore,
      reason:
        atsScore >= safeMinScore
          ? `Eligible based on ATS score ${atsScore} and ${matchedSkills.length} matched skill(s).`
          : `Not yet eligible. Improve missing skills: ${missingSkills.join(', ') || 'N/A'}.`
    };
  });

  const actionableJobs = scoredJobs.filter((job) => !alreadyAppliedJobIds.has(job.jobId));
  const alreadyAppliedJobs = scoredJobs.filter((job) => alreadyAppliedJobIds.has(job.jobId));

  const eligibleJobs = actionableJobs.filter((job) => job.isEligible).sort((a, b) => b.atsScore - a.atsScore);
  const improvementJobs = actionableJobs
    .filter((job) => !job.isEligible)
    .sort((a, b) => b.atsScore - a.atsScore)
    .slice(0, 10);

  return ok(res, {
    threshold: safeMinScore,
    roleSuitability,
    eligibleJobs,
    improvementJobs,
    alreadyAppliedJobs: alreadyAppliedJobs
      .sort((a, b) => b.atsScore - a.atsScore)
      .slice(0, 10)
  });
});

router.post('/me/apply-top-eligible', async (req, res) => {
  const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) {
    return res.status(404).json({ message: 'Candidate profile missing' });
  }

  const minScoreRaw = Number(req.body?.minScore ?? 65);
  const limitRaw = Number(req.body?.limit ?? 3);
  const minScore = Number.isNaN(minScoreRaw) ? 65 : Math.max(0, Math.min(100, minScoreRaw));
  const limit = Number.isNaN(limitRaw) ? 3 : Math.max(1, Math.min(10, limitRaw));

  const resumeText = await parseResumeTextFromUrl(profile.resumeUrl);
  const resumeSkills = extractSkillsFromText(resumeText);
  const profileSkills = (profile.skills as string[] | null) ?? [];
  const candidateSkills = [...new Set([...profileSkills, ...resumeSkills])].map((s) => s.toLowerCase());

  if (!candidateSkills.length) {
    return res.status(400).json({ message: 'No skills found yet. Upload resume or update profile skills first.' });
  }

  const jobs = await prisma.job.findMany({
    where: { status: JobStatus.OPEN },
    include: { company: true },
    orderBy: { createdAt: 'desc' }
  });

  const existingApplications = await prisma.application.findMany({
    where: { candidateId: profile.id },
    select: { jobId: true }
  });
  const alreadyAppliedJobIds = new Set(existingApplications.map((app) => app.jobId));

  const requiredYearsByLevel: Record<ExperienceLevel, number> = {
    FRESHER: 0,
    JUNIOR: 1,
    MID: 3,
    SENIOR: 5,
    LEAD: 7
  };

  const topEligibleJobs = jobs
    .filter((job) => !alreadyAppliedJobIds.has(job.id))
    .map((job) => {
      const requiredSkills = (job.skillsRequired ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);
      const matchedSkills = requiredSkills.filter((s) => candidateSkills.includes(s));
      const skillScore = requiredSkills.length ? Math.round((matchedSkills.length / requiredSkills.length) * 55) : 0;
      const semanticScore = Math.round(
        (semanticResumeJobScore(resumeText, [job.title, job.description, ...requiredSkills].join(' ')) / 100) * 30
      );
      const requiredYears = requiredYearsByLevel[job.experienceLevel] ?? 0;
      const experienceScore = Math.round(
        (Math.min(profile.experienceYears, Math.max(requiredYears, 1)) / Math.max(requiredYears, 1)) * 15
      );
      const atsScore = Math.min(100, skillScore + semanticScore + experienceScore);

      return {
        job,
        atsScore
      };
    })
    .filter((entry) => entry.atsScore >= minScore)
    .sort((a, b) => b.atsScore - a.atsScore)
    .slice(0, limit);

  if (!topEligibleJobs.length) {
    return ok(res, {
      threshold: minScore,
      attempted: 0,
      applied: 0,
      skipped: 0,
      details: []
    }, 'No eligible jobs found for current threshold');
  }

  const candidateUser = await prisma.user.findUnique({ where: { id: profile.userId } });
  const details: Array<{ jobId: string; title: string; atsScore: number; status: 'applied' | 'skipped' }> = [];

  for (const entry of topEligibleJobs) {
    const existing = await prisma.application.findUnique({
      where: {
        jobId_candidateId: {
          jobId: entry.job.id,
          candidateId: profile.id
        }
      }
    });

    if (existing) {
      details.push({
        jobId: entry.job.id,
        title: entry.job.title,
        atsScore: entry.atsScore,
        status: 'skipped'
      });
      continue;
    }

    const application = await prisma.application.create({
      data: {
        jobId: entry.job.id,
        candidateId: profile.id,
        coverLetter: `Auto-applied by candidate based on resume eligibility score ${entry.atsScore}%`
      }
    });

    const recruiter = await prisma.recruiterProfile.findUnique({ where: { id: entry.job.recruiterId } });
    if (recruiter && candidateUser) {
      void enqueueNotification({
        userId: recruiter.userId,
        type: NotificationType.NEW_APPLICATION,
        title: 'New Application Received',
        message: `${candidateUser.fullName} applied for ${entry.job.title}`,
        metadata: { applicationId: application.id, jobId: entry.job.id }
      });
    }

    details.push({
      jobId: entry.job.id,
      title: entry.job.title,
      atsScore: entry.atsScore,
      status: 'applied'
    });
  }

  const applied = details.filter((item) => item.status === 'applied').length;
  const skipped = details.filter((item) => item.status === 'skipped').length;

  return ok(res, {
    threshold: minScore,
    attempted: details.length,
    applied,
    skipped,
    details
  }, 'Top eligible job applications processed');
});

router.get('/me/adaptive-learning-path', async (req, res) => {
  const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) {
    return res.status(404).json({ message: 'Candidate profile missing' });
  }

  const resumeText = await parseResumeTextFromUrl(profile.resumeUrl);
  const resumeSkills = extractSkillsFromText(resumeText);
  const profileSkills = (profile.skills as string[] | null) ?? [];
  const allSkills = [...new Set([...profileSkills, ...resumeSkills])];

  const applications = await prisma.application.findMany({
    where: { candidateId: profile.id },
    include: { job: true }
  });

  const rejectedSignals = collectRejectedSkillSignals(
    applications.map((app) => ({ status: app.status, jobSkills: app.job.skillsRequired ?? [] }))
  );

  const trendingJobs = await prisma.job.findMany({
    where: { status: JobStatus.OPEN },
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  const trendingSkills = trendingJobs.flatMap((job) => job.skillsRequired ?? []);
  const result = buildAdaptiveLearningPath({
    currentSkills: allSkills,
    rejectedSkillSignals: rejectedSignals,
    trendingSkills,
    totalApplications: applications.length,
    rejectedApplications: applications.filter((app) => app.status === 'REJECTED').length
  });

  return ok(res, result);
});

router.get('/me/interview-readiness', async (req, res) => {
  const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) {
    return res.status(404).json({ message: 'Candidate profile missing' });
  }

  const targetRole = typeof req.query.role === 'string' ? req.query.role : undefined;
  const resumeText = await parseResumeTextFromUrl(profile.resumeUrl);
  const resumeSkills = extractSkillsFromText(resumeText);
  const profileSkills = (profile.skills as string[] | null) ?? [];
  const allSkills = [...new Set([...profileSkills, ...resumeSkills])];

  const readiness = buildInterviewReadiness({
    currentSkills: allSkills,
    targetRole
  });

  return ok(res, readiness);
});

router.get('/me/applications', async (req, res) => {
  const profile = await prisma.candidateProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) {
    return res.status(404).json({ message: 'Candidate profile missing' });
  }
  const apps = await prisma.application.findMany({
    where: { candidateId: profile.id },
    include: {
      job: {
        include: {
          company: true
        }
      }
    },
    orderBy: { appliedAt: 'desc' }
  });

  return ok(res, apps);
});

export default router;
