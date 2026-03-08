import { FormEvent, useEffect, useState } from 'react';
import { api, setAuthToken } from './api/client';
import {
  AdaptiveLearningPath,
  AdminApplicationsStats,
  AdminObservabilitySummary,
  AdminResearchEvaluation,
  Application,
  AtsScore,
  InterviewReadiness,
  Job,
  JobEligibilityReport,
  JobScamRiskReport,
  RecruiterCopilotReport,
  ResumeAnalysis,
  Role,
  SkillGapRoadmap,
  User
} from './types';

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as User) : null;
  });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [recommendedJobs, setRecommendedJobs] = useState<Job[]>([]);
  const [resumeAnalysis, setResumeAnalysis] = useState<ResumeAnalysis | null>(null);
  const [skillGapRoadmap, setSkillGapRoadmap] = useState<SkillGapRoadmap | null>(null);
  const [eligibilityReport, setEligibilityReport] = useState<JobEligibilityReport | null>(null);
  const [adaptivePath, setAdaptivePath] = useState<AdaptiveLearningPath | null>(null);
  const [interviewReadiness, setInterviewReadiness] = useState<InterviewReadiness | null>(null);
  const [adminStats, setAdminStats] = useState<AdminApplicationsStats | null>(null);
  const [adminObservability, setAdminObservability] = useState<AdminObservabilitySummary | null>(null);
  const [adminResearchEvaluation, setAdminResearchEvaluation] = useState<AdminResearchEvaluation | null>(null);
  const [copilotReport, setCopilotReport] = useState<RecruiterCopilotReport | null>(null);
  const [scamRiskReport, setScamRiskReport] = useState<JobScamRiskReport | null>(null);
  const [roadmapRole, setRoadmapRole] = useState('');
  const [eligibilityThreshold, setEligibilityThreshold] = useState(65);
  const [autoApplyLimit, setAutoApplyLimit] = useState(3);
  const [isAutoApplyConfirmOpen, setIsAutoApplyConfirmOpen] = useState(false);
  const [atsByApplication, setAtsByApplication] = useState<Record<string, AtsScore>>({});
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [email, setEmail] = useState('candidate@jobportal.com');
  const [password, setPassword] = useState('Candidate@123');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('CANDIDATE');
  const [isRegister, setIsRegister] = useState(false);
  const [message, setMessage] = useState('');
  const [jobForm, setJobForm] = useState({
    title: '',
    description: '',
    location: '',
    skillsRequired: 'React,Node.js,TypeScript',
    workMode: 'HYBRID',
    jobType: 'FULL_TIME',
    experienceLevel: 'JUNIOR',
    status: 'OPEN',
    openings: 1
  });

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    void loadJobs();
  }, []);

  useEffect(() => {
    if (token) {
      void loadEverything();
    }
  }, [token, user?.role]);

  async function loadEverything() {
    await Promise.all([
      loadJobs(),
      loadApplications(),
      loadRecommendations(),
      loadResumeAnalysis(),
      loadEligibilityReport(),
      loadAdminObservability(),
      loadAdminResearchEvaluation()
    ]);
  }

  async function loadJobs() {
    const res = await api.get('/jobs');
    setJobs(res.data.data);
  }

  async function loadApplications() {
    if (!user) {
      return;
    }

    if (user.role === 'CANDIDATE') {
      const res = await api.get('/candidates/me/applications');
      setApplications(res.data.data);
      return;
    }

    if (user.role === 'RECRUITER') {
      const ownJobs = await api.get('/jobs');
      const recruiterJobs = ownJobs.data.data as Job[];
      if (recruiterJobs.length === 0) {
        setApplications([]);
        return;
      }
      const appLists = await Promise.all(
        recruiterJobs.map((j) => api.get(`/jobs/${j.id}/applications`).then((r) => r.data.data as Application[]))
      );
      setApplications(appLists.flat());
      return;
    }

    if (user.role === 'ADMIN') {
      const stats = await api.get('/admin/applications/stats');
      setAdminStats(stats.data.data);
      setMessage(`Admin Stats -> Applications: ${stats.data.data.totalApplications}`);
    }
  }

  async function loadAdminObservability() {
    if (!user || user.role !== 'ADMIN') {
      setAdminObservability(null);
      return;
    }

    try {
      const res = await api.get('/admin/observability/summary');
      setAdminObservability(res.data.data);
    } catch (err: any) {
      setMessage(err?.response?.data?.message ?? 'Failed to load admin observability');
      setAdminObservability(null);
    }
  }

  async function loadAdminResearchEvaluation() {
    if (!user || user.role !== 'ADMIN') {
      setAdminResearchEvaluation(null);
      return;
    }

    try {
      const res = await api.get('/admin/research/evaluation');
      setAdminResearchEvaluation(res.data.data);
    } catch (err: any) {
      setMessage(err?.response?.data?.message ?? 'Failed to load research evaluation');
      setAdminResearchEvaluation(null);
    }
  }

  async function loadRecommendations() {
    if (!user || user.role !== 'CANDIDATE') {
      setRecommendedJobs([]);
      return;
    }

    const res = await api.get('/jobs/recommendations/me');
    setRecommendedJobs(res.data.data);
  }

  async function loadResumeAnalysis() {
    if (!user || user.role !== 'CANDIDATE') {
      setResumeAnalysis(null);
      return;
    }

    try {
      const res = await api.get('/candidates/me/resume-analysis');
      setResumeAnalysis(res.data.data);
    } catch {
      setResumeAnalysis(null);
    }
  }

  async function loadEligibilityReport() {
    if (!user || user.role !== 'CANDIDATE') {
      setEligibilityReport(null);
      return;
    }

    try {
      const res = await api.get('/candidates/me/job-eligibility', {
        params: { minScore: eligibilityThreshold }
      });
      setEligibilityReport(res.data.data);
    } catch {
      setEligibilityReport(null);
    }
  }

  async function loadAdaptivePath() {
    if (!user || user.role !== 'CANDIDATE') {
      setAdaptivePath(null);
      return;
    }

    try {
      const res = await api.get('/candidates/me/adaptive-learning-path');
      setAdaptivePath(res.data.data);
      setMessage('Adaptive learning path generated');
    } catch (err: any) {
      setMessage(err?.response?.data?.message ?? 'Failed to generate adaptive path');
      setAdaptivePath(null);
    }
  }

  async function loadInterviewReadiness() {
    if (!user || user.role !== 'CANDIDATE') {
      setInterviewReadiness(null);
      return;
    }

    try {
      const roleParam = roadmapRole.trim();
      const res = await api.get('/candidates/me/interview-readiness', {
        params: roleParam ? { role: roleParam } : undefined
      });
      setInterviewReadiness(res.data.data);
      setMessage('Interview readiness report generated');
    } catch (err: any) {
      setMessage(err?.response?.data?.message ?? 'Failed to generate interview readiness');
      setInterviewReadiness(null);
    }
  }

  async function applyTopEligibleJobs() {
    if (!user || user.role !== 'CANDIDATE') {
      return;
    }

    try {
      const res = await api.post('/candidates/me/apply-top-eligible', {
        minScore: eligibilityThreshold,
        limit: autoApplyLimit
      });
      const result = res.data.data as { applied: number; skipped: number; attempted: number };
      if (result.applied === 0 && result.attempted === 0) {
        setMessage('No new eligible jobs found to apply. Lower threshold or wait for more jobs.');
      } else if (result.applied === 0 && result.skipped > 0) {
        setMessage(`All selected jobs were already applied earlier. Skipped ${result.skipped}.`);
      } else {
        setMessage(`Auto-apply done: applied ${result.applied}, skipped ${result.skipped}, attempted ${result.attempted}`);
      }
      await Promise.all([loadApplications(), loadEligibilityReport()]);
    } catch (err: any) {
      setMessage(err?.response?.data?.message ?? 'Auto-apply failed');
    }
  }

  async function loadRecruiterCopilot(jobId: string) {
    try {
      const [copilotRes, riskRes] = await Promise.all([
        api.get(`/jobs/${jobId}/copilot-ranking`),
        api.get(`/jobs/${jobId}/scam-risk`)
      ]);
      setCopilotReport(copilotRes.data.data);
      setScamRiskReport(riskRes.data.data);
      setMessage('Recruiter copilot insights loaded');
    } catch (err: any) {
      setMessage(err?.response?.data?.message ?? 'Unable to load copilot insights');
    }
  }

  function openAutoApplyConfirm() {
    if (!eligibilityReport) {
      setMessage('Check resume-based eligibility first');
      return;
    }

    if (eligibilityReport.eligibleJobs.length === 0) {
      setMessage('No eligible jobs found for current threshold');
      return;
    }

    setIsAutoApplyConfirmOpen(true);
  }

  function closeAutoApplyConfirm() {
    setIsAutoApplyConfirmOpen(false);
  }

  async function generateSkillGapRoadmap() {
    if (!user || user.role !== 'CANDIDATE') {
      return;
    }

    try {
      const roleParam = roadmapRole.trim();
      const res = await api.get('/candidates/me/skill-gap-roadmap', {
        params: roleParam ? { role: roleParam } : undefined
      });
      setSkillGapRoadmap(res.data.data);
      setMessage('Skill gap roadmap generated');
    } catch (err: any) {
      setMessage(err?.response?.data?.message ?? 'Roadmap generation failed');
      setSkillGapRoadmap(null);
    }
  }

  async function downloadRoadmapPdf() {
    if (!skillGapRoadmap) {
      setMessage('Generate roadmap first');
      return;
    }

    const { default: JsPdf } = await import('jspdf');

    const doc = new JsPdf();
    let y = 14;
    const pageHeight = 280;

    const writeLine = (text: string, indent = 0) => {
      const lines = doc.splitTextToSize(text, 180 - indent) as string[];
      for (const line of lines) {
        if (y > pageHeight) {
          doc.addPage();
          y = 14;
        }
        doc.text(line, 14 + indent, y);
        y += 6;
      }
    };

    doc.setFontSize(16);
    writeLine('Skill Gap Roadmap');
    doc.setFontSize(12);
    writeLine(`Target Role: ${skillGapRoadmap.targetRole}`);
    writeLine(`Current Skills: ${skillGapRoadmap.currentSkills.join(', ') || 'N/A'}`);
    writeLine(`Missing Skills: ${skillGapRoadmap.missingSkills.join(', ') || 'None'}`);
    y += 2;

    for (const week of skillGapRoadmap.weeklyPlan) {
      doc.setFont('helvetica', 'bold');
      writeLine(`Week ${week.week}: ${week.focusSkill}`);
      doc.setFont('helvetica', 'normal');
      for (const task of week.tasks) {
        writeLine(`- ${task}`, 4);
      }
      writeLine(`Deliverable: ${week.deliverable}`, 4);
      y += 2;
    }

    const filename = `${skillGapRoadmap.targetRole.replace(/\s+/g, '_').toLowerCase()}_roadmap.pdf`;
    doc.save(filename);
  }

  async function onAuthSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    try {
      if (isRegister) {
        await api.post('/auth/register', { fullName, email, password, role });
        setMessage('Registration successful. Please login.');
        setIsRegister(false);
        return;
      }

      const res = await api.post('/auth/login', { email, password });
      const data = res.data.data as AuthResponse;
      setToken(data.accessToken);
      setUser(data.user);
      localStorage.setItem('token', data.accessToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      setAuthToken(data.accessToken);
      await loadEverything();
    } catch (err: any) {
      setMessage(err?.response?.data?.message ?? 'Authentication failed');
    }
  }

  function logout() {
    setToken(null);
    setUser(null);
    setApplications([]);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setAuthToken(null);
    setMessage('Logged out');
  }

  async function apply(jobId: string) {
    try {
      await api.post('/applications', { jobId, coverLetter: 'I am interested in this role.' });
      await loadApplications();
      setMessage('Applied successfully');
    } catch (err: any) {
      setMessage(err?.response?.data?.message ?? 'Apply failed');
    }
  }

  async function createJob(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/jobs', {
        ...jobForm,
        skillsRequired: jobForm.skillsRequired.split(',').map((s) => s.trim())
      });
      setJobForm({
        title: '',
        description: '',
        location: '',
        skillsRequired: 'React,Node.js,TypeScript',
        workMode: 'HYBRID',
        jobType: 'FULL_TIME',
        experienceLevel: 'JUNIOR',
        status: 'OPEN',
        openings: 1
      });
      await loadJobs();
      setMessage('Job created');
    } catch (err: any) {
      setMessage(err?.response?.data?.message ?? 'Create job failed');
    }
  }

  async function updateApplicationStatus(applicationId: string, status: string) {
    try {
      await api.patch(`/applications/${applicationId}/status`, { status });
      await loadApplications();
      setMessage('Application status updated');
    } catch (err: any) {
      setMessage(err?.response?.data?.message ?? 'Status update failed');
    }
  }

  async function uploadResume() {
    if (!resumeFile) {
      setMessage('Select a resume PDF first');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('resume', resumeFile);
      await api.post('/candidates/me/resume', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setMessage('Resume uploaded');
      setResumeFile(null);
      await Promise.all([loadRecommendations(), loadResumeAnalysis(), loadEligibilityReport()]);
    } catch (err: any) {
      setMessage(err?.response?.data?.message ?? 'Resume upload failed');
    }
  }

  async function checkAtsScore(applicationId: string) {
    try {
      const res = await api.get(`/applications/${applicationId}/ats-score`);
      setAtsByApplication((prev) => ({ ...prev, [applicationId]: res.data.data }));
    } catch (err: any) {
      setMessage(err?.response?.data?.message ?? 'ATS score check failed');
    }
  }

  const autoApplyPreviewJobs = eligibilityReport?.eligibleJobs.slice(0, autoApplyLimit) ?? [];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Job Portal System</h1>
          <p>Production-style candidate, recruiter, and admin workflow</p>
        </div>
        {user ? (
          <div className="user-box">
            <span>{user.fullName}</span>
            <span className="chip">{user.role}</span>
            <button onClick={logout}>Logout</button>
          </div>
        ) : null}
      </header>

      {!user ? (
        <section className="card auth-card">
          <h2>{isRegister ? 'Create Account' : 'Login'}</h2>
          <form onSubmit={onAuthSubmit} className="form-grid">
            {isRegister ? (
              <input
                placeholder="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            ) : null}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {isRegister ? (
              <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="CANDIDATE">Candidate</option>
                <option value="RECRUITER">Recruiter</option>
              </select>
            ) : null}
            <button type="submit">{isRegister ? 'Register' : 'Login'}</button>
          </form>
          <button className="link-btn" onClick={() => setIsRegister((v) => !v)}>
            {isRegister ? 'Switch to login' : 'Switch to register'}
          </button>
          <p className="hint">Use seeded logins from README for quick access.</p>
        </section>
      ) : (
        <main className="layout">
          <section className="card">
            <h2>Open Jobs</h2>
            <div className="list">
              {jobs.map((job) => (
                <article key={job.id} className="item">
                  <div>
                    <h3>{job.title}</h3>
                    <p>{job.company?.name} - {job.location}</p>
                    <small>{job.description}</small>
                  </div>
                  {user.role === 'CANDIDATE' ? (
                    <button onClick={() => apply(job.id)}>Apply</button>
                  ) : null}
                </article>
              ))}
              {jobs.length === 0 ? <p>No jobs found</p> : null}
            </div>
          </section>

          {user.role === 'RECRUITER' ? (
            <section className="card">
              <h2>Create Job</h2>
              <form className="form-grid" onSubmit={createJob}>
                <input
                  placeholder="Title"
                  value={jobForm.title}
                  onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                  required
                />
                <input
                  placeholder="Location"
                  value={jobForm.location}
                  onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })}
                  required
                />
                <textarea
                  placeholder="Description"
                  value={jobForm.description}
                  onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                  required
                />
                <input
                  placeholder="Skills comma separated"
                  value={jobForm.skillsRequired}
                  onChange={(e) => setJobForm({ ...jobForm, skillsRequired: e.target.value })}
                />
                <button type="submit">Post Job</button>
              </form>
            </section>
          ) : null}

          {user.role === 'RECRUITER' ? (
            <section className="card">
              <h2>Recruiter Copilot</h2>
              <p style={{ marginTop: 0 }}>Open incoming applications and run explainable ranking per job.</p>
              <div className="list" style={{ marginTop: 8 }}>
                {applications.slice(0, 8).map((app) => (
                  <article key={`copilot-job-${app.id}`} className="item">
                    <div>
                      <h3>{app.job.title}</h3>
                      <small>Job ID: {app.job.id}</small>
                    </div>
                    <button onClick={() => loadRecruiterCopilot(app.job.id)}>Run Copilot</button>
                  </article>
                ))}
                {applications.length === 0 ? <p>No recruiter applications yet</p> : null}
              </div>

              {copilotReport ? (
                <div style={{ marginTop: 12 }}>
                  <h3 style={{ marginBottom: 6 }}>
                    {copilotReport.job.title} - Ranked Shortlist ({copilotReport.totalApplicants} applicants)
                  </h3>
                  {copilotReport.shortlist.map((candidate) => (
                    <div key={`ranked-${candidate.applicationId}`} style={{ marginBottom: 8 }}>
                      <small>
                        {candidate.candidateName} ({candidate.candidateEmail}) | Score: {candidate.score}
                      </small>
                      <small>{candidate.explanation.text}</small>
                      <small>
                        Matched: {candidate.matchedSkills.join(', ') || 'None'} | Missing:{' '}
                        {candidate.missingSkills.join(', ') || 'None'}
                      </small>
                    </div>
                  ))}

                  <small>
                    Fairness Snapshot {'->'} Location DI: {copilotReport.fairnessAudit.disparateImpact.location} | Experience
                    DI: {copilotReport.fairnessAudit.disparateImpact.experience}
                  </small>
                </div>
              ) : null}

              {scamRiskReport ? (
                <div style={{ marginTop: 12 }}>
                  <h3 style={{ marginBottom: 6 }}>Job Trust and Safety</h3>
                  <small>
                    Risk Score: {scamRiskReport.riskScore} ({scamRiskReport.level}) for {scamRiskReport.title}
                  </small>
                  <small>
                    Flags: {scamRiskReport.reasons.join(' | ') || 'No obvious suspicious signal detected'}
                  </small>
                </div>
              ) : null}
            </section>
          ) : null}

          {user.role === 'CANDIDATE' ? (
            <section className="card">
              <h2>Resume and Recommendations</h2>
              <div className="form-grid">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                />
                <button onClick={uploadResume}>Upload Resume PDF</button>
              </div>
              <div className="list" style={{ marginTop: 12 }}>
                {resumeAnalysis ? (
                  <article className="item">
                    <div>
                      <h3>Resume Analysis</h3>
                      <p>
                        Word Count: {resumeAnalysis.resumeQuality.words} | Projects:{' '}
                        {resumeAnalysis.resumeQuality.hasProjectsSection ? 'Yes' : 'No'} | Experience:{' '}
                        {resumeAnalysis.resumeQuality.hasExperienceSection ? 'Yes' : 'No'}
                      </p>
                      <small>
                        Skills: {resumeAnalysis.extractedSkills.join(', ') || 'No recognizable skills yet'}
                      </small>
                      <div style={{ marginTop: 8 }}>
                        {resumeAnalysis.suggestedRoles.map((r) => (
                          <p key={r.role}>
                            {r.role}: {r.matchPercent}% | Missing: {r.missingSkills.join(', ') || 'None'} |{' '}
                            <a href={r.links.linkedIn} target="_blank" rel="noreferrer">
                              LinkedIn
                            </a>{' '}
                            |{' '}
                            <a href={r.links.glassdoor} target="_blank" rel="noreferrer">
                              Glassdoor
                            </a>
                          </p>
                        ))}
                      </div>
                      <div className="form-grid" style={{ marginTop: 10 }}>
                        <input
                          placeholder="Target role (optional, e.g. Backend Developer)"
                          value={roadmapRole}
                          onChange={(e) => setRoadmapRole(e.target.value)}
                        />
                        <button onClick={generateSkillGapRoadmap}>Generate Skill Gap Roadmap</button>
                        <button onClick={loadAdaptivePath}>Generate Adaptive Learning Path</button>
                        <button onClick={loadInterviewReadiness}>Check Interview Readiness</button>
                      </div>
                      {skillGapRoadmap ? (
                        <div style={{ marginTop: 10 }}>
                          <p>
                            Target Role: {skillGapRoadmap.targetRole} | Missing Skills:{' '}
                            {skillGapRoadmap.missingSkills.join(', ') || 'None'}
                          </p>
                          <button onClick={downloadRoadmapPdf}>Download Roadmap PDF</button>
                          {skillGapRoadmap.weeklyPlan.map((week) => (
                            <div key={`${week.week}-${week.focusSkill}`} style={{ marginBottom: 8 }}>
                              <small>
                                Week {week.week}: {week.focusSkill}
                              </small>
                              <small>Tasks: {week.tasks.join(' | ')}</small>
                              <small>Deliverable: {week.deliverable}</small>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {adaptivePath ? (
                        <div style={{ marginTop: 10 }}>
                          <p>
                            Before/After Success Rate: {adaptivePath.beforeAfter.beforeSuccessRate}% {'->'}{' '}
                            {adaptivePath.beforeAfter.projectedSuccessRate}% (expected lift +
                            {adaptivePath.beforeAfter.expectedLift}%)
                          </p>
                          <small>Priority Skills: {adaptivePath.prioritySkills.join(', ') || 'None'}</small>
                          {adaptivePath.weeklyProgress.map((week) => (
                            <div key={`adaptive-${week.week}`} style={{ marginTop: 6 }}>
                              <small>
                                Week {week.week}: {week.focusSkill} | Target: {week.metricTarget}
                              </small>
                              <small>Plan: {week.plan.join(' | ')}</small>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {interviewReadiness ? (
                        <div style={{ marginTop: 10 }}>
                          <p>
                            Interview Readiness for {interviewReadiness.targetRole}: {interviewReadiness.readinessScore}% |
                            ATS Potential Boost: +{interviewReadiness.atsPotentialBoost}%
                          </p>
                          <small>{interviewReadiness.recommendation}</small>
                          <small>
                            Matched: {interviewReadiness.matchedSkills.join(', ') || 'None'} | Missing:{' '}
                            {interviewReadiness.missingSkills.join(', ') || 'None'}
                          </small>
                          {interviewReadiness.mcqQuestions.slice(0, 3).map((q) => (
                            <div key={q.id} style={{ marginTop: 6 }}>
                              <small>
                                MCQ [{q.skill}]: {q.question}
                              </small>
                            </div>
                          ))}
                          {interviewReadiness.codingTasks.slice(0, 2).map((task) => (
                            <div key={task.id} style={{ marginTop: 6 }}>
                              <small>
                                Coding Task [{task.skill}]: {task.task}
                              </small>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="form-grid" style={{ marginTop: 10 }}>
                        <label>
                          Eligibility ATS Threshold (%):
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={eligibilityThreshold}
                            onChange={(e) => setEligibilityThreshold(Number(e.target.value || 65))}
                          />
                        </label>
                        <button onClick={loadEligibilityReport}>Check Resume-Based Eligibility</button>
                      </div>

                      {eligibilityReport ? (
                        <div style={{ marginTop: 10 }}>
                          <p>
                            Suitable Roles (ATS Fit):{' '}
                            {eligibilityReport.roleSuitability
                              .map((role) => `${role.role} (${role.atsRoleFitScore}%, ${role.fitLabel})`)
                              .join(' | ') || 'N/A'}
                          </p>

                          <small>
                            Eligible Jobs ({eligibilityReport.eligibleJobs.length}) at threshold {eligibilityReport.threshold}%
                          </small>
                          <div className="form-grid" style={{ marginTop: 8 }}>
                            <label>
                              Auto-apply top eligible jobs:
                              <input
                                type="number"
                                min={1}
                                max={10}
                                value={autoApplyLimit}
                                onChange={(e) => setAutoApplyLimit(Number(e.target.value || 3))}
                              />
                            </label>
                            <button onClick={openAutoApplyConfirm}>Apply to Top Eligible Jobs</button>
                          </div>
                          {eligibilityReport.eligibleJobs.slice(0, 8).map((job) => (
                            <div key={`eligible-${job.jobId}`} style={{ marginTop: 6 }}>
                              <small>
                                {job.title} - {job.company} ({job.location}) | ATS: {job.atsScore}% ({job.fitLabel})
                              </small>
                              <small>{job.reason}</small>
                            </div>
                          ))}

                          <small style={{ display: 'block', marginTop: 8 }}>
                            Improve For These Jobs ({eligibilityReport.improvementJobs.length})
                          </small>
                          {eligibilityReport.improvementJobs.slice(0, 5).map((job) => (
                            <div key={`improve-${job.jobId}`} style={{ marginTop: 6 }}>
                              <small>
                                {job.title} - ATS: {job.atsScore}% | Missing: {job.missingSkills.join(', ') || 'N/A'}
                              </small>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </article>
                ) : null}
                {recommendedJobs.map((job) => (
                  <article key={`rec-${job.id}`} className="item">
                    <div>
                      <h3>{job.title}</h3>
                      <p>
                        {job.company?.name} - Match: {job.recommendation?.score ?? 0}%
                      </p>
                      <small>
                        Matched: {(job.recommendation?.matchedSkills ?? []).join(', ') || 'None'} | Missing:{' '}
                        {(job.recommendation?.missingSkills ?? []).join(', ') || 'None'}
                      </small>
                      <small>
                        Skill Score: {job.recommendation?.skillScore ?? 0}% | Semantic Score:{' '}
                        {job.recommendation?.semanticScore ?? 0}%
                      </small>
                    </div>
                    <button onClick={() => apply(job.id)}>Apply</button>
                  </article>
                ))}
                {recommendedJobs.length === 0 ? <p>No recommendations yet</p> : null}
              </div>
            </section>
          ) : null}

          {user.role !== 'ADMIN' ? (
            <section className="card">
              <h2>{user.role === 'CANDIDATE' ? 'My Applications' : 'Incoming Applications'}</h2>
              <div className="list">
                {applications.map((app) => (
                  <article key={app.id} className="item">
                    <div>
                      <h3>{app.job.title}</h3>
                      <p>Status: {app.status}</p>
                      {app.candidate ? <small>{app.candidate.user.fullName}</small> : null}
                    </div>
                    {user.role === 'RECRUITER' ? (
                      <select
                        value={app.status}
                        onChange={(e) => updateApplicationStatus(app.id, e.target.value)}
                      >
                        <option>APPLIED</option>
                        <option>UNDER_REVIEW</option>
                        <option>SHORTLISTED</option>
                        <option>INTERVIEW_SCHEDULED</option>
                        <option>REJECTED</option>
                        <option>HIRED</option>
                      </select>
                    ) : null}
                    {user.role === 'CANDIDATE' ? (
                      <button onClick={() => checkAtsScore(app.id)}>Check ATS</button>
                    ) : null}
                    {user.role === 'CANDIDATE' && atsByApplication[app.id] ? (
                      <div>
                        <small>
                          ATS: {atsByApplication[app.id].totalScore}% | Skill:{' '}
                          {atsByApplication[app.id].breakdown.skillScore} | Semantic:{' '}
                          {atsByApplication[app.id].breakdown.semanticScore} | Exp:{' '}
                          {atsByApplication[app.id].breakdown.experienceScore}
                        </small>
                      </div>
                    ) : null}
                  </article>
                ))}
                {applications.length === 0 ? <p>No applications yet</p> : null}
              </div>
            </section>
          ) : null}

          {user.role === 'ADMIN' ? (
            <section className="card">
              <h2>Admin Monitoring</h2>
              <div className="form-grid" style={{ marginBottom: 10 }}>
                <button onClick={loadApplications}>Refresh Application Stats</button>
                <button onClick={loadAdminObservability}>Refresh Observability Summary</button>
                <button onClick={loadAdminResearchEvaluation}>Refresh Research Evaluation</button>
              </div>

              {adminStats ? (
                <div style={{ marginBottom: 10 }}>
                  <small>
                    Applications: {adminStats.totalApplications} | Jobs: {adminStats.totalJobs} | Users:{' '}
                    {adminStats.totalUsers}
                  </small>
                  <small>
                    Status Buckets:{' '}
                    {adminStats.statusBuckets
                      .map((bucket) => `${bucket.status}:${bucket._count.status}`)
                      .join(' | ') || 'N/A'}
                  </small>
                </div>
              ) : null}

              {adminObservability ? (
                <div>
                  <small>
                    Total Requests: {adminObservability.totalRequests} | Total Errors: {adminObservability.totalErrors}{' '}
                    | Error Rate: {adminObservability.errorRate}%
                  </small>

                  <small style={{ display: 'block', marginTop: 8 }}>Top Slow Routes</small>
                  {adminObservability.topSlowRoutes.map((route) => (
                    <div key={`slow-${route.route}`}>
                      <small>
                        {route.route} | avg {route.avgDurationMs}ms | count {route.count}
                      </small>
                    </div>
                  ))}

                  <small style={{ display: 'block', marginTop: 8 }}>Top Error-Heavy Routes</small>
                  {adminObservability.topErrorRoutes.map((route) => (
                    <div key={`err-${route.route}`}>
                      <small>
                        {route.route} | est errors {route.estimatedErrorCount} | avg {route.avgDurationMs}ms
                      </small>
                    </div>
                  ))}
                </div>
              ) : null}

              {adminResearchEvaluation ? (
                <div style={{ marginTop: 12 }}>
                  <small>
                    Dataset: jobs {adminResearchEvaluation.dataset.totalJobs} | applications{' '}
                    {adminResearchEvaluation.dataset.totalApplications} | split {adminResearchEvaluation.dataset.fixedSplit}
                  </small>
                  <small style={{ display: 'block', marginTop: 8 }}>Baseline Precision@K</small>
                  <small>
                    Keyword: {adminResearchEvaluation.baselineComparison.keywordOverlap.precisionAtK} | Skill:{' '}
                    {adminResearchEvaluation.baselineComparison.skillOverlap.precisionAtK} | Hybrid:{' '}
                    {adminResearchEvaluation.baselineComparison.hybridModel.precisionAtK}
                  </small>
                  <small style={{ display: 'block', marginTop: 8 }}>Ablation Precision@K</small>
                  <small>
                    No Semantic: {adminResearchEvaluation.ablation.hybridNoSemantic.precisionAtK} | No Fairness:{' '}
                    {adminResearchEvaluation.ablation.hybridNoFairness.precisionAtK} | No Adaptive:{' '}
                    {adminResearchEvaluation.ablation.hybridNoAdaptive.precisionAtK}
                  </small>
                  <small style={{ display: 'block', marginTop: 8 }}>
                    Fairness DI (without/with mitigation):{' '}
                    {adminResearchEvaluation.fairnessComparison.withoutMitigation.disparateImpactRatio} /{' '}
                    {adminResearchEvaluation.fairnessComparison.withMitigation.disparateImpactRatio}
                  </small>
                  <small>
                    Time-to-shortlist: {adminResearchEvaluation.operational.timeToShortlistHours} hours
                  </small>
                </div>
              ) : null}
            </section>
          ) : null}
        </main>
      )}

      {message ? <p className="snack">{message}</p> : null}

      {isAutoApplyConfirmOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Confirm auto apply">
          <div className="modal-card">
            <h3>Confirm Auto-Apply</h3>
            <p>
              You are about to apply to top {autoApplyPreviewJobs.length} eligible jobs at threshold {eligibilityThreshold}%.
            </p>
            <div className="modal-list">
              {autoApplyPreviewJobs.map((job) => (
                <div key={`preview-${job.jobId}`} className="modal-item">
                  <strong>{job.title}</strong>
                  <small>
                    {job.company} - {job.location} | ATS: {job.atsScore}% ({job.fitLabel})
                  </small>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="link-btn" onClick={closeAutoApplyConfirm}>
                Cancel
              </button>
              <button
                onClick={async () => {
                  await applyTopEligibleJobs();
                  closeAutoApplyConfirm();
                }}
              >
                Confirm and Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
