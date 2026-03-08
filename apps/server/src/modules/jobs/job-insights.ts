import { ExperienceLevel } from '@prisma/client';

import { semanticResumeJobScore } from '../candidates/resume-analysis';

const suspiciousKeywords = [
  'registration fee',
  'pay and get job',
  'guaranteed placement',
  'money transfer',
  'processing fee',
  'no interview required',
  'urgent joining with payment'
];

const publicEmailDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];

const normalize = (skills: string[]): string[] =>
  skills.map((skill) => skill.trim().toLowerCase()).filter(Boolean);

export const computeExperienceScore = (
  candidateYears: number,
  jobLevel: ExperienceLevel,
  maxScore: number
): number => {
  const requiredYearsByLevel: Record<ExperienceLevel, number> = {
    FRESHER: 0,
    JUNIOR: 1,
    MID: 3,
    SENIOR: 5,
    LEAD: 7
  };

  const required = requiredYearsByLevel[jobLevel] ?? 0;
  return Math.round((Math.min(candidateYears, Math.max(required, 1)) / Math.max(required, 1)) * maxScore);
};

export const computeExplainableCandidateScore = (params: {
  candidateSkills: string[];
  jobSkills: string[];
  candidateYears: number;
  jobLevel: ExperienceLevel;
  resumeText: string;
  jobText: string;
}): {
  totalScore: number;
  components: {
    skills: number;
    experience: number;
    projectRelevance: number;
  };
  matchedSkills: string[];
  missingSkills: string[];
} => {
  const candidateSkills = normalize(params.candidateSkills);
  const jobSkills = normalize(params.jobSkills);
  const matchedSkills = jobSkills.filter((skill) => candidateSkills.includes(skill));
  const missingSkills = jobSkills.filter((skill) => !matchedSkills.includes(skill));

  const skillsScore = jobSkills.length ? Math.round((matchedSkills.length / jobSkills.length) * 50) : 0;
  const experienceScore = computeExperienceScore(params.candidateYears, params.jobLevel, 25);
  const semantic = semanticResumeJobScore(params.resumeText, params.jobText);
  const projectsSignal = /project/i.test(params.resumeText) ? 5 : 0;
  const projectRelevance = Math.min(25, Math.round((semantic / 100) * 20) + projectsSignal);

  return {
    totalScore: Math.min(100, skillsScore + experienceScore + projectRelevance),
    components: {
      skills: skillsScore,
      experience: experienceScore,
      projectRelevance
    },
    matchedSkills,
    missingSkills
  };
};

type FairnessRecord = {
  group: string;
  totalApplicants: number;
  selectedApplicants: number;
  selectionRate: number;
};

const buildSelectionStats = (allGroups: string[], selectedGroups: string[]): FairnessRecord[] => {
  const totals = new Map<string, number>();
  const selectedTotals = new Map<string, number>();

  for (const group of allGroups) {
    totals.set(group, (totals.get(group) ?? 0) + 1);
  }
  for (const group of selectedGroups) {
    selectedTotals.set(group, (selectedTotals.get(group) ?? 0) + 1);
  }

  return [...totals.entries()].map(([group, totalApplicants]) => {
    const selectedApplicants = selectedTotals.get(group) ?? 0;
    const selectionRate = totalApplicants ? Number((selectedApplicants / totalApplicants).toFixed(3)) : 0;
    return { group, totalApplicants, selectedApplicants, selectionRate };
  });
};

const disparateImpact = (records: FairnessRecord[]): number => {
  const rates = records.map((record) => record.selectionRate).filter((rate) => rate > 0);
  if (!rates.length) {
    return 1;
  }

  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);
  return Number((minRate / Math.max(maxRate, 0.001)).toFixed(3));
};

export const buildFairnessSnapshot = (params: {
  locationGroups: string[];
  selectedLocationGroups: string[];
  experienceGroups: string[];
  selectedExperienceGroups: string[];
}) => {
  const locationSelection = buildSelectionStats(params.locationGroups, params.selectedLocationGroups);
  const experienceSelection = buildSelectionStats(params.experienceGroups, params.selectedExperienceGroups);

  return {
    locationSelection,
    experienceSelection,
    disparateImpact: {
      location: disparateImpact(locationSelection),
      experience: disparateImpact(experienceSelection)
    }
  };
};

export const analyzeJobScamRisk = (params: {
  title: string;
  description: string;
  minSalary: number | null;
  maxSalary: number | null;
  experienceLevel: ExperienceLevel;
  website?: string | null;
  duplicateSignal?: boolean;
}) => {
  let riskScore = 0;
  const reasons: string[] = [];
  const combinedText = `${params.title} ${params.description}`.toLowerCase();

  const matchedSuspicious = suspiciousKeywords.filter((word) => combinedText.includes(word));
  if (matchedSuspicious.length) {
    riskScore += Math.min(30, matchedSuspicious.length * 10);
    reasons.push(`Suspicious keywords detected: ${matchedSuspicious.join(', ')}`);
  }

  if (!params.minSalary && !params.maxSalary) {
    riskScore += 8;
    reasons.push('Salary not specified');
  }

  if (params.experienceLevel === ExperienceLevel.FRESHER && (params.maxSalary ?? 0) > 4000000) {
    riskScore += 20;
    reasons.push('Unusually high salary for fresher role');
  }

  const website = params.website?.toLowerCase() ?? '';
  if (website && publicEmailDomains.some((domain) => website.includes(domain))) {
    riskScore += 15;
    reasons.push('Public email style company contact detected');
  }

  if (params.duplicateSignal) {
    riskScore += 25;
    reasons.push('Duplicate job pattern detected across postings');
  }

  const bounded = Math.min(100, riskScore);
  const level = bounded >= 70 ? 'HIGH' : bounded >= 40 ? 'MEDIUM' : 'LOW';

  return {
    riskScore: bounded,
    level,
    reasons
  };
};
