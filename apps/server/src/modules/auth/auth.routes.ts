import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { validateBody } from '../../middlewares/validate';
import { loginSchema, registerSchema } from './auth.validation';
import { created, ok } from '../../utils/http';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from '../../utils/jwt';
import { requireAuth } from '../../middlewares/auth';
import {
  isRefreshTokenHashRevoked,
  revokeRefreshTokenHash
} from './token-revocation';

const router = Router();

router.post('/register', validateBody(registerSchema), async (req, res) => {
  const { fullName, email, password, role } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ message: 'Email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      fullName,
      email,
      passwordHash,
      role: role as Role,
      candidate: role === 'CANDIDATE' ? { create: { skills: [] } } : undefined
    }
  });

  if (role === 'RECRUITER') {
    const company = await prisma.company.create({ data: { name: `${fullName} Company` } });
    await prisma.recruiterProfile.create({
      data: {
        userId: user.id,
        companyId: company.id
      }
    });
  }

  return created(res, { id: user.id, email: user.email, role: user.role }, 'User registered');
});

router.post('/login', validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (!user.isActive) {
    return res.status(403).json({ message: 'Account deactivated' });
  }

  const payload = { userId: user.id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });

  return ok(
    res,
    {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role
      }
    },
    'Login successful'
  );
});

router.post('/refresh-token', async (req, res) => {
  const token = req.body?.refreshToken;
  if (!token) {
    return res.status(400).json({ message: 'refreshToken is required' });
  }

  try {
    const payload = verifyRefreshToken(token);
    const tokenHash = hashToken(token);

    if (isRefreshTokenHashRevoked(tokenHash)) {
      return res.status(401).json({ message: 'Refresh token has been revoked' });
    }

    const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!record || record.expiresAt < new Date()) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    // Rotate refresh token: revoke and remove old token, then issue a fresh token pair.
    revokeRefreshTokenHash(tokenHash, record.expiresAt, 'rotation');
    await prisma.refreshToken.deleteMany({ where: { tokenHash } });

    const newPayload = { userId: payload.userId, role: payload.role };
    const accessToken = signAccessToken(newPayload);
    const refreshToken = signRefreshToken(newPayload);
    const newTokenHash = hashToken(refreshToken);

    await prisma.refreshToken.create({
      data: {
        userId: payload.userId,
        tokenHash: newTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    return ok(res, { accessToken, refreshToken }, 'Token rotated');
  } catch {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
});

router.post('/logout', async (req, res) => {
  const token = req.body?.refreshToken;
  if (token) {
    const tokenHash = hashToken(token);
    const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (existing) {
      revokeRefreshTokenHash(tokenHash, existing.expiresAt, 'logout');
    }
    await prisma.refreshToken.deleteMany({ where: { tokenHash } });
  }
  return ok(res, null, 'Logged out');
});

router.post('/logout-all', requireAuth, async (req, res) => {
  const activeTokens = await prisma.refreshToken.findMany({ where: { userId: req.user!.id } });
  for (const token of activeTokens) {
    revokeRefreshTokenHash(token.tokenHash, token.expiresAt, 'logout');
  }
  await prisma.refreshToken.deleteMany({ where: { userId: req.user!.id } });

  return ok(res, null, 'Logged out from all devices');
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: {
      candidate: true,
      recruiter: {
        include: { company: true }
      }
    }
  });

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  return ok(res, user);
});

export default router;
