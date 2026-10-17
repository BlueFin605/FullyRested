import { RestActionResult } from './builder';
import { CaptureFrom, CaptureRule, VariableTable } from './model';
import { jsonPath } from './json-path';
import { QueryError } from './query-error';

export const CAPTURE_FROM: CaptureFrom[] = ['body', 'header', 'status'];

// The variables a run has captured so far. Held by whoever runs the cases (the CLI, MCP, the app),
// handed to node.resolve({ captured }) for every later case, and dropped when the run ends.
export type Captured = VariableTable[];

export interface CaptureOutcome {
  values: Captured;
  errors: string[];   // one per rule that found nothing; the rule's variable is left as it was
}

// Merges a request's rules with a run's: a run's rule for a variable replaces the request's
export function mergeCaptureRules(request: CaptureRule[] | undefined, run: CaptureRule[] | undefined): CaptureRule[] {
  const rules = [...(request ?? [])];
  for (const rule of run ?? []) {
    const i = rules.findIndex(r => r.variable == rule.variable);
    if (i < 0) rules.push(rule); else rules[i] = rule;
  }
  return rules;
}

function bodyText(result: RestActionResult): string | undefined {
  const body = result.body?.body;
  if (body == undefined) return undefined;
  return typeof body == 'string' ? body : new TextDecoder().decode(body);
}

function asText(value: unknown): string {
  return typeof value == 'string' ? value : JSON.stringify(value);
}

function extract(rule: CaptureRule, result: RestActionResult, json: { parsed: boolean; value?: unknown }): string {
  if (rule.from == 'status')
    return String(result.status);

  if (rule.from == 'header') {
    const key = Object.keys(result.headers ?? {}).find(k => k.toLowerCase() == rule.path.toLowerCase());
    if (key == undefined) throw new QueryError(`no response header '${rule.path}'`);
    return result.headers[key]!;
  }

  if (!json.parsed) {
    const text = bodyText(result);
    json.parsed = true;
    try { json.value = text == undefined ? undefined : JSON.parse(text); } catch { json.value = undefined; }
  }
  if (json.value === undefined) throw new QueryError('the response body is not JSON');
  const found = jsonPath(json.value, rule.path).filter(v => v !== undefined && v !== null);
  if (found.length == 0) throw new QueryError(`nothing at ${rule.path}`);
  return asText(found[0]);
}

// Runs the rules against a response. A rule that finds nothing is reported, never silently an empty value.
export function captureFromResponse(rules: CaptureRule[], result: RestActionResult): CaptureOutcome {
  const values: Captured = [];
  const errors: string[] = [];
  const json = { parsed: false } as { parsed: boolean; value?: unknown };
  for (const rule of rules) {
    try {
      values.push({ variable: rule.variable, value: extract(rule, result, json), active: true, id: rule.id });
    } catch (error) {
      errors.push(`capture '${rule.variable}': ${(error as Error).message}`);
    }
  }
  return { values, errors };
}

// New captures replace older ones of the same name
export function addCaptured(into: Captured, values: Captured): void {
  for (const v of values) {
    const i = into.findIndex(c => c.variable == v.variable);
    if (i < 0) into.push(v); else into[i] = v;
  }
}

// Checks a rule before it is written
export function validateCaptureRule(variable: string, from: string, path: string | undefined): { from: CaptureFrom; path: string } {
  if (!/^[0-9a-zA-Z_-]+$/.test(variable))
    throw new QueryError(`capture variable '${variable}' must be letters, digits, '-' and '_' only, or {{${variable}}} will never substitute`);
  const kind = CAPTURE_FROM.find(f => f == from);
  if (kind == undefined)
    throw new QueryError(`capture from '${from}' is not one of ${CAPTURE_FROM.join(', ')}`);
  if (kind == 'status') return { from: kind, path: '' };
  if (path == undefined || path == '')
    throw new QueryError(kind == 'body' ? "capture from body needs a path like $.id" : 'capture from header needs the header name as path');
  if (kind == 'body') jsonPath({}, path);   // rejects an unsupported path now rather than at run time
  return { from: kind, path };
}
