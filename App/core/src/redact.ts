import { SecretTable } from './model';
import { CaseRecord, RecordBody } from './run-record';
import { encodeQuery } from './resolve';

const MIN_SECRET_LENGTH = 4;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Every form a value takes on the wire: raw, URI-encoded, as buildRequestUrl encodes a query value,
// as a URLSearchParams form body encodes it, and escaped inside a JSON string
function encodingsOf(value: string): string[] {
  return [
    value,
    encodeURIComponent(value),
    encodeQuery(value),
    new URLSearchParams({ k: value }).toString().slice(2),
    JSON.stringify(value).slice(1, -1),
    ...urlParserEncodings(value),
  ];
}

// How a URL parser (Node, when it sends the request) re-encodes a value in the query and in the path,
// which is what an echo server reports back. A '#' would end the URL, so such values are skipped.
// A form is kept only if it decodes back to the value: a parser that cut the value short ('?' ends a
// path) or normalised it ('..', '\') would otherwise register a fragment and over-redact
function urlParserEncodings(value: string): string[] {
  if (value.includes('#')) return [];
  const forms: string[] = [];
  const keep = (encode: () => string) => {
    try {
      const form = encode();
      if (decodeURIComponent(form) === value) forms.push(form);
    } catch { /* not encodable */ }
  };
  keep(() => new URL('http://h/?k=' + value).search.slice(3));
  keep(() => new URL('http://h/' + value).pathname.slice(1));
  return forms;
}

/**
 * Returns a function replacing every active secret value (raw or in any wire encoding) with its placeholder,
 * and every masked value (a sent credential that is not itself a secret) with ***.
 */
export function secretReplacer(secrets: SecretTable[] | undefined, minLength: number = MIN_SECRET_LENGTH, masked: string[] = []): (text: string) => string {
  const byValue = new Map<string, string>();
  const add = (value: string, replacement: string) => {
    if (value.length < Math.max(1, minLength)) return;
    for (const form of encodingsOf(value))
      if (!byValue.has(form)) byValue.set(form, replacement);
  };
  for (const s of secrets ?? [])
    if (s.active && typeof s.$value === 'string') add(s.$value, `{{$secret:${s.$secret}}}`);
  for (const value of masked) add(value, '***');
  if (byValue.size === 0) return text => text;
  // Longest first, in a single pass, so overlapping secrets are not half-replaced
  // and a placeholder is never re-scanned.
  const pattern = new RegExp([...byValue.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|'), 'g');
  return text => text.replace(pattern, m => byValue.get(m) as string);
}

// A presigned SigV4 URL carries the signature, the credential and the session token in its query string.
// FullyRested's own signUrl signing happens inside executeRequest and that signed URL is never recorded
// (runCase records prepareRequest, before authentication), but a presigned URL pasted into a request's URL
// field reaches records and showRequest exactly as typed — and none of its parts is a declared secret, so
// secretReplacer would not touch them. Masked here instead, by the same rule maskAuthorization applies to
// the header form.
//
// The URL is edited in place rather than rebuilt through new URL(): it may still hold unsubstituted
// placeholders or be no valid URL at all, and re-serialising would re-encode parts that must be recorded
// as they were sent.
export function maskPresignedUrl(url: string): string {
  const start = url.indexOf('?');
  if (start < 0) return url;
  const hash = url.indexOf('#', start);
  const end = hash < 0 ? url.length : hash;
  const query = url.slice(start + 1, end);
  if (query === '') return url;

  const masked = query.split('&').map(pair => {
    const eq = pair.indexOf('=');
    if (eq < 0) return pair;
    const name = pair.slice(0, eq);
    switch (name.toLowerCase()) {
      case 'x-amz-signature':
      case 'x-amz-security-token':
        return `${name}=***`;
      case 'x-amz-credential':
        return `${name}=${maskCredentialScope(pair.slice(eq + 1))}`;
      default:
        return pair;
    }
  }).join('&');

  return masked === query ? url : url.slice(0, start + 1) + masked + url.slice(end);
}

// Keeps the access key id, which identifies the caller but is not a credential, and masks the scope after
// it. The separator may be encoded (%2F) or literal depending on who built the URL.
function maskCredentialScope(value: string): string {
  const separator = /%2f|\//i.exec(value);
  if (!separator) return value; // just the key id: nothing after it to mask
  return `${value.slice(0, separator.index)}${separator[0]}***`;
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

// The credential part of each Authorization and X-Amz-Security-Token header sent: a Basic header's
// base64(user:password) or a bearer token never appears as a secret value, but a response can echo it
function sentCredentials(headers: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower === 'x-amz-security-token') out.push(value);
    else if (lower === 'authorization') {
      const scheme = /^(Basic|Bearer)\s+(.+)$/i.exec(value.trim());
      if (scheme) out.push(scheme[2]!);
    }
  }
  return out;
}

export function redactCase(c: CaseRecord, secrets: SecretTable[] | undefined): CaseRecord {
  const replace = secretReplacer(secrets, MIN_SECRET_LENGTH, sentCredentials(c.request.headers));
  const request: CaseRecord['request'] = {
    ...c.request,
    url: replace(maskPresignedUrl(c.request.url)),
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
    if (c.response.statusText !== undefined) out.response.statusText = replace(c.response.statusText);
    if (c.response.body) out.response.body = redactBody(c.response.body, replace);
  }
  return out;
}
