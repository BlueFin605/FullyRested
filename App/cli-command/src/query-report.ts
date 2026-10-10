import { BodyResult, EnvironmentsView, RunListing, ShownRequest, TreeNodeView, TreeView, caseRequest, caseResponse, failures, summary } from '@fullyrested/core';

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
    if (c.error !== undefined) lines.push(`    ${c.error}`);
    for (const k of c.failedChecks)
      for (const e of k.errors) lines.push(`    [${k.check}] ${e}`);
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
  const omitted = r.headersOmitted ? [`-- ${r.headersOmitted} more headers; use --headers <names> or leave it out for all`] : [];
  return [`${r.status} ${r.statusText} ${r.ms}ms`, ...headerLines(r.headers), ...omitted, bodyLine(r.body)].join('\n');
}

export function formatBody(b: BodyResult): string {
  if (b.encoding === 'json' && !b.truncated) return JSON.stringify(b.content, null, 2);
  return String(b.content);
}

export function truncationNotice(b: BodyResult): string | undefined {
  return b.truncated
    ? `-- truncated at ${new TextEncoder().encode(String(b.content)).length} of ${b.bytes} bytes; use --path, --outline, --range or --full`
    : undefined;
}

export function parseRange(text: string): [number, number] | undefined {
  const m = /^(\d+):(\d+)$/.exec(text);
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

function treeLines(nodes: TreeNodeView[], depth: number): string[] {
  const pad = '  '.repeat(depth);
  return nodes.flatMap(n => {
    if (n.type === 'folder') return [`${pad}${n.name}/`, ...treeLines(n.children, depth + 1)];
    if (n.type === 'error') return [`${pad}! ${n.file}: ${n.message}`];
    const validation = n.validation ? `  [${n.validation}]` : '';
    return [`${pad}${n.name}  ${n.method.toUpperCase()} ${n.url}${validation}`, ...(n.runs ?? []).map(r => `${pad}  › ${r.name}`)];
  });
}

export function formatTree(t: TreeView): string {
  const top = t.folder === undefined ? `${t.collection}/` : `${t.collection}/${t.folder}/`;
  return [top, ...treeLines(t.children, 1)].join('\n');
}

const list = (names: string[]) => names.length === 0 ? '-' : names.join(', ');

export function formatEnvironments(v: EnvironmentsView): string {
  const rows = v.environments.map(e => `${e.name === v.selected ? '*' : ' '} ${e.name}  vars: ${list(e.variables)}  secrets: ${list(e.secrets)}`);
  return [...rows, `  collection  vars: ${list(v.collection.variables)}  secrets: ${list(v.collection.secrets)}`].join('\n');
}

export function formatShown(r: ShownRequest): string {
  const tag = (source: string, overridden: boolean) => `(${source}${overridden ? ', overridden' : ''})`;
  const lines = [`${r.method.toUpperCase()} ${r.url}`];
  const section = (title: string, rows: string[]) => { if (rows.length > 0) lines.push('', title, ...rows.map(x => `  ${x}`)); };
  section('headers', r.headers.map(h => `${h.key} = ${h.value}   ${tag(h.source, h.overridden)}`));
  section('variables', r.variables.map(v => `${v.variable} = ${v.value}   ${tag(v.source, v.overridden)}`));
  section('secrets', r.secrets.map(s => `${s.name}   ${tag(s.source, s.overridden)}`));
  if (r.auth) section('auth', [`${r.auth.type}   (${r.auth.source})`]);
  if (r.validation !== undefined && r.validation !== null) section('validation', JSON.stringify(r.validation, null, 2).split('\n'));
  return lines.join('\n');
}
