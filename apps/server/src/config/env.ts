import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function safeJwtExpiresIn(name: string, fallback: string): string {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) {
    return fallback;
  }

  // jwt/ms supports formats like 15m, 7d, 2h. Reject plain numbers and invalid words.
  if (/^\d+$/.test(raw)) {
    return fallback;
  }

  const normalized = raw.replace(/\s+/g, '').toLowerCase();
  if (!/^\d+(ms|s|m|h|d|w|y)$/.test(normalized)) {
    return fallback;
  }

  return normalized;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 4000),
  DATABASE_URL: required('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/jobportal?schema=public'),
  JWT_ACCESS_SECRET: required('JWT_ACCESS_SECRET', 'dev_access_secret_change_me'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_me'),
  JWT_ACCESS_EXPIRES_IN: safeJwtExpiresIn('JWT_ACCESS_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: safeJwtExpiresIn('JWT_REFRESH_EXPIRES_IN', '7d'),
  REDIS_URL: process.env.REDIS_URL,
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX ?? 200)
};
