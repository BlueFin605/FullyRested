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

describe('query commands', () => {
  let store = '';
  let runId = '';

  beforeAll(async () => {
    store = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-query-'));
    await fullyrested(['run', '-c', fx.collection, '-f', 'items', '--all', '--record', '--store', store]);
    runId = fs.readdirSync(runsFolder(store))[0]!.replace('.json', '');
  });

  afterAll(() => fs.rmSync(store, { recursive: true, force: true }));

  const q = (args: string[]) => fullyrested([...args, '--store', store]);

  it('runs lists the recorded run, and --json parses', async () => {
    const r = await q(['runs']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(new RegExp(String.raw`^${runId}  \S+  \d+ passed, \d+ failed, \d+ errored  `));
    expect(JSON.parse((await q(['runs', '--json'])).out)[0].runId).toBe(runId);
  });

  it('runs breaks a same-second run id tie on startedAt, like the latest run', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-tie-'));
    try {
      fs.mkdirSync(runsFolder(dir));
      const save = (runId: string, startedAt: string) => fs.writeFileSync(path.join(runsFolder(dir), `${runId}.json`),
        JSON.stringify({ runId, startedAt, collection: 'c', selection: '--all', redacted: true, cases: [] }));
      save('20261011-100000-ffff', '2026-10-11T10:00:00.100Z');
      save('20261011-100000-0000', '2026-10-11T10:00:00.900Z');
      const runs = JSON.parse((await fullyrested(['runs', '--json', '--store', dir])).out);
      expect(runs.map((r: { runId: string }) => r.runId)).toEqual(['20261011-100000-0000', '20261011-100000-ffff']);
      expect(JSON.parse((await fullyrested(['summary', '--json', '--store', dir])).out).runId).toBe('20261011-100000-0000');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('summary shows a header and a line per case', async () => {
    const r = await q(['summary']);
    expect(r.out).toContain(runId);
    expect(r.out).toMatch(/^ {2}1 PASS 200 \d+ms ok$/m);
    expect(JSON.parse((await q(['summary', runId, '--json'])).out).runId).toBe(runId);
  });

  it('failures says none, or lists the failing case', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-fail-'));
    try {
      await fullyrested(['run', '-c', fx.collection, '-a', 'down.frreq', '--record', '--store', dir]);
      const r = await fullyrested(['failures', '--store', dir]);
      expect(r.out).toMatch(/^ {2}1 ERROR - down\n {4}\S/);
      expect(JSON.parse((await fullyrested(['failures', '--json', '--store', dir])).out).count).toBe(1);
      const res = await fullyrested(['response', '1', '--store', dir]);
      expect(res.code).toBe(2);
      expect(res.err).toMatch(/^error: Case 1 got no response: No response: /);
      expect(JSON.parse((await fullyrested(['summary', '--json', '--store', dir])).out).cases[0].status).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    expect((await q(['failures', '--json'])).out).toContain('"count"');
  });

  it('request and response print the exchange', async () => {
    const req = await q(['request', 'ok']);
    expect(req.out).toMatch(/^GET http:\/\/127\.0\.0\.1:\d+\/ok\?env=dev\n/);
    const res = await q(['response', '1']);
    expect(res.out).toMatch(/^200 OK \d+ms\n/);
    expect(res.out).toContain('content-type: text/plain');
    expect(res.out).toMatch(/body: text\/plain, \d+ bytes$/m);
    expect(JSON.parse((await q(['response', 'ok', runId, '--json'])).out).status).toBe(200);
  });

  it('response shows every header by default and only the named ones with --headers', async () => {
    expect((await q(['response', '1'])).out).toMatch(/^date: /m);
    const some = await q(['response', '1', '--headers', 'Content-Type,x-nothing']);
    expect(some.out).toContain('content-type: text/plain');
    expect(some.out).not.toMatch(/^date: /m);
    expect(some.out).toMatch(/^-- \d+ more headers; use --headers <names> or leave it out for all$/m);
  });

  it('tree --folder shows only that folder', async () => {
    const r = await fullyrested(['tree', '-c', fx.collection, '--folder', 'items']);
    expect(r.code).toBe(0);
    expect(r.out.split('\n')[0]).toMatch(/\/items\/$/);
    expect(r.out).not.toContain('down');
  });

  it('body prints the content, honours --range, and rejects bad input', async () => {
    expect((await q(['body', 'ok'])).out).toBe('env=dev\n');
    expect((await q(['body', 'ok', '--range', '0:3'])).out).toBe('env\n');
    for (const bad of ['a:b', '-1:3', '1.5:2']) {
      const r = await q(['body', 'ok', '--range', bad]);
      expect(r.code).toBe(2);
      expect(r.err).toMatch(/^error: /);
    }
    const notJson = await q(['body', 'ok', '--outline']);
    expect(notJson.code).toBe(2);
    expect(notJson.err).toContain('Body is not JSON');
    expect((await q(['body', 'ok', '--request'])).code).toBe(2);
  });

  it('an unknown case exits 2 and lists the cases', async () => {
    const r = await q(['request', 'nope']);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/^error: Case 'nope' not found\. The run has \d+ cases: 1 ok/);
  });

  it('an unknown run id exits 2', async () => {
    const r = await q(['summary', 'nope']);
    expect(r.code).toBe(2);
    expect(r.err).toContain("Run 'nope' not found");
  });

  it('an empty store says no runs, and other commands ask for a run first', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-empty-'));
    try {
      const runs = await fullyrested(['runs', '--store', empty]);
      expect(runs.code).toBe(0);
      expect(runs.out).toBe('no runs\n');
      expect((await fullyrested(['runs', '--json', '--store', empty])).out).toBe('[]\n');
      const s = await fullyrested(['summary', '--store', empty]);
      expect(s.code).toBe(2);
      expect(s.err).toBe('error: No runs recorded yet. Use run first.\n');
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('inspect commands', () => {
  it('tree lists the items folder and its request', async () => {
    const r = await fullyrested(['tree', '-c', fx.collection]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^ {2}items\/$/m);
    expect(r.out).toMatch(/^ {4}ok {2}GET \{\{host\}\}\/ok {2}\[ResponseCode\]$/m);
    expect(r.out).toContain('› expects 404');
    expect(JSON.parse((await fullyrested(['tree', '-c', fx.collection, '--json'])).out).collection).toBe('api');
  });

  it('envs marks the selected environment', async () => {
    const r = await fullyrested(['envs', '-c', fx.collection]);
    expect(r.out).toContain('* Dev  vars: env  secrets: -');
    expect(r.out).toMatch(/^ {2}Prod /m);
    expect(r.out).toMatch(/^ {2}collection {2}vars: host {2}secrets: apikey$/m);
  });

  it('show reports sources and never prints the secret value', async () => {
    const r = await fullyrested(['show', '-c', fx.collection, '-a', 'items/ok.frreq']);
    expect(r.code).toBe(0);
    expect(r.out).toContain(`GET http://${fx.host}/ok`);
    expect(r.out).toContain('x-folder = items   (folder:items)');
    expect(r.out).toContain('x-key = {{$secret:apikey}}');
    expect(r.out).not.toContain('cli-secret-value');
    const json = await fullyrested(['show', '-c', fx.collection, '-a', 'items/ok.frreq', '--json']);
    expect(json.out).not.toContain('cli-secret-value');
  });

  it('settings lists every scope in resolution order, names only', async () => {
    const r = await fullyrested(['settings', '-c', fx.collection]);
    expect(r.code).toBe(0);
    const scopes = r.out.split('\n').filter(l => l !== '' && !l.startsWith(' '));
    expect(scopes.slice(0, 4)).toEqual(['collection', 'env:Dev', 'env:Prod', 'folder:items']);
    expect(scopes).toContain('request:items/ok.frreq');
    expect(scopes).toContain('run:items/runs.frreq#expects 404');
    expect(r.out).toMatch(/^ {2}variables {2}host$/m);
    expect(r.out).toMatch(/^ {2}secrets {4}apikey$/m);
    // names only: no fixture setting value may appear, in the text or in --json
    expect(r.out).not.toContain(fx.host);
    expect(r.out).not.toContain('cli-secret-value');
    expect(r.out).not.toContain('{{$apikey}}');
    const json = await fullyrested(['settings', '-c', fx.collection, '--json']);
    expect(JSON.parse(json.out).scopes[0].scope).toBe('collection');
    expect(json.out).not.toContain(fx.host);
    expect(json.out).not.toContain('cli-secret-value');
  });

  it('settings --scope reports just that scope, and exits 2 for an unknown one', async () => {
    const r = await fullyrested(['settings', '-c', fx.collection, '--scope', 'env:Prod']);
    expect(r.code).toBe(0);
    expect(r.out.split('\n').filter(l => l !== '' && !l.startsWith(' '))).toEqual(['env:Prod']);
    const bad = await fullyrested(['settings', '-c', fx.collection, '--scope', 'env:Nowhere']);
    expect(bad.code).toBe(2);
    expect(bad.err).toMatch(/^error: /);
  });

  it('show picks a run and an environment, and exits 2 for an unknown run', async () => {
    const r = await fullyrested(['show', '-c', fx.collection, '-a', 'items/runs.frreq', '-r', 'expects 404', '-e', 'Prod']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('env = prod');
    const bad = await fullyrested(['show', '-c', fx.collection, '-a', 'items/runs.frreq', '-r', 'nope']);
    expect(bad.code).toBe(2);
    expect(bad.err).toMatch(/^error: /);
  });
});

describe('setup failures', () => {
  const missingCollection = path.join(os.tmpdir(), 'fullyrested-no-such', 'x.frcol');
  it.each([
    ['run, missing collection', ['run', '-c', missingCollection, '--all']],
    ['run, missing request file', ['run', '-c', 'COLLECTION', '-a', 'items/nope.frreq']],
    ['tree, missing collection', ['tree', '-c', missingCollection]],
    ['envs, missing collection', ['envs', '-c', missingCollection]],
    ['show, missing collection', ['show', '-c', missingCollection, '-a', 'items/ok.frreq']],
    ['show, missing request file', ['show', '-c', 'COLLECTION', '-a', 'items/nope.frreq']],
    ['show, unknown environment', ['show', '-c', 'COLLECTION', '-a', 'items/ok.frreq', '-e', 'Nowhere']]
  ])('%s exits 2 with an error line', async (_name, args) => {
    const r = await fullyrested(args.map(a => a === 'COLLECTION' ? fx.collection : a));
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/^error: /);
  });
});
