import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { startFixture } from './fixture';
import { secretEnvironmentVariable } from '../src/secret-store';

// Runs the built CLI (npm run build first) against the shared http fixture
const cli = path.resolve(__dirname, '..', 'dist', 'index.js');
let fx: Awaited<ReturnType<typeof startFixture>>;
let cwd = '';

beforeAll(async () => {
  fx = await startFixture();
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-cwd-'));
});

afterAll(async () => {
  await fx.stop();
  fs.rmSync(cwd, { recursive: true, force: true });
});

// Async on purpose: the http fixture lives in this process, so a blocking spawn would deadlock it
function fullyrested(args: string[], workDir = cwd): Promise<{ code: number; out: string; err: string }> {
  const env = { ...process.env, [secretEnvironmentVariable('apikey')]: 'cli-secret-value' };
  return new Promise(resolve => {
    execFile(process.execPath, [cli, ...args], { cwd: workDir, env, encoding: 'utf8' }, (error, out, err) =>
      resolve({ code: error ? (error as { code?: number }).code ?? 1 : 0, out, err }));
  });
}

const ok = () => ['run', '-c', fx.collection, '-a', 'items/ok.frreq'];
const runsFolder = (dir: string) => path.join(dir, '.fullyrested-runs');

describe('fullyrested run', () => {
  it('prints the same per-case lines and summary as before, and writes nothing', async () => {
    const r = await fullyrested(ok());
    expect(r.out).toMatch(/^PASS ok 200 \d+ms\n1 passed, 0 failed\n$/);
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(fs.existsSync(runsFolder(cwd))).toBe(false);
  });

  it('exits 1 when a case fails and 2 on a usage error', async () => {
    expect((await fullyrested(['run', '-c', fx.collection, '-a', 'down.frreq'])).code).toBe(1);
    const usage = await fullyrested(['run', '-c', fx.collection]);
    expect(usage.code).toBe(2);
    expect(usage.err).toMatch(/^error: /);
  });

  it('--record saves one run file in the current directory and says so', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-rec-'));
    try {
      const r = await fullyrested([...ok(), '--record'], dir);
      const files = fs.readdirSync(runsFolder(dir));
      expect(files).toHaveLength(1);
      const record = JSON.parse(fs.readFileSync(path.join(runsFolder(dir), files[0]!), 'utf8'));
      expect(files[0]).toBe(`${record.runId}.json`);
      expect(r.out).toMatch(/^PASS ok 200 \d+ms\n1 passed, 0 failed\nrecorded run \S+ in .*\.fullyrested-runs\n$/);
      expect(r.out).toContain(`recorded run ${record.runId} in`);
      expect(record.redacted).toBe(true);
      expect(JSON.stringify(record)).not.toContain('cli-secret-value');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--store chooses where --record writes', async () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-store-'));
    try {
      await fullyrested([...ok(), '--record', '--store', store]);
      expect(fs.readdirSync(runsFolder(store))).toHaveLength(1);
      expect(fs.existsSync(runsFolder(cwd))).toBe(false);
    } finally {
      fs.rmSync(store, { recursive: true, force: true });
    }
  });

  it('--include-secrets keeps the secret in the recorded run', async () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-secret-'));
    try {
      await fullyrested([...ok(), '--record', '--store', store, '--include-secrets']);
      const file = path.join(runsFolder(store), fs.readdirSync(runsFolder(store))[0]!);
      const record = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(record.redacted).toBe(false);
      expect(record.cases[0].request.headers['x-key']).toBe('cli-secret-value');
    } finally {
      fs.rmSync(store, { recursive: true, force: true });
    }
  });

  it('--json prints only the run record and creates no folder', async () => {
    const r = await fullyrested([...ok(), '--json']);
    const record = JSON.parse(r.out);
    expect(record).toMatchObject({ redacted: true, environment: 'Dev' });
    expect(record.cases).toHaveLength(1);
    expect(r.out).toBe(JSON.stringify(record, null, 2) + '\n');
    expect(fs.existsSync(runsFolder(cwd))).toBe(false);
  });

  it('--json with --record also saves the run and keeps stdout pure JSON', async () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-both-'));
    try {
      const r = await fullyrested([...ok(), '--json', '--record', '--store', store]);
      const record = JSON.parse(r.out);
      expect(fs.readdirSync(runsFolder(store))).toEqual([`${record.runId}.json`]);
    } finally {
      fs.rmSync(store, { recursive: true, force: true });
    }
  });

  it('--json keeps the failing exit code', async () => {
    const r = await fullyrested(['run', '-c', fx.collection, '-a', 'down.frreq', '--json']);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).cases[0].outcome).toBe('error');
  });

  it('warns when the run cannot be recorded and still exits from the results', async () => {
    const blocker = path.join(cwd, 'not-a-dir');
    fs.writeFileSync(blocker, 'x');
    const r = await fullyrested([...ok(), '--record', '--store', blocker]);
    expect(r.err).toMatch(/^warning: could not record run: /);
    expect(r.out).toMatch(/^PASS ok 200 \d+ms\n1 passed, 0 failed\n$/);
    expect(r.code).toBe(0);
  });

  it('--junit still writes the report', async () => {
    const file = path.join(cwd, 'out.xml');
    await fullyrested([...ok(), '--junit', file]);
    expect(fs.readFileSync(file, 'utf8')).toContain('<testcase');
  });
});
