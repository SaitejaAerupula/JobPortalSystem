import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from '../src/modules/auth/auth.validation';

describe('auth validation', () => {
  it('accepts strong registration payload', () => {
    const payload = {
      fullName: 'Candidate One',
      email: 'candidate@example.com',
      password: 'Strong@123',
      role: 'CANDIDATE'
    };

    const result = registerSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('rejects weak password', () => {
    const payload = {
      fullName: 'Candidate One',
      email: 'candidate@example.com',
      password: 'password',
      role: 'CANDIDATE'
    };

    const result = registerSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('normalizes login email', () => {
    const result = loginSchema.safeParse({ email: 'USER@Example.COM', password: 'Strong@123' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
    }
  });
});
