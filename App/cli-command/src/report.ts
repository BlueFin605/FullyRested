import { TestResult } from './run';

export function formatResult(result: TestResult): string {
  const line = `${result.passed ? 'PASS' : 'FAIL'} ${result.name} ${result.status} ${result.ms}ms`;
  return [line, ...result.errors.map(e => `    ${e}`)].join('\n');
}

export function formatSummary(results: TestResult[]): string {
  const failed = results.filter(r => !r.passed).length;
  return `${results.length - failed} passed, ${failed} failed`;
}

function xml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function toJUnit(suiteName: string, results: TestResult[]): string {
  const failures = results.filter(r => !r.passed).length;
  const seconds = (ms: number) => (ms / 1000).toFixed(3);
  const total = results.reduce((sum, r) => sum + r.ms, 0);

  const cases = results.map(r => {
    const open = `    <testcase classname="${xml(suiteName)}" name="${xml(r.name)}" time="${seconds(r.ms)}"`;
    if (r.passed)
      return `${open} />`;

    const message = r.errors[0] ?? `status ${r.status}`;
    return `${open}>\n      <failure message="${xml(message)}">${xml([`status ${r.status}`, ...r.errors].join('\n'))}</failure>\n    </testcase>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites tests="${results.length}" failures="${failures}" time="${seconds(total)}">`,
    `  <testsuite name="${xml(suiteName)}" tests="${results.length}" failures="${failures}" errors="0" skipped="0" time="${seconds(total)}">`,
    ...cases,
    '  </testsuite>',
    '</testsuites>',
    ''
  ].join('\n');
}
