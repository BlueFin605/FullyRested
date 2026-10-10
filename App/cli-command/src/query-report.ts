import { BodyResult, RunListing, caseRequest, caseResponse, failures, summary } from '@fullyrested/core';

type Summary = ReturnType<typeof summary>;
type Failures = ReturnType<typeof failures>;
type Request = ReturnType<typeof caseRequest>;
type Response = ReturnType<typeof caseResponse>;

const outcomeLabel = (o: string) => o === 'pass' ? 'PASS' : o === 'fail' ? 'FAIL' : 'ERROR';

function caseLine(c: { index: number; name: string; outcome: string; status?: number; ms?: number }): string {
  const ms = c.ms === undefined ? '' : ` ${c.ms}ms`;
  return `  ${c.index} ${outcomeLabel(c.outcome)} ${c.status !== undefined && c.status > 0 ? c.status : '-'}${ms} ${c.name}`;
}

export function formatRuns(runs: RunListing[]): string {
  if (runs.length === 0) return 'no runs';
  return runs
    .map(r => `${r.runId}  ${r.startedAt}  ${r.passed} passed, ${r.failed} failed, ${r.errored} errored  ${r.selection}`)
    .join('\n');
}

export function formatSummary(s: Summary): string {
  const header = `${s.runId}  ${s.startedAt}  ${s.passed} passed, ${s.failed} failed, ${s.errored} errored  ${s.selection}`;
  return [header, ...s.cases.map(caseLine)].join('\n');
}

export function formatFailures(f: Failures): string {
  if (f.count === 0) return 'no failures';
  const lines: string[] = [];
  for (const c of f.cases) {
    lines.push(caseLine(c));
    if (c.failedChecks.length > 0) {
      for (const k of c.failedChecks)
        for (const e of k.errors) lines.push(`    [${k.check}] ${e}`);
    } else if (c.error !== undefined) {
      lines.push(`    ${c.error}`);
    }
  }
  return lines.join('\n');
}

function headerLines(headers: Record<string, string>): string[] {
  return Object.entries(headers).map(([k, v]) => `${k}: ${v}`);
}

function bodyLine(body: { contentType?: string; bytes: number } | undefined): string {
  return body ? `body: ${body.contentType ?? 'unknown type'}, ${body.bytes} bytes` : 'no body';
}

export function formatRequest(r: Request): string {
  return [`${r.method.toUpperCase()} ${r.url}`, ...headerLines(r.headers), bodyLine(r.body)].join('\n');
}

export function formatResponse(r: Response): string {
  return [`${r.status} ${r.statusText} ${r.ms}ms`, ...headerLines(r.headers), bodyLine(r.body)].join('\n');
}

export function formatBody(b: BodyResult): string {
  if (b.encoding === 'json' && !b.truncated) return JSON.stringify(b.content, null, 2);
  return String(b.content);
}

export function truncationNotice(b: BodyResult): string | undefined {
  return b.truncated
    ? `-- truncated at ${String(b.content).length} of ${b.bytes} bytes; use --path, --outline, --range or --full`
    : undefined;
}

export function parseRange(text: string): [number, number] | undefined {
  const m = /^(\d+):(\d+)$/.exec(text);
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}
