import { SecretTable } from './model';
import { CaseRecord, RecordBody } from './run-record';

const MIN_SECRET_LENGTH = 4;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Returns a function replacing every active secret value (raw or URI-encoded) with its placeholder. */
export function secretReplacer(secrets: SecretTable[] | undefined): (text: string) => string {
  const byValue = new Map<string, string>();
  for (const s of secrets ?? []) {
    if (!s.active || typeof s.$value !== 'string' || s.$value.length < MIN_SECRET_LENGTH) continue;
    const placeholder = `{{$secret:${s.$secret}}}`;
    if (!byValue.has(s.$value)) byValue.set(s.$value, placeholder);
    const encoded = encodeURIComponent(s.$value);
    if (encoded !== s.$value && !byValue.has(encoded)) byValue.set(encoded, placeholder);
  }
  if (byValue.size === 0) return text => text;
  // Longest first, in a single pass, so overlapping secrets are not half-replaced
  // and a placeholder is never re-scanned.
  const pattern = new RegExp([...byValue.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|'), 'g');
  return text => text.replace(pattern, m => byValue.get(m) as string);
}

function maskAuthorization(value: string): string {
  if (/^Basic\s/i.test(value)) return 'Basic ***';
  if (/^Bearer\s/i.test(value)) return 'Bearer ***';
  const sig = /^(AWS4-HMAC-SHA256\s+Credential=)([^/,\s]*)/i.exec(value);
  if (sig) return `${sig[1]}${sig[2]}/***`;
  return '***';
}

function redactHeaders(headers: Record<string, string>, replace: (t: string) => string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower === 'authorization') out[name] = maskAuthorization(value);
    else if (lower === 'x-amz-security-token') out[name] = '***';
    else out[name] = replace(value);
  }
  return out;
}

function redactBody(body: RecordBody | undefined, replace: (t: string) => string): RecordBody | undefined {
  if (!body || body.text === undefined) return body ? { ...body } : body;
  return { ...body, text: replace(body.text) };
}

export function redactCase(c: CaseRecord, secrets: SecretTable[] | undefined): CaseRecord {
  const replace = secretReplacer(secrets);
  const request: CaseRecord['request'] = {
    ...c.request,
    url: replace(c.request.url),
    headers: redactHeaders(c.request.headers, replace),
  };
  if (c.request.body) request.body = redactBody(c.request.body, replace);
  const out: CaseRecord = { ...c, request };
  if (c.error !== undefined) out.error = replace(c.error);
  if (c.validation) {
    out.validation = {
      ...c.validation,
      checks: c.validation.checks.map(ch => ({ ...ch, errors: ch.errors.map(replace) })),
    };
  }
  if (c.response) {
    out.response = { ...c.response, headers: redactHeaders(c.response.headers, replace) };
    if (c.response.body) out.response.body = redactBody(c.response.body, replace);
  }
  return out;
}
