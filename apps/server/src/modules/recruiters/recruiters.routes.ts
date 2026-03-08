import { Router } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { requireAuth, requireRole } from '../../middlewares/auth';
import { validateBody } from '../../middlewares/validate';
import { ok } from '../../utils/http';
import { createCompanySchema, updateCompanySchema, updateRecruiterSchema } from './recruiters.validation';

const router = Router();

router.use(requireAuth, requireRole(Role.RECRUITER));

router.get('/me', async (req, res) => {
  const profile = await prisma.recruiterProfile.findUnique({
    where: { userId: req.user!.id },
    include: { company: true }
  });
  return ok(res, profile);
});

router.patch('/me', validateBody(updateRecruiterSchema), async (req, res) => {
  const profile = await prisma.recruiterProfile.update({
    where: { userId: req.user!.id },
    data: req.body,
    include: { company: true }
  });
  return ok(res, profile, 'Recruiter profile updated');
});

router.post('/company', validateBody(createCompanySchema), async (req, res) => {
  const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
  if (!recruiter) {
    return res.status(404).json({ message: 'Recruiter profile missing' });
  }

  const company = await prisma.company.create({ data: req.body });
  await prisma.recruiterProfile.update({
    where: { id: recruiter.id },
    data: { companyId: company.id }
  });

  return ok(res, company, 'Company created');
});

router.patch('/company/:companyId', validateBody(updateCompanySchema), async (req, res) => {
  const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
  if (!recruiter || recruiter.companyId !== req.params.companyId) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const company = await prisma.company.update({
    where: { id: req.params.companyId },
    data: req.body
  });
  return ok(res, company, 'Company updated');
});

export default router;
