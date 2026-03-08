const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);

export const cosineSimilarity = (a: string, b: string): number => {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (!tokensA.length || !tokensB.length) {
    return 0;
  }

  const freqA = new Map<string, number>();
  const freqB = new Map<string, number>();

  for (const token of tokensA) {
    freqA.set(token, (freqA.get(token) ?? 0) + 1);
  }
  for (const token of tokensB) {
    freqB.set(token, (freqB.get(token) ?? 0) + 1);
  }

  const allTokens = new Set([...freqA.keys(), ...freqB.keys()]);
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (const token of allTokens) {
    const va = freqA.get(token) ?? 0;
    const vb = freqB.get(token) ?? 0;
    dotProduct += va * vb;
    magA += va * va;
    magB += vb * vb;
  }

  if (!magA || !magB) {
    return 0;
  }

  return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
};
