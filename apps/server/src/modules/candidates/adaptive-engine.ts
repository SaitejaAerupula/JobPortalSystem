import { ApplicationStatus } from '@prisma/client';

import { ROLE_SKILL_MAP } from '../../constants/skills';

const normalize = (value: string) => value.trim().toLowerCase();

const resolveTargetRole = (role?: string) => {
  if (!role?.trim()) {
    return 'Full Stack Developer';
  }

  const available = Object.keys(ROLE_SKILL_MAP);
  const direct = available.find((item) => normalize(item) === normalize(role));
  if (direct) {
    return direct;
  }

  const fuzzy = available.find((item) => normalize(item).includes(normalize(role)));
  return fuzzy ?? 'Full Stack Developer';
};

export const buildAdaptiveLearningPath = (params: {
  currentSkills: string[];
  rejectedSkillSignals: string[];
  trendingSkills: string[];
  totalApplications: number;
  rejectedApplications: number;
}) => {
  const normalizedCurrent = new Set(params.currentSkills.map(normalize));
  const prioritySkills = [...new Set([...params.rejectedSkillSignals, ...params.trendingSkills])]
    .map((skill) => skill.trim())
    .filter(Boolean)
    .filter((skill) => !normalizedCurrent.has(normalize(skill)))
    .slice(0, 6);

  const beforeSuccessRate = params.totalApplications
    ? Math.round(((params.totalApplications - params.rejectedApplications) / params.totalApplications) * 100)
    : 0;
  const expectedLift = Math.min(30, prioritySkills.length * 4);
  const projectedSuccessRate = Math.min(100, beforeSuccessRate + expectedLift);

  const weeklyProgress = prioritySkills.slice(0, 4).map((skill, index) => ({
    week: index + 1,
    focusSkill: skill,
    plan: [
      `Revise ${skill} core topics for 3 sessions`,
      `Build one small artifact highlighting ${skill}`,
      `Publish proof-of-work and attach to profile`
    ],
    metricTarget: `Complete 1 demonstrable ${skill} project update`
  }));

  return {
    prioritySkills,
    weeklyProgress,
    beforeAfter: {
      beforeSuccessRate,
      projectedSuccessRate,
      expectedLift
    }
  };
};

export const buildInterviewReadiness = (params: {
  currentSkills: string[];
  targetRole?: string;
}) => {
  const role = resolveTargetRole(params.targetRole);
  const expectedSkills = ROLE_SKILL_MAP[role] ?? ROLE_SKILL_MAP['Full Stack Developer'];
  const normalizedCurrent = new Set(params.currentSkills.map(normalize));
  const matched = expectedSkills.filter((skill) => normalizedCurrent.has(normalize(skill)));
  const missing = expectedSkills.filter((skill) => !normalizedCurrent.has(normalize(skill)));

  const baseScore = 40;
  const readinessScore = Math.max(0, Math.min(100, baseScore + matched.length * 12 - missing.length * 8));
  const atsPotentialBoost = Math.min(30, missing.length * 5);

  const mcqQuestions = missing.slice(0, 4).map((skill, index) => ({
    id: `mcq-${index + 1}`,
    skill,
    question: `Which statement best describes a strong practical use of ${skill} in production systems?`,
    options: [
      `Use ${skill} only in toy projects`,
      `Apply ${skill} with measurable performance and maintainability goals`,
      `Avoid ${skill} when scaling`,
      `Use ${skill} without testing`
    ],
    answer: 'Apply with measurable performance and maintainability goals'
  }));

  const codingTasks = missing.slice(0, 3).map((skill, index) => ({
    id: `task-${index + 1}`,
    skill,
    task: `Build a mini project/module using ${skill} and add tests plus README documentation.`
  }));

  const recommendation =
    readinessScore >= 80
      ? 'Interview ready for most entry-level roles. Focus on mock interviews.'
      : readinessScore >= 60
        ? 'Moderately ready. Improve missing skills and strengthen project narratives.'
        : 'Readiness is low. Prioritize skill-gap roadmap for 3-4 weeks before interviews.';

  return {
    targetRole: role,
    readinessScore,
    matchedSkills: matched,
    missingSkills: missing,
    atsPotentialBoost,
    recommendation,
    mcqQuestions,
    codingTasks
  };
};

export const collectRejectedSkillSignals = (applications: Array<{ status: ApplicationStatus; jobSkills: string[] }>) => {
  return applications
    .filter((app) => app.status === ApplicationStatus.REJECTED)
    .flatMap((app) => app.jobSkills)
    .map((skill) => skill.trim())
    .filter(Boolean);
};
