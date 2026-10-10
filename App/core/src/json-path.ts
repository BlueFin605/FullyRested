import { QueryError } from './query-error';

type Step = { key: string } | { index: number } | { wildcard: true };

function parse(expr: string): Step[] {
  const unsupported = () => new QueryError(`Unsupported path '${expr}'. Supported: $.a.b, [n], [*], ['key']`);
  if (!expr.startsWith('$')) throw unsupported();
  const steps: Step[] = [];
  let i = 1;
  while (i < expr.length) {
    if (expr[i] === '.') {
      const m = /^\.([A-Za-z_$][\w$-]*)/.exec(expr.slice(i));
      if (!m) throw unsupported();
      steps.push({ key: m[1] });
      i += m[0].length;
    } else if (expr[i] === '[') {
      const m = /^\[(?:(\*)|(\d+)|'([^']*)'|"([^"]*)")\]/.exec(expr.slice(i));
      if (!m) throw unsupported();
      if (m[1]) steps.push({ wildcard: true });
      else if (m[2] !== undefined) steps.push({ index: Number(m[2]) });
      else steps.push({ key: m[3] ?? m[4] });
      i += m[0].length;
    } else {
      throw unsupported();
    }
  }
  return steps;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Minimal JSONPath: $, .key, ['key'], [n], [*], chained. Returns every match. */
export function jsonPath(value: unknown, expr: string): unknown[] {
  let current: unknown[] = [value];
  for (const step of parse(expr)) {
    const next: unknown[] = [];
    for (const v of current) {
      if ('wildcard' in step) {
        if (Array.isArray(v)) next.push(...v);
        else if (isObject(v)) next.push(...Object.values(v));
      } else if ('index' in step) {
        if (Array.isArray(v) && step.index < v.length) next.push(v[step.index]);
      } else if (isObject(v) && !Array.isArray(v) && Object.prototype.hasOwnProperty.call(v, step.key)) {
        next.push(v[step.key]);
      }
    }
    current = next;
  }
  return current;
}
