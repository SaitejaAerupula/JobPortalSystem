import fs from 'node:fs/promises';
import path from 'node:path';

import { ROLE_SKILL_MAP, SKILL_KEYWORDS } from '../../constants/skills';
import { cosineSimilarity } from '../../utils/text-score';

const normalize = (value: string): string => value.trim().toLowerCase();

const safeRegex = (keyword: string): RegExp => {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i');
};

export const extractSkillsFromText = (text: string): string[] => {
  const lowerText = text.toLowerCase();
  return SKILL_KEYWORDS.filter((skill) => safeRegex(skill).test(lowerText));
};

export const parseResumeTextFromUrl = async (resumeUrl?: string | null): Promise<string> => {
  if (!resumeUrl) {
    return '';
  }

  const relativePath = resumeUrl.startsWith('/') ? resumeUrl.slice(1) : resumeUrl;
  const absolutePath = path.resolve(process.cwd(), relativePath);

  try {
    const fileBuffer = await fs.readFile(absolutePath);
    if (!absolutePath.toLowerCase().endsWith('.pdf')) {
      return '';
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>;
    const parsed = await pdfParse(fileBuffer);
    return parsed.text ?? '';
  } catch {
    return '';
  }
};

export const suggestRolesFromSkills = (skills: string[]) => {
  const normalizedSkills = new Set(skills.map(normalize));

  return Object.entries(ROLE_SKILL_MAP)
    .map(([role, expectedSkills]) => {
      const matched = expectedSkills.filter((skill) => normalizedSkills.has(normalize(skill)));
      const matchPercent = expectedSkills.length ? Math.round((matched.length / expectedSkills.length) * 100) : 0;

      return {
        role,
        matchPercent,
        matchedSkills: matched,
        missingSkills: expectedSkills.filter((skill) => !normalizedSkills.has(normalize(skill)))
      };
    })
    .sort((a, b) => b.matchPercent - a.matchPercent)
    .slice(0, 4);
};

export const semanticResumeJobScore = (resumeText: string, jobText: string): number =>
  Math.round(cosineSimilarity(resumeText, jobText) * 100);

export const getEligibilityLabel = (score: number): 'HIGH' | 'MEDIUM' | 'LOW' => {
  if (score >= 80) {
    return 'HIGH';
  }
  if (score >= 65) {
    return 'MEDIUM';
  }
  return 'LOW';
};

export const buildRoleSearchLinks = (role: string) => {
  const query = encodeURIComponent(`${role} fresher jobs`);
  return {
    linkedIn: `https://www.linkedin.com/jobs/search/?keywords=${query}`,
    glassdoor: `https://www.glassdoor.co.in/Job/jobs.htm?sc.keyword=${query}`
  };
};

export type RoadmapWeek = {
  week: number;
  focusSkill: string;
  tasks: string[];
  deliverable: string;
};

export type SkillGapRoadmap = {
  targetRole: string;
  currentSkills: string[];
  missingSkills: string[];
  weeklyPlan: RoadmapWeek[];
};

const resolveRole = (inputRole?: string): string => {
  if (!inputRole?.trim()) {
    return 'Full Stack Developer';
  }

  const normalizedInput = inputRole.trim().toLowerCase();
  const availableRoles = Object.keys(ROLE_SKILL_MAP);
  const exact = availableRoles.find((role) => role.toLowerCase() === normalizedInput);
  if (exact) {
    return exact;
  }

  const fuzzy = availableRoles.find((role) => role.toLowerCase().includes(normalizedInput));
  return fuzzy ?? 'Full Stack Developer';
};

export const generateSkillGapRoadmap = (skills: string[], inputRole?: string): SkillGapRoadmap => {
  const targetRole = resolveRole(inputRole);
  const roleSkills = ROLE_SKILL_MAP[targetRole] ?? ROLE_SKILL_MAP['Full Stack Developer'];
  const normalizedSkills = new Set(skills.map(normalize));
  const missingSkills = roleSkills.filter((skill) => !normalizedSkills.has(normalize(skill)));
  const focusQueue = missingSkills.length ? missingSkills : roleSkills.slice(0, 3);

  const weeklyPlan: RoadmapWeek[] = focusQueue.slice(0, 6).map((focusSkill, index) => ({
    week: index + 1,
    focusSkill,
    tasks: [
      `Study core concepts and syntax of ${focusSkill}`,
      `Build one mini project using ${focusSkill}`,
      `Add the project to GitHub with clean README and screenshots`
    ],
    deliverable: `Portfolio-ready ${focusSkill} project with clear problem statement and deployment link`
  }));

  return {
    targetRole,
    currentSkills: [...new Set(skills)],
    missingSkills,
    weeklyPlan
  };
};
