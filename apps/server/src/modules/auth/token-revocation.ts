type RevokedTokenRecord = {
  expiresAt: Date;
  reason: 'logout' | 'rotation' | 'reuse-detected';
};

const revokedRefreshTokens = new Map<string, RevokedTokenRecord>();

const cleanupExpiredRevocations = () => {
  const now = Date.now();
  for (const [tokenHash, data] of revokedRefreshTokens.entries()) {
    if (data.expiresAt.getTime() <= now) {
      revokedRefreshTokens.delete(tokenHash);
    }
  }
};

export const revokeRefreshTokenHash = (
  tokenHash: string,
  expiresAt: Date,
  reason: RevokedTokenRecord['reason']
) => {
  cleanupExpiredRevocations();
  revokedRefreshTokens.set(tokenHash, { expiresAt, reason });
};

export const isRefreshTokenHashRevoked = (tokenHash: string): boolean => {
  cleanupExpiredRevocations();
  return revokedRefreshTokens.has(tokenHash);
};
