import { CaseRecord, RecordBody, RunRecord, toCaseOutcomeCounts } from './run-record';
import { RunListing, RunStore } from './run-store';
import { jsonPath } from './json-path';
import { QueryError } from './query-error';

export { QueryError } from './query-error';

// Newest first. Run ids order by the second they started; startedAt (ms) breaks a same-second tie
function newestFirst(a: RunListing, b: RunListing): number {
  const second = (l: RunListing) => l.runId.slice(0, 15);
  if (second(a) !== second(b)) return second(a) < second(b) ? 1 : -1;
  if (a.startedAt !== b.startedAt) return a.startedAt < b.startedAt ? 1 : -1;
  return a.runId < b.runId ? 1 : a.runId > b.runId ? -1 : 0;
}

/** Every run in the stores, newest first; a run in more than one store is listed once, from the first. */
export async function listRuns(stores: RunStore[]): Promise<RunListing[]> {
  const byId = new Map<string, RunListing>();
  for (const store of stores)
    for (const listing of await store.list()) if (!byId.has(listing.runId)) byId.set(listing.runId, listing);
  return [...byId.values()].sort(newestFirst);
}

export async function resolveRun(stores: RunStore[], runId?: string): Promise<RunRecord> {
  if (runId === undefined) {
    const [newest] = await listRuns(stores);
    if (newest === undefined) throw new QueryError('No runs recorded yet. Use run first.');
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
  const ids = (await listRuns(stores)).slice(0, 5).map(l => l.runId);
  throw new QueryError(`Run '${runId}' not found. Recent runs: ${ids.join(', ')}`);
}

export function findCase(r: RunRecord, ref: string | number): CaseRecord {
  let found: CaseRecord | undefined;
  if (typeof ref === 'number' || /^\d+$/.test(ref)) {
    const index = Number(ref);
    found = r.cases.find(c => c.index === index);
  } else {
    found = r.cases.find(c => c.name === ref)
      ?? r.cases.find(c => c.name.toLowerCase() === ref.toLowerCase())
      ?? byRunName(r, ref);
  }
  if (!found) {
    const list = r.cases.slice(0, 5).map(c => `${c.index} ${c.name}`).join(', ');
    throw new QueryError(`Case '${ref}' not found. The run has ${r.cases.length} cases: ${list}`);
  }
  return found;
}

// A case is recorded as 'request › run' (RunNode.name), but the name an agent gave new_run and addressed
// the scope with is the bare run name, so the same thing was named one way for editing and another for
// querying. Falling back to runName closes that, after both name matches so it can never shadow a case
// whose own name is an exact hit.
//
// Two requests can each hold a run of the same name, so an ambiguous reference is refused with the
// candidates rather than resolved to whichever came first: picking one silently would hand back another
// request's response as if it were the one asked for.
function byRunName(r: RunRecord, ref: string): CaseRecord | undefined {
  const matches = r.cases.filter(c => c.runName !== undefined && c.runName.toLowerCase() === ref.toLowerCase());
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0];
  const list = matches.map(c => `${c.index} ${c.name}`).join(', ');
  throw new QueryError(`Case '${ref}' is a run name held by ${matches.length} cases: ${list}. Use the index, or the full 'request › run' name.`);
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

export interface ProblemRow {
  index: number; name: string; outcome: CaseRecord['outcome']; status?: number; error?: string;
  failedChecks: { check: string; errors: string[] }[];
}

// A case that did not pass, with only its failed checks
function problemRow(c: CaseRecord): ProblemRow {
  const row: ProblemRow = {
    index: c.index, name: c.name, outcome: c.outcome,
    failedChecks: (c.validation?.checks ?? []).filter(k => !k.passed).map(k => ({ check: k.check, errors: k.errors }))
  };
  if (c.response) row.status = c.response.status;
  if (c.error !== undefined) row.error = c.error;
  return row;
}

const problems = (r: RunRecord): ProblemRow[] => r.cases.filter(c => c.outcome !== 'pass').map(problemRow);

export function failures(r: RunRecord) {
  const cases = problems(r);
  return { runId: r.runId, count: cases.length, cases };
}

/** What a run returns to an agent: the counts plus only the cases that did not pass. */
export function runResult(r: RunRecord) {
  return {
    runId: r.runId,
    startedAt: r.startedAt,
    environment: r.environment,
    selection: r.selection,
    ...toCaseOutcomeCounts(r.cases),
    problems: problems(r)
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

// The response headers worth showing by default; cookies, CSP and the like are left out
const USEFUL_HEADERS = new Set([
  'content-type', 'content-length', 'content-encoding', 'location', 'cache-control', 'etag', 'last-modified',
  'www-authenticate', 'retry-after', 'allow', 'x-request-id', 'x-correlation-id',
  'x-amzn-requestid', 'x-amz-request-id', 'x-amzn-errortype', 'x-amz-apigw-id'
]);

export interface ResponseOptions {
  /** true for every header, a list of names (any case) for just those; default: the useful ones */
  headers?: true | string[];
}

function pickHeaders(all: Record<string, string>, want: ResponseOptions['headers']) {
  if (want === true) return { headers: all, omitted: 0 };
  const keep = want === undefined ? USEFUL_HEADERS : new Set(want.map(h => h.toLowerCase()));
  const headers = Object.fromEntries(Object.entries(all).filter(([k]) => keep.has(k.toLowerCase())));
  return { headers, omitted: Object.keys(all).length - Object.keys(headers).length };
}

export function caseResponse(r: RunRecord, ref: string | number, o: ResponseOptions = {}) {
  const c = findCase(r, ref);
  if (!c.response) throw new QueryError(`Case ${c.index} got no response: ${c.error ?? 'unknown error'}`);
  const { headers, omitted } = pickHeaders(c.response.headers, o.headers);
  const out: {
    index: number; name: string; status: number; statusText: string; ms: number; headers: Record<string, string>;
    headersOmitted?: number; body?: { contentType?: string; bytes: number };
  } = {
    index: c.index, name: c.name, status: c.response.status, statusText: c.response.statusText ?? '',
    ms: c.ms, headers
  };
  if (omitted > 0) out.headersOmitted = omitted;
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

export const DEFAULT_BODY_CAP = 32768;
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
  if (typeof v === 'string') return v.length > 30 ? `string "${v.slice(0, 30)}…"` : `string "${v}"`;
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
    encoding = 'text'; // a cut-off JSON value is no longer JSON
    truncated = true;
  }

  const out: BodyResult = { index: c.index, name: c.name, side, bytes: body.bytes, encoding, truncated, content };
  if (body.contentType !== undefined) out.contentType = body.contentType;
  return out;
}
