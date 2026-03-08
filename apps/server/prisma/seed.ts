import { PrismaClient, Role, JobStatus, WorkMode, JobType, ExperienceLevel } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  await prisma.refreshToken.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.application.deleteMany();
  await prisma.job.deleteMany();
  await prisma.recruiterProfile.deleteMany();
  await prisma.candidateProfile.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();

  const [adminHash, recruiterHash, candidateHash] = await Promise.all([
    bcrypt.hash('Admin@123', 10),
    bcrypt.hash('Recruiter@123', 10),
    bcrypt.hash('Candidate@123', 10)
  ]);

  const admin = await prisma.user.create({
    data: {
      fullName: 'System Admin',
      email: 'admin@jobportal.com',
      passwordHash: adminHash,
      role: Role.ADMIN,
      isEmailVerified: true
    }
  });

  const recruiterUser = await prisma.user.create({
    data: {
      fullName: 'Recruiter One',
      email: 'recruiter@jobportal.com',
      passwordHash: recruiterHash,
      role: Role.RECRUITER,
      isEmailVerified: true
    }
  });

  const candidateUser = await prisma.user.create({
    data: {
      fullName: 'Candidate One',
      email: 'candidate@jobportal.com',
      passwordHash: candidateHash,
      role: Role.CANDIDATE,
      isEmailVerified: true
    }
  });

  const company = await prisma.company.create({
    data: {
      name: 'Acme Tech',
      description: 'Product engineering company',
      location: 'Hyderabad',
      industry: 'Software'
    }
  });

  const recruiter = await prisma.recruiterProfile.create({
    data: {
      userId: recruiterUser.id,
      companyId: company.id,
      designation: 'Senior Talent Partner'
    }
  });

  await prisma.candidateProfile.create({
    data: {
      userId: candidateUser.id,
      headline: 'Full Stack Developer',
      skills: ['Node.js', 'React', 'TypeScript'],
      experienceYears: 0,
      location: 'Hyderabad'
    }
  });

  await prisma.job.create({
    data: {
      title: 'Full Stack Developer Intern',
      description: 'Work on React and Node APIs for product features.',
      skillsRequired: ['React', 'Node.js', 'TypeScript'],
      location: 'Hyderabad',
      workMode: WorkMode.HYBRID,
      jobType: JobType.INTERNSHIP,
      experienceLevel: ExperienceLevel.FRESHER,
      status: JobStatus.OPEN,
      companyId: company.id,
      recruiterId: recruiter.id,
      openings: 2
    }
  });

  console.log('Seed completed', { adminId: admin.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
