# Novelty Claim and Contributions

## Problem Statement
Conventional ATS and hiring portals are often optimized for basic keyword filtering, with limited explainability and weak fairness controls. This project addresses ranking quality, transparency, and equity in a single deployable system.

## Main Contributions
1. Hybrid ranking pipeline combining lexical, explicit skill, and semantic alignment signals for resume-job fit.
2. Explainable recruiter copilot that surfaces matched/missing skills and score rationale for each shortlisted candidate.
3. Fairness-aware shortlist adjustment with measurable disparate impact comparison.
4. Candidate-side adaptive guidance: skill-gap roadmap, role suitability, and interview readiness generation.
5. End-to-end reproducibility support through admin evaluation endpoints and experiment templates.

## Claimed Novelty
- Integrates fairness-aware ranking and explainability directly into an operational job portal workflow.
- Couples recruiter-side ranking intelligence with candidate-side adaptive improvement, enabling closed-loop talent development.
- Exposes publication-oriented evaluation outputs (baseline, ablation, fairness, operational metrics) through production APIs.

## Evidence Mapping
- Hybrid ranking and explainability: `apps/server/src/modules/jobs/job-insights.ts`
- Candidate intelligence modules: `apps/server/src/modules/candidates/`
- Research evaluation endpoint: `apps/server/src/modules/admin/admin.routes.ts`
- Frontend research dashboard view: `apps/web/src/App.tsx`

## Expected Impact
- Better shortlist relevance for recruiters.
- Clearer actionability for candidates.
- More auditable and defensible ranking decisions for governance and research publication.
