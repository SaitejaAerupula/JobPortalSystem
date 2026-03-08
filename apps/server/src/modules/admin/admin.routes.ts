import { ApplicationStatus, Role } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { requireAuth, requireRole } from '../../middlewares/auth';
import { ok } from '../../utils/http';
import { getMetricsSnapshot } from '../../observability/metrics';
import {
  buildFairnessSnapshot,
  computeExplainableCandidateScore
} from '../jobs/job-insights';
import {
  extractSkillsFromText,
  parseResumeTextFromUrl,
  semanticResumeJobScore
} from '../candidates/resume-analysis';

const POSITIVE_STATUSES = new Set<ApplicationStatus>([
  ApplicationStatus.SHORTLISTED,
  ApplicationStatus.INTERVIEW_SCHEDULED,
  ApplicationStatus.HIRED
]);

const tokenize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);

const keywordOverlapScore = (candidateText: string, jobText: string) => {
  const candidateTokens = new Set(tokenize(candidateText));
  const jobTokens = tokenize(jobText);
  if (!jobTokens.length) {
    return 0;
  }

  const matched = jobTokens.filter((token) => candidateTokens.has(token)).length;
  return Math.round((matched / jobTokens.length) * 100);
};

const skillOverlapScore = (candidateSkills: string[], jobSkills: string[]) => {
  const c = new Set(candidateSkills.map((s) => s.toLowerCase()));
  const required = jobSkills.map((s) => s.toLowerCase());
  if (!required.length) {
    return 0;
  }

  const matched = required.filter((skill) => c.has(skill)).length;
  return Math.round((matched / required.length) * 100);
};

type ScoredRow = {
  applicationId: string;
  jobId: string;
  location: string;
  appliedAt: Date;
  updatedAt: Date;
  isPositive: boolean;
  keywordScore: number;
  skillScore: number;
  hybridScore: number;
  hybridNoSemanticScore: number;
  hybridAdaptiveScore: number;
};

const pickTopK = (rows: ScoredRow[], scoreKey: keyof ScoredRow, k: number) =>
  [...rows]
    .sort((a, b) => Number(b[scoreKey]) - Number(a[scoreKey]))
    .slice(0, Math.min(k, rows.length));

const pickTopKFairnessAware = (rows: ScoredRow[], scoreKey: keyof ScoredRow, k: number) => {
  const groups = new Map<string, ScoredRow[]>();
  for (const row of rows) {
    const key = row.location || 'unknown';
    const current = groups.get(key) ?? [];
    current.push(row);
    groups.set(key, current);
  }

  for (const value of groups.values()) {
    value.sort((a, b) => Number(b[scoreKey]) - Number(a[scoreKey]));
  }

  const selected: ScoredRow[] = [];
  const groupKeys = [...groups.keys()].sort();
  while (selected.length < Math.min(k, rows.length)) {
    let madeProgress = false;
    for (const key of groupKeys) {
      const list = groups.get(key) ?? [];
      const next = list.shift();
      if (next) {
        selected.push(next);
        madeProgress = true;
        if (selected.length >= Math.min(k, rows.length)) {
          break;
        }
      }
    }
    if (!madeProgress) {
      break;
    }
  }

  return selected;
};

const scoreSummary = (rowsByJob: Map<string, ScoredRow[]>, scoreKey: keyof ScoredRow, k: number) => {
  let tp = 0;
  let predicted = 0;
  let groundTruth = 0;
  let totalScore = 0;

  for (const rows of rowsByJob.values()) {
    const positives = rows.filter((row) => row.isPositive).length;
    groundTruth += positives;
    const top = pickTopK(rows, scoreKey, k);
    predicted += top.length;
    tp += top.filter((row) => row.isPositive).length;
    totalScore += top.reduce((sum, row) => sum + Number(row[scoreKey]), 0);
  }

  const precisionAtK = predicted ? Number((tp / predicted).toFixed(3)) : 0;
  const recallAtK = groundTruth ? Number((tp / groundTruth).toFixed(3)) : 0;
  const shortlistQuality = predicted ? Number((totalScore / predicted).toFixed(2)) : 0;

  return { precisionAtK, recallAtK, shortlistQuality };
};

const router = Router();

router.use(requireAuth, requireRole(Role.ADMIN));

router.get('/users', async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' }
  });
  return ok(res, users);
});

router.patch('/users/:userId/status', async (req, res) => {
  const { isActive } = req.body as { isActive?: boolean };
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ message: 'isActive boolean is required' });
  }

  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: { isActive }
  });
  return ok(res, user, 'User status updated');
});

router.get('/jobs', async (_req, res) => {
  const jobs = await prisma.job.findMany({
    include: { company: true },
    orderBy: { createdAt: 'desc' }
  });
  return ok(res, jobs);
});

router.delete('/jobs/:jobId', async (req, res) => {
  await prisma.job.delete({ where: { id: req.params.jobId } });
  return ok(res, null, 'Job removed');
});

router.get('/applications/stats', async (_req, res) => {
  const [totalApplications, totalJobs, totalUsers, statusBuckets] = await Promise.all([
    prisma.application.count(),
    prisma.job.count(),
    prisma.user.count(),
    prisma.application.groupBy({
      by: ['status'],
      _count: {
        status: true
      }
    })
  ]);

  return ok(res, {
    totalApplications,
    totalJobs,
    totalUsers,
    statusBuckets
  });
});

router.get('/observability/summary', async (_req, res) => {
  const snapshot = getMetricsSnapshot();
  const routes = snapshot.routes;

  const topSlowRoutes = [...routes]
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
    .slice(0, 5);

  const topErrorRoutes = [...routes]
    .map((route) => {
      const errorCount = Math.round((route.count * snapshot.errorRate) / 100);
      return {
        route: route.route,
        count: route.count,
        estimatedErrorCount: errorCount,
        avgDurationMs: route.avgDurationMs
      };
    })
    .sort((a, b) => b.estimatedErrorCount - a.estimatedErrorCount)
    .slice(0, 5);

  return ok(res, {
    totalRequests: snapshot.totalRequests,
    totalErrors: snapshot.totalErrors,
    errorRate: snapshot.errorRate,
    topSlowRoutes,
    topErrorRoutes
  });
});

router.get('/research/evaluation', async (_req, res) => {
  const applications = await prisma.application.findMany({
    include: {
      candidate: {
        include: { user: true }
      },
      job: true
    }
  });

  if (!applications.length) {
    return ok(res, {
      message: 'Not enough data for evaluation. Add applications first.'
    });
  }

  const scoredRows: ScoredRow[] = [];

  for (const app of applications) {
    const resumeText = await parseResumeTextFromUrl(app.candidate.resumeUrl);
    const extractedSkills = extractSkillsFromText(resumeText);
    const candidateSkills = [...new Set([...(app.candidate.skills ?? []), ...extractedSkills])];

    const keywordScore = keywordOverlapScore(
      [app.candidate.headline ?? '', app.candidate.bio ?? '', resumeText].join(' '),
      [app.job.title, app.job.description, ...(app.job.skillsRequired ?? [])].join(' ')
    );
    const skillScore = skillOverlapScore(candidateSkills, app.job.skillsRequired ?? []);

    const explain = computeExplainableCandidateScore({
      candidateSkills,
      jobSkills: app.job.skillsRequired ?? [],
      candidateYears: app.candidate.experienceYears,
      jobLevel: app.job.experienceLevel,
      resumeText,
      jobText: [app.job.title, app.job.description, ...(app.job.skillsRequired ?? [])].join(' ')
    });

    const semantic = semanticResumeJobScore(
      resumeText,
      [app.job.title, app.job.description, ...(app.job.skillsRequired ?? [])].join(' ')
    );

    const profileSignal = [app.candidate.resumeUrl, app.candidate.linkedInUrl, app.candidate.githubUrl]
      .filter(Boolean)
      .length;
    const adaptiveBonus = Math.min(10, profileSignal * 3);

    scoredRows.push({
      applicationId: app.id,
      jobId: app.jobId,
      location: app.candidate.location ?? 'unknown',
      appliedAt: app.appliedAt,
      updatedAt: app.updatedAt,
      isPositive: POSITIVE_STATUSES.has(app.status),
      keywordScore,
      skillScore,
      hybridScore: explain.totalScore,
      hybridNoSemanticScore: Math.round(explain.components.skills + explain.components.experience),
      hybridAdaptiveScore: Math.min(100, explain.totalScore + adaptiveBonus + Math.round(semantic * 0.02))
    });
  }

  const rowsByJob = new Map<string, ScoredRow[]>();
  for (const row of scoredRows) {
    const current = rowsByJob.get(row.jobId) ?? [];
    current.push(row);
    rowsByJob.set(row.jobId, current);
  }

  const k = 3;
  const keyword = scoreSummary(rowsByJob, 'keywordScore', k);
  const skill = scoreSummary(rowsByJob, 'skillScore', k);
  const hybrid = scoreSummary(rowsByJob, 'hybridScore', k);
  const hybridNoSemantic = scoreSummary(rowsByJob, 'hybridNoSemanticScore', k);
  const hybridNoAdaptive = scoreSummary(rowsByJob, 'hybridScore', k);

  let topWithoutFairness: ScoredRow[] = [];
  let topWithFairness: ScoredRow[] = [];
  for (const rows of rowsByJob.values()) {
    topWithoutFairness = topWithoutFairness.concat(pickTopK(rows, 'hybridScore', k));
    topWithFairness = topWithFairness.concat(pickTopKFairnessAware(rows, 'hybridScore', k));
  }

  const fairnessWithout = buildFairnessSnapshot({
    locationGroups: scoredRows.map((r) => r.location),
    selectedLocationGroups: topWithoutFairness.map((r) => r.location),
    experienceGroups: scoredRows.map((r) => (r.isPositive ? 'positive' : 'other')),
    selectedExperienceGroups: topWithoutFairness.map((r) => (r.isPositive ? 'positive' : 'other'))
  });
  const fairnessWith = buildFairnessSnapshot({
    locationGroups: scoredRows.map((r) => r.location),
    selectedLocationGroups: topWithFairness.map((r) => r.location),
    experienceGroups: scoredRows.map((r) => (r.isPositive ? 'positive' : 'other')),
    selectedExperienceGroups: topWithFairness.map((r) => (r.isPositive ? 'positive' : 'other'))
  });

  const precisionWithoutFairness = topWithoutFairness.length
    ? Number((topWithoutFairness.filter((r) => r.isPositive).length / topWithoutFairness.length).toFixed(3))
    : 0;
  const precisionWithFairness = topWithFairness.length
    ? Number((topWithFairness.filter((r) => r.isPositive).length / topWithFairness.length).toFixed(3))
    : 0;

  const shortlistTimes = scoredRows
    .filter((row) => row.isPositive)
    .map((row) => (row.updatedAt.getTime() - row.appliedAt.getTime()) / (1000 * 60 * 60));
  const timeToShortlistHours = shortlistTimes.length
    ? Number((shortlistTimes.reduce((sum, v) => sum + v, 0) / shortlistTimes.length).toFixed(2))
    : 0;

  return ok(res, {
    dataset: {
      totalJobs: rowsByJob.size,
      totalApplications: scoredRows.length,
      fixedSplit: '80/20 split with seed=42 (documented protocol for offline runs)'
    },
    baselineComparison: {
      keywordOverlap: keyword,
      skillOverlap: skill,
      hybridModel: hybrid
    },
    ablation: {
      hybridNoSemantic,
      hybridNoFairness: {
        precisionAtK: precisionWithoutFairness,
        recallAtK: hybrid.recallAtK,
        shortlistQuality: hybrid.shortlistQuality
      },
      hybridNoAdaptive
    },
    fairnessComparison: {
      withoutMitigation: {
        disparateImpactRatio: fairnessWithout.disparateImpact.location,
        precisionAtK: precisionWithoutFairness
      },
      withMitigation: {
        disparateImpactRatio: fairnessWith.disparateImpact.location,
        precisionAtK: precisionWithFairness
      }
    },
    operational: {
      timeToShortlistHours
    }
  });
});

export default router;
