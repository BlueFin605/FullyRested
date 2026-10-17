import { BodyResult, EditResult, WebSocketView, EnvironmentsView, RunListing, ScopeSettingNames, SettingsView, ShownRequest, TreeNodeView, TreeValidation, TreeView, caseRequest, caseResponse, failures, summary } from '@fullyrested/core';

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

// One short marker per row: the bare type; type(schema) / type(no schema!) when it checks a body;
// or Inherit→<effective> when the row's own type is Inherit (the resolved type's own schema
// completeness is in the TreeValidation data for a programmatic reader, but left out of this
// one-line marker to keep an inherited row to a single arrow rather than two nested annotations).
function validationMarker(v: TreeValidation): string {
  if (v.type === 'Inherit') return `Inherit→${v.effective}`;
  if (v.incomplete) return `${v.type}(no schema!)`;
  if (v.schema) return `${v.type}(schema)`;
  return v.type;
}

// One line for a websocket request's expect and trigger, shared by tree and show.
function webSocketSummary(w: WebSocketView): string[] {
  const e = w.expect;
  const lines = [`expect: count ${e.count}, match ${e.match}, extras ${e.extras}, timeout ${e.timeout}ms, settle ${e.settle}ms, schema ${e.schema ? 'yes' : 'no'}`];
  if (w.trigger) {
    const t = w.trigger;
    lines.push(`trigger: ${t.request}${t.run !== undefined ? ` › ${t.run}` : ''}, ${t.repeat}, interval ${t.interval}ms, delay ${t.delay}ms`);
  }
  return lines;
}

function treeLines(nodes: TreeNodeView[], depth: number): string[] {
  const pad = '  '.repeat(depth);
  return nodes.flatMap(n => {
    if (n.type === 'folder') return [`${pad}${n.name}/`, ...treeLines(n.children, depth + 1)];
    if (n.type === 'error') return [`${pad}! ${n.file}: ${n.message}`];
    const validation = n.validation ? `  [${validationMarker(n.validation)}]` : '';
    const runLine = (r: { name: string; validation: TreeValidation | undefined }) =>
      `${pad}  › ${r.name}${r.validation ? `  [${validationMarker(r.validation)}]` : ''}`;
    const ws = n.websocket ? webSocketSummary(n.websocket).map(l => `${pad}  ${l}`) : [];
    return [`${pad}${n.name}  ${n.method.toUpperCase()} ${n.url}${validation}${n.runsOnly ? '  [runs-only]' : ''}`, ...ws, ...(n.runs ?? []).map(runLine)];
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

// One block per scope: its locator, then a row per kind that has anything in it, names only --
// never a value. An empty row is left out rather than printed as '(none)': both a person and an
// agent read this, and a page of empty rows buries the few settings that are actually set. 'auth'
// counts as unset when it is 'inherit' (the default every scope starts at), so a scope with
// nothing of its own prints just its locator and a dash.
function settingRows(s: ScopeSettingNames): string[] {
  const row = (label: string, names: string[]) => names.length === 0 ? [] : [`  ${label.padEnd(9)}  ${names.join(', ')}`];
  return [
    ...row('headers', s.headers),
    ...row('params', s.params ?? []),
    ...row('variables', s.variables),
    ...row('secrets', s.secrets),
    ...row('auth', s.auth === 'inherit' ? [] : [s.auth])
  ];
}

export function formatSettings(v: SettingsView): string {
  return v.scopes.flatMap(s => {
    const rows = settingRows(s);
    return [s.scope, ...(rows.length === 0 ? ['  —'] : rows)];
  }).join('\n');
}

// One line: result.message, plus ' (no change)' when the edit left the document as it was.
export function formatEdit(result: EditResult): string {
  return result.changed ? result.message : `${result.message} (no change)`;
}

export function formatShown(r: ShownRequest): string {
  const tag = (source: string, overridden: boolean) => `(${source}${overridden ? ', overridden' : ''})`;
  const lines = [`${r.method.toUpperCase()} ${r.url}`];
  const section = (title: string, rows: string[]) => { if (rows.length > 0) lines.push('', title, ...rows.map(x => `  ${x}`)); };
  section('headers', r.headers.map(h => `${h.key} = ${h.value}   ${tag(h.source, h.overridden)}`));
  section('variables', r.variables.map(v => `${v.variable} = ${v.value}   ${tag(v.source, v.overridden)}`));
  section('secrets', r.secrets.map(s => `${s.name}   ${tag(s.source, s.overridden)}`));
  if (r.websocket) section('websocket', [...(r.message !== undefined ? [`message: ${r.message}`] : []), ...webSocketSummary(r.websocket)]);
  if (r.capture) section('capture', r.capture.map(c => `{{${c.variable}}} = ${c.from}${c.path ? ' ' + c.path : ''}`));
  if (r.auth) section('auth', [`${r.auth.type}   (${r.auth.source})`]);
  if (r.validation !== undefined && r.validation !== null) section('validation', JSON.stringify(r.validation, null, 2).split('\n'));
  return lines.join('\n');
}
