/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';

type SampleRow = {
  jobId: string;
  applicationId: string;
  candidateId: string;
  keywordScore: number;
  skillScore: number;
  semanticScore: number;
  isRelevant: 0 | 1;
  protectedGroup: string;
};

type Metrics = {
  precisionAtK: number;
  recallAtK: number;
  shortlistQuality: number;
};

const K = 5;

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseCsv(filePath: string): SampleRow[] {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  const [header, ...lines] = raw.split(/\r?\n/);
  const cols = header.split(',').map((s) => s.trim());
  const idx = Object.fromEntries(cols.map((name, i) => [name, i])) as Record<string, number>;

  return lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parts = line.split(',').map((s) => s.trim());
      return {
        jobId: parts[idx.jobId],
        applicationId: parts[idx.applicationId],
        candidateId: parts[idx.candidateId],
        keywordScore: Number(parts[idx.keywordScore]),
        skillScore: Number(parts[idx.skillScore]),
        semanticScore: Number(parts[idx.semanticScore]),
        isRelevant: Number(parts[idx.isRelevant]) as 0 | 1,
        protectedGroup: parts[idx.protectedGroup]
      };
    });
}

function byJob(rows: SampleRow[]): Map<string, SampleRow[]> {
  const out = new Map<string, SampleRow[]>();
  for (const row of rows) {
    const list = out.get(row.jobId) ?? [];
    list.push(row);
    out.set(row.jobId, list);
  }
  return out;
}

function topK(rows: SampleRow[], scoreFn: (row: SampleRow) => number, k = K): SampleRow[] {
  return [...rows].sort((a, b) => scoreFn(b) - scoreFn(a)).slice(0, k);
}

function evaluate(rows: SampleRow[], scoreFn: (row: SampleRow) => number): Metrics {
  const grouped = byJob(rows);
  let totalPrecision = 0;
  let totalRecall = 0;
  let jobCount = 0;

  for (const [, jobRows] of grouped) {
    const selected = topK(jobRows, scoreFn, K);
    const tp = selected.filter((r) => r.isRelevant === 1).length;
    const relevantTotal = jobRows.filter((r) => r.isRelevant === 1).length;

    totalPrecision += safeDiv(tp, K);
    totalRecall += safeDiv(tp, relevantTotal);
    jobCount += 1;
  }

  const precisionAtK = safeDiv(totalPrecision, jobCount);
  const recallAtK = safeDiv(totalRecall, jobCount);

  return {
    precisionAtK: round2(precisionAtK),
    recallAtK: round2(recallAtK),
    shortlistQuality: round2((precisionAtK * 0.7 + recallAtK * 0.3) * 100)
  };
}

function disparateImpact(rows: SampleRow[], scoreFn: (row: SampleRow) => number): number {
  const grouped = byJob(rows);
  let protectedSelected = 0;
  let protectedTotal = 0;
  let unprotectedSelected = 0;
  let unprotectedTotal = 0;

  for (const [, jobRows] of grouped) {
    const selectedIds = new Set(topK(jobRows, scoreFn, K).map((r) => r.applicationId));

    for (const row of jobRows) {
      const isProtected = row.protectedGroup !== 'none';
      const isSelected = selectedIds.has(row.applicationId);

      if (isProtected) {
        protectedTotal += 1;
        if (isSelected) {
          protectedSelected += 1;
        }
      } else {
        unprotectedTotal += 1;
        if (isSelected) {
          unprotectedSelected += 1;
        }
      }
    }
  }

  const protectedRate = safeDiv(protectedSelected, protectedTotal);
  const unprotectedRate = safeDiv(unprotectedSelected, unprotectedTotal);
  return round2(safeDiv(protectedRate, unprotectedRate));
}

function main() {
  const dataPath = process.argv[2] ?? path.join(process.cwd(), 'data', 'evaluation-sample.csv');

  if (!fs.existsSync(dataPath)) {
    console.error(`Dataset not found at: ${dataPath}`);
    process.exit(1);
  }

  const rows = parseCsv(dataPath);

  const keyword = evaluate(rows, (r) => r.keywordScore);
  const skill = evaluate(rows, (r) => r.skillScore);
  const hybrid = evaluate(rows, (r) => 0.45 * r.skillScore + 0.35 * r.semanticScore + 0.2 * r.keywordScore);
  const noSemantic = evaluate(rows, (r) => 0.75 * r.skillScore + 0.25 * r.keywordScore);

  const result = {
    dataset: {
      rows: rows.length,
      uniqueJobs: byJob(rows).size,
      topK: K
    },
    baselineComparison: {
      keywordOverlap: keyword,
      skillOverlap: skill,
      hybridModel: hybrid
    },
    ablation: {
      hybridNoSemantic: noSemantic
    },
    fairnessComparison: {
      hybridDisparateImpactRatio: disparateImpact(rows, (r) => 0.45 * r.skillScore + 0.35 * r.semanticScore + 0.2 * r.keywordScore),
      keywordDisparateImpactRatio: disparateImpact(rows, (r) => r.keywordScore)
    }
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
