# Job Portal System - Complete Build Blueprint

Timeline: 2026-03-09 to 2026-05-02  
Goal: Build a production-style, real-time Job Portal that is resume-ready.

## 1) Complete Folder Structure

```txt
JobPortalSystem/
  apps/
    web/
      public/
      src/
        api/
        components/
          common/
          candidate/
          recruiter/
          admin/
        features/
          auth/
          jobs/
          applications/
          notifications/
          profile/
        hooks/
        layouts/
        pages/
          auth/
          candidate/
          recruiter/
          admin/
        routes/
        store/
        styles/
        types/
        utils/
      .env.example
      package.json
      tsconfig.json
      vite.config.ts
    server/
      prisma/
        schema.prisma
        migrations/
        seed.ts
      src/
        config/
        constants/
        middlewares/
        modules/
          auth/
            auth.controller.ts
            auth.service.ts
            auth.routes.ts
            auth.validation.ts
          users/
          candidates/
          recruiters/
          companies/
          jobs/
          applications/
          notifications/
          admin/
        sockets/
        utils/
        app.ts
        server.ts
      tests/
        auth.test.ts
        jobs.test.ts
        applications.test.ts
      .env.example
      package.json
      tsconfig.json
  packages/
    eslint-config/
    tsconfig/
    shared-types/
  docs/
    api/
      openapi.yaml
    architecture.md
    er-diagram.md
    deployment.md
  .github/
    workflows/
      ci.yml
  docker-compose.yml
  package.json
  README.md
```

## 2) Exact Database Schema (Prisma)

`apps/server/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  CANDIDATE
  RECRUITER
  ADMIN
}

enum JobType {
  FULL_TIME
  PART_TIME
  INTERNSHIP
  CONTRACT
}

enum ExperienceLevel {
  FRESHER
  JUNIOR
  MID
  SENIOR
  LEAD
}

enum WorkMode {
  ONSITE
  REMOTE
  HYBRID
}

enum JobStatus {
  DRAFT
  OPEN
  CLOSED
}

enum ApplicationStatus {
  APPLIED
  UNDER_REVIEW
  SHORTLISTED
  INTERVIEW_SCHEDULED
  REJECTED
  HIRED
}

enum NotificationType {
  APPLICATION_STATUS
  NEW_APPLICATION
  SYSTEM
}

model User {
  id             String         @id @default(cuid())
  fullName       String
  email          String         @unique
  passwordHash   String
  role           Role
  isEmailVerified Boolean       @default(false)
  isActive       Boolean        @default(true)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  candidate      CandidateProfile?
  recruiter      RecruiterProfile?

  notifications  Notification[]
  refreshTokens  RefreshToken[]

  @@index([role])
  @@index([createdAt])
}

model CandidateProfile {
  id               String        @id @default(cuid())
  userId           String        @unique
  headline         String?
  bio              String?
  skills           String[]
  experienceYears  Int           @default(0)
  location         String?
  resumeUrl        String?
  linkedInUrl      String?
  githubUrl        String?
  portfolioUrl     String?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  user             User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  applications     Application[]

  @@index([location])
}

model Company {
  id               String         @id @default(cuid())
  name             String
  website          String?
  description      String?
  logoUrl          String?
  location         String?
  size             String?
  industry         String?
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  recruiters       RecruiterProfile[]
  jobs             Job[]

  @@unique([name])
  @@index([industry])
}

model RecruiterProfile {
  id               String         @id @default(cuid())
  userId           String         @unique
  companyId        String
  designation      String?
  phone            String?
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  user             User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  company          Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)
  jobs             Job[]

  @@index([companyId])
}

model Job {
  id               String           @id @default(cuid())
  title            String
  description      String
  skillsRequired   String[]
  minSalary        Int?
  maxSalary        Int?
  currency         String           @default("INR")
  location         String
  workMode         WorkMode
  jobType          JobType
  experienceLevel  ExperienceLevel
  openings         Int              @default(1)
  status           JobStatus        @default(DRAFT)
  expiresAt        DateTime?
  companyId        String
  recruiterId      String
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  company          Company          @relation(fields: [companyId], references: [id], onDelete: Cascade)
  recruiter        RecruiterProfile @relation(fields: [recruiterId], references: [id], onDelete: Cascade)
  applications     Application[]

  @@index([companyId])
  @@index([recruiterId])
  @@index([status])
  @@index([location])
  @@index([jobType])
  @@index([workMode])
  @@index([experienceLevel])
  @@index([createdAt])
}

model Application {
  id               String            @id @default(cuid())
  jobId            String
  candidateId      String
  coverLetter      String?
  status           ApplicationStatus @default(APPLIED)
  recruiterNotes   String?
  appliedAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  job              Job               @relation(fields: [jobId], references: [id], onDelete: Cascade)
  candidate        CandidateProfile  @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  @@unique([jobId, candidateId])
  @@index([jobId])
  @@index([candidateId])
  @@index([status])
  @@index([appliedAt])
}

model Notification {
  id               String           @id @default(cuid())
  userId           String
  type             NotificationType
  title            String
  message          String
  isRead           Boolean          @default(false)
  metadata         Json?
  createdAt        DateTime         @default(now())

  user             User             @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([isRead])
  @@index([createdAt])
}

model RefreshToken {
  id               String           @id @default(cuid())
  userId           String
  tokenHash        String           @unique
  expiresAt        DateTime
  createdAt        DateTime         @default(now())

  user             User             @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}
```

## 3) API List (Endpoint-by-Endpoint)

Base path: `/api/v1`

### Auth
- `POST /auth/register` - Register candidate/recruiter
- `POST /auth/login` - Login
- `POST /auth/refresh-token` - Issue new access token
- `POST /auth/logout` - Revoke refresh token
- `GET /auth/me` - Current user profile

### Candidate
- `GET /candidates/me` - Get candidate profile
- `PATCH /candidates/me` - Update profile
- `POST /candidates/me/resume` - Upload resume
- `GET /candidates/me/applications` - My applications
- `GET /candidates/me/notifications` - My notifications
- `PATCH /candidates/me/notifications/:id/read` - Mark one as read
- `PATCH /candidates/me/notifications/read-all` - Mark all as read

### Recruiter
- `GET /recruiters/me` - Get recruiter profile
- `PATCH /recruiters/me` - Update recruiter profile
- `POST /recruiters/company` - Create company (first time)
- `PATCH /recruiters/company/:companyId` - Update company

### Jobs
- `POST /jobs` - Create job (recruiter)
- `GET /jobs` - Public job list with filters/search/pagination
- `GET /jobs/:jobId` - Job details
- `PATCH /jobs/:jobId` - Update job (owner recruiter)
- `DELETE /jobs/:jobId` - Delete job (owner recruiter/admin)
- `PATCH /jobs/:jobId/status` - Set `DRAFT/OPEN/CLOSED`
- `GET /jobs/:jobId/applications` - List applicants (recruiter/admin)

### Applications
- `POST /applications` - Candidate applies (`jobId`, `coverLetter`)
- `GET /applications/:applicationId` - Application detail
- `PATCH /applications/:applicationId/status` - Recruiter updates status
- `PATCH /applications/:applicationId/notes` - Recruiter notes
- `DELETE /applications/:applicationId` - Candidate withdraw application

### Notifications
- `GET /notifications` - Current user notifications
- `PATCH /notifications/:id/read` - Mark read
- `PATCH /notifications/read-all` - Mark all read

### Admin
- `GET /admin/users` - User list + filters
- `PATCH /admin/users/:userId/status` - Activate/deactivate user
- `GET /admin/jobs` - All jobs moderation view
- `DELETE /admin/jobs/:jobId` - Remove invalid job
- `GET /admin/applications/stats` - Global stats

### Health
- `GET /health` - Service health check

## 4) Day-by-Day Checklist (2026-03-09 to 2026-05-02)

- 2026-03-09: Finalize scope, roles, and feature list.
- 2026-03-10: Set up monorepo folders and base configs.
- 2026-03-11: Initialize frontend app (React + TS + Tailwind).
- 2026-03-12: Initialize backend app (Express + TS).
- 2026-03-13: Set up PostgreSQL and Prisma.
- 2026-03-14: Add Prisma schema and run first migration.
- 2026-03-15: Add seed script with sample users/company/jobs.

- 2026-03-16: Implement auth register API.
- 2026-03-17: Implement auth login API + JWT.
- 2026-03-18: Implement refresh token flow.
- 2026-03-19: Add auth middleware + RBAC guards.
- 2026-03-20: Build frontend auth pages.
- 2026-03-21: Connect auth APIs to frontend.
- 2026-03-22: Test auth end-to-end and fix edge cases.

- 2026-03-23: Build candidate profile backend APIs.
- 2026-03-24: Build candidate profile frontend pages.
- 2026-03-25: Integrate Cloudinary resume upload.
- 2026-03-26: Build recruiter profile APIs.
- 2026-03-27: Build company create/update APIs.
- 2026-03-28: Build recruiter dashboard UI.
- 2026-03-29: Validate role access boundaries.

- 2026-03-30: Build job create API.
- 2026-03-31: Build job update/delete/status APIs.
- 2026-04-01: Build public jobs list API with filters.
- 2026-04-02: Build job details API.
- 2026-04-03: Build job listing and details frontend pages.
- 2026-04-04: Add search bar, filters, pagination UI.
- 2026-04-05: Integration testing for jobs module.

- 2026-04-06: Build apply-to-job API.
- 2026-04-07: Build candidate applications list API.
- 2026-04-08: Build recruiter applicants list API.
- 2026-04-09: Build update application status API.
- 2026-04-10: Build application tracker UI for candidate.
- 2026-04-11: Build applicant management UI for recruiter.
- 2026-04-12: Validate full application workflow.

- 2026-04-13: Add Socket.IO server setup.
- 2026-04-14: Emit events on status changes.
- 2026-04-15: Build notifications table + APIs.
- 2026-04-16: Build notification bell + list UI.
- 2026-04-17: Real-time frontend listeners and toasts.
- 2026-04-18: Add read/read-all notification actions.
- 2026-04-19: Test real-time flows with 2+ users.

- 2026-04-20: Build admin users moderation APIs.
- 2026-04-21: Build admin jobs moderation APIs.
- 2026-04-22: Build admin stats API.
- 2026-04-23: Build admin panel frontend.
- 2026-04-24: Add audit-friendly logs for critical actions.
- 2026-04-25: Add request validation and centralized errors.
- 2026-04-26: Security pass (rate limits, CORS, helmet).

- 2026-04-27: Write API tests for auth/jobs/applications.
- 2026-04-28: Add linting/formatting and fix issues.
- 2026-04-29: Add CI workflow (lint + test).
- 2026-04-30: Deploy backend + database.
- 2026-05-01: Deploy frontend and connect production APIs.
- 2026-05-02: Final QA, README polish, architecture diagram, resume bullets.

## 5) Resume Skills You Can Claim (After Completing)

- Full-Stack Development (`React`, `Node.js`, `TypeScript`)
- REST API Design and Secure Auth (`JWT`, `RBAC`, refresh tokens)
- Database Modeling and Query Optimization (`PostgreSQL`, `Prisma`)
- Real-Time Systems (`Socket.IO`, notifications)
- Cloud Integrations (`Cloudinary`, Vercel/Render deployment)
- Testing and CI/CD (`Jest`, `Supertest`, GitHub Actions)
- Production Engineering (validation, error handling, logging, security hardening)

## 6) Resume Bullet (Use This)

Built and deployed a full-stack Job Portal platform with Candidate/Recruiter/Admin workflows, real-time application status notifications via Socket.IO, and secure JWT + RBAC authentication, using React, Node.js, TypeScript, PostgreSQL, and Prisma.
