import { CaseRecord, RecordBody, RunRecord, toCaseOutcomeCounts } from './run-record';
import { RunStore } from './run-store';
import { jsonPath } from './json-path';

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

export interface BodyOptions {
  request?: boolean; path?: string; outline?: boolean; range?: [number, number]; full?: boolean; cap?: number;
}

export interface BodyResult {
  index: number; name: string; side: 'request' | 'response'; contentType?: string; bytes: number;
  encoding: 'text' | 'base64' | 'json'; truncated: boolean; content: string | unknown;
}

const DEFAULT_BODY_CAP = 32768;
const OUTLINE_MAX_DEPTH = 6;

function outlineOf(v: unknown, depth = 0): unknown {
  if (depth >= OUTLINE_MAX_DEPTH) return '…';
  if (Array.isArray(v)) {
    return v.length === 0 ? { $array: 0 } : { $array: v.length, item: outlineOf(v[0], depth + 1) };
  }
  if (v === null) return 'null';
  if (typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, outlineOf(x, depth + 1)]));
  }
  if (typeof v === 'string') return `string "${v.slice(0, 30)}…"`;
  return `${typeof v} ${String(v)}`;
}

export function caseBody(r: RunRecord, ref: string | number, o: BodyOptions = {}): BodyResult {
  const c = findCase(r, ref);
  const side = o.request ? 'request' : 'response';
  const body = o.request ? c.request.body : c.response?.body;
  if (!body) throw new QueryError(`Case ${c.index} has no ${side} body`);

  let encoding: BodyResult['encoding'];
  let content: unknown;
  if (o.path !== undefined || o.outline) {
    let parsed: unknown;
    try {
      if (body.text === undefined) throw new Error('no text');
      parsed = JSON.parse(body.text);
    } catch {
      throw new QueryError('Body is not JSON');
    }
    encoding = 'json';
    content = o.path !== undefined ? jsonPath(parsed, o.path) : outlineOf(parsed);
  } else if (o.range) {
    if (body.text === undefined) throw new QueryError('Range needs a text body');
    encoding = 'text';
    content = body.text.slice(o.range[0], o.range[1]);
  } else if (body.text !== undefined) {
    encoding = 'text';
    content = body.text;
  } else {
    encoding = 'base64';
    content = body.base64 ?? '';
  }

  const cap = o.cap ?? DEFAULT_BODY_CAP;
  const serialised = encoding === 'json' ? JSON.stringify(content) : (content as string);
  let truncated = false;
  if (!o.full && serialised.length > cap) {
    content = serialised.slice(0, cap);
    truncated = true;
  }

  const out: BodyResult = { index: c.index, name: c.name, side, bytes: body.bytes, encoding, truncated, content };
  if (body.contentType !== undefined) out.contentType = body.contentType;
  return out;
}
