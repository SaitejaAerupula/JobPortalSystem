export type Role = 'CANDIDATE' | 'RECRUITER' | 'ADMIN';

export type User = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
};

export type Job = {
  id: string;
  title: string;
  description: string;
  location: string;
  status: string;
  company: {
    name: string;
  };
  recommendation?: {
    score: number;
    skillScore?: number;
    semanticScore?: number;
    matchedSkills: string[];
    missingSkills: string[];
  };
};

export type AdminApplicationsStats = {
  totalApplications: number;
  totalJobs: number;
  totalUsers: number;
  statusBuckets: Array<{
    status: string;
    _count: {
      status: number;
    };
  }>;
};

export type AdminObservabilitySummary = {
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  topSlowRoutes: Array<{
    route: string;
    count: number;
    totalDurationMs: number;
    avgDurationMs: number;
  }>;
  topErrorRoutes: Array<{
    route: string;
    count: number;
    estimatedErrorCount: number;
    avgDurationMs: number;
  }>;
};

export type Application = {
  id: string;
  status: string;
  coverLetter?: string;
  job: Job;
  candidate?: {
    user: {
      fullName: string;
      email: string;
    };
  };
};

export type Notification = {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

export type AtsScore = {
  applicationId: string;
  totalScore: number;
  breakdown: {
    skillScore: number;
    semanticScore: number;
    experienceScore: number;
    profileScore: number;
  };
  matchedSkills: string[];
  missingSkills: string[];
};

export type ResumeAnalysis = {
  extractedSkills: string[];
  resumeQuality: {
    words: number;
    hasProjectsSection: boolean;
    hasExperienceSection: boolean;
    hasEducationSection: boolean;
  };
  suggestedRoles: Array<{
    role: string;
    matchPercent: number;
    matchedSkills: string[];
    missingSkills: string[];
    links: {
      linkedIn: string;
      glassdoor: string;
    };
  }>;
};

export type SkillGapRoadmap = {
  targetRole: string;
  currentSkills: string[];
  missingSkills: string[];
  weeklyPlan: Array<{
    week: number;
    focusSkill: string;
    tasks: string[];
    deliverable: string;
  }>;
};

export type JobEligibilityReport = {
  threshold: number;
  roleSuitability: Array<{
    role: string;
    matchPercent: number;
    matchedSkills: string[];
    missingSkills: string[];
    atsRoleFitScore: number;
    fitLabel: 'HIGH' | 'MEDIUM' | 'LOW';
    links: {
      linkedIn: string;
      glassdoor: string;
    };
  }>;
  eligibleJobs: Array<{
    jobId: string;
    title: string;
    location: string;
    company: string;
    atsScore: number;
    fitLabel: 'HIGH' | 'MEDIUM' | 'LOW';
    matchedSkills: string[];
    missingSkills: string[];
    isEligible: boolean;
    reason: string;
  }>;
  improvementJobs: Array<{
    jobId: string;
    title: string;
    location: string;
    company: string;
    atsScore: number;
    fitLabel: 'HIGH' | 'MEDIUM' | 'LOW';
    matchedSkills: string[];
    missingSkills: string[];
    isEligible: boolean;
    reason: string;
  }>;
  alreadyAppliedJobs?: Array<{
    jobId: string;
    title: string;
    location: string;
    company: string;
    atsScore: number;
    fitLabel: 'HIGH' | 'MEDIUM' | 'LOW';
    matchedSkills: string[];
    missingSkills: string[];
    isEligible: boolean;
    reason: string;
  }>;
};

export type RecruiterCopilotReport = {
  job: {
    id: string;
    title: string;
  };
  totalApplicants: number;
  shortlist: Array<{
    applicationId: string;
    candidateId: string;
    candidateName: string;
    candidateEmail: string;
    score: number;
    explanation: {
      skills: number;
      experience: number;
      projectRelevance: number;
      text: string;
    };
    matchedSkills: string[];
    missingSkills: string[];
  }>;
  fairnessAudit: {
    locationSelection: Array<{
      group: string;
      totalApplicants: number;
      selectedApplicants: number;
      selectionRate: number;
    }>;
    experienceSelection: Array<{
      group: string;
      totalApplicants: number;
      selectedApplicants: number;
      selectionRate: number;
    }>;
    disparateImpact: {
      location: number;
      experience: number;
    };
  };
};

export type JobScamRiskReport = {
  jobId: string;
  title: string;
  company: string;
  riskScore: number;
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  reasons: string[];
};

export type AdminResearchEvaluation = {
  dataset: {
    totalJobs: number;
    totalApplications: number;
    fixedSplit: string;
  };
  baselineComparison: {
    keywordOverlap: {
      precisionAtK: number;
      recallAtK: number;
      shortlistQuality: number;
    };
    skillOverlap: {
      precisionAtK: number;
      recallAtK: number;
      shortlistQuality: number;
    };
    hybridModel: {
      precisionAtK: number;
      recallAtK: number;
      shortlistQuality: number;
    };
  };
  ablation: {
    hybridNoSemantic: {
      precisionAtK: number;
      recallAtK: number;
      shortlistQuality: number;
    };
    hybridNoFairness: {
      precisionAtK: number;
      recallAtK: number;
      shortlistQuality: number;
    };
    hybridNoAdaptive: {
      precisionAtK: number;
      recallAtK: number;
      shortlistQuality: number;
    };
  };
  fairnessComparison: {
    withoutMitigation: {
      disparateImpactRatio: number;
      precisionAtK: number;
    };
    withMitigation: {
      disparateImpactRatio: number;
      precisionAtK: number;
    };
  };
  operational: {
    timeToShortlistHours: number;
  };
};

export type AdaptiveLearningPath = {
  prioritySkills: string[];
  weeklyProgress: Array<{
    week: number;
    focusSkill: string;
    plan: string[];
    metricTarget: string;
  }>;
  beforeAfter: {
    beforeSuccessRate: number;
    projectedSuccessRate: number;
    expectedLift: number;
  };
};

export type InterviewReadiness = {
  targetRole: string;
  readinessScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  atsPotentialBoost: number;
  recommendation: string;
  mcqQuestions: Array<{
    id: string;
    skill: string;
    question: string;
    options: string[];
    answer: string;
  }>;
  codingTasks: Array<{
    id: string;
    skill: string;
    task: string;
  }>;
};
