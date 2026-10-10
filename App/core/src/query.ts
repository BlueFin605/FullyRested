import { CaseRecord, RecordBody, RunRecord, toCaseOutcomeCounts } from './run-record';
import { RunStore } from './run-store';

export class QueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryError';
  }
}

export async function resolveRun(stores: RunStore[], runId?: string): Promise<RunRecord> {
  if (runId === undefined) {
    const listings = (await Promise.all(stores.map(s => s.list()))).flat();
    if (listings.length === 0) throw new QueryError('No runs recorded yet. Use run first.');
    const newest = listings.reduce((a, b) => (b.runId > a.runId ? b : a));
    for (const store of stores) {
      const found = await store.load(newest.runId);
      if (found) return found;
    }
    throw new QueryError('No runs recorded yet. Use run first.');
  }
  for (const store of stores) {
    const found = await store.load(runId);
    if (found) return found;
  }
  const ids = [...new Set((await Promise.all(stores.map(s => s.list()))).flat().map(l => l.runId))]
    .sort().reverse().slice(0, 5);
  throw new QueryError(`Run '${runId}' not found. Recent runs: ${ids.join(', ')}`);
}

export function findCase(r: RunRecord, ref: string | number): CaseRecord {
  let found: CaseRecord | undefined;
  if (typeof ref === 'number' || /^\d+$/.test(ref)) {
    const index = Number(ref);
    found = r.cases.find(c => c.index === index);
  } else {
    found = r.cases.find(c => c.name === ref)
      ?? r.cases.find(c => c.name.toLowerCase() === ref.toLowerCase());
  }
  if (!found) {
    const list = r.cases.slice(0, 5).map(c => `${c.index} ${c.name}`).join(', ');
    throw new QueryError(`Case '${ref}' not found. The run has ${r.cases.length} cases: ${list}`);
  }
  return found;
}

const bodyMeta = (b: RecordBody | undefined): { contentType?: string; bytes: number } | undefined => {
  if (!b) return undefined;
  const meta: { contentType?: string; bytes: number } = { bytes: b.bytes };
  if (b.contentType !== undefined) meta.contentType = b.contentType;
  return meta;
};

export function summary(r: RunRecord) {
  return {
    runId: r.runId,
    startedAt: r.startedAt,
    environment: r.environment,
    selection: r.selection,
    ...toCaseOutcomeCounts(r.cases),
    cases: r.cases.map(c => {
      const row: { index: number; name: string; outcome: CaseRecord['outcome']; status?: number; ms: number } =
        { index: c.index, name: c.name, outcome: c.outcome, ms: c.ms };
      if (c.response) row.status = c.response.status;
      return row;
    })
  };
}

export function failures(r: RunRecord) {
  const bad = r.cases.filter(c => c.outcome !== 'pass');
  return {
    runId: r.runId,
    count: bad.length,
    cases: bad.map(c => {
      const row: {
        index: number; name: string; outcome: CaseRecord['outcome']; status?: number; error?: string;
        failedChecks: { check: string; errors: string[] }[];
      } = {
        index: c.index, name: c.name, outcome: c.outcome,
        failedChecks: (c.validation?.checks ?? []).filter(k => !k.passed).map(k => ({ check: k.check, errors: k.errors }))
      };
      if (c.response) row.status = c.response.status;
      if (c.error !== undefined) row.error = c.error;
      return row;
    })
  };
}

export function caseRequest(r: RunRecord, ref: string | number) {
  const c = findCase(r, ref);
  const out: {
    index: number; name: string; method: string; url: string; headers: Record<string, string>;
    body?: { contentType?: string; bytes: number };
  } = { index: c.index, name: c.name, method: c.request.method, url: c.request.url, headers: c.request.headers };
  const body = bodyMeta(c.request.body);
  if (body) out.body = body;
  return out;
}

export function caseResponse(r: RunRecord, ref: string | number) {
  const c = findCase(r, ref);
  if (!c.response) throw new QueryError(`Case ${c.index} got no response: ${c.error ?? 'unknown error'}`);
  const out: {
    index: number; name: string; status: number; statusText: string; ms: number; headers: Record<string, string>;
    body?: { contentType?: string; bytes: number };
  } = {
    index: c.index, name: c.name, status: c.response.status, statusText: c.response.statusText ?? '',
    ms: c.ms, headers: c.response.headers
  };
  const body = bodyMeta(c.response.body);
  if (body) out.body = body;
  return out;
}
