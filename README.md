# Job Portal System

Production-style full-stack Job Portal with candidate, recruiter, and admin workflows.

## Stack
- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL + Prisma
- Real-time: Socket.IO
- Auth: JWT Access/Refresh + RBAC
- Testing: Vitest + Supertest

## Implemented Features
- Role-based auth (`CANDIDATE`, `RECRUITER`, `ADMIN`)
- Recruiter job CRUD with ownership checks
- Candidate apply/withdraw workflow
- Recruiter application status updates with real-time notifications
- Admin moderation APIs and aggregate stats
- Resume PDF upload endpoint (`multipart/form-data`)
- Input validation (Zod), rate limiting, helmet, centralized error handling

## Local Setup
1. Install dependencies:
```bash
npm install
```

2. Start PostgreSQL:
```bash
docker compose up -d
```

3. Configure environment files:
- Copy `apps/server/.env.example` to `apps/server/.env`
- Copy `apps/web/.env.example` to `apps/web/.env`

4. Prepare database and seed users:
```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

5. Start backend + frontend:
```bash
npm run dev
```

## Verification
```bash
npm run build
npm run test
curl -i http://localhost:4000/api/v1/health
```

## App URLs
- Web: `http://localhost:5173`
- API: `http://localhost:4000/api/v1`

## Seed Accounts
- Admin: `admin@jobportal.com` / `Admin@123`
- Recruiter: `recruiter@jobportal.com` / `Recruiter@123`
- Candidate: `candidate@jobportal.com` / `Candidate@123`

## Notes
- Uploaded resumes are stored under `uploads/resumes` and served via `/uploads/...`.
- CI runs both build and tests (`.github/workflows/ci.yml`).

## Full Documentation
- Complete technical documentation is available at `docs/FULL_PROJECT_DOCUMENTATION.md`.
- UML diagrams + proof submission pack is available at `docs/PROJECT_PROOF_PACK.md`.
