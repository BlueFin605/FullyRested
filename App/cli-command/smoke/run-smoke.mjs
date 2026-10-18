// Websocket-trigger regression smoke test. Starts smoke-server.mjs, builds smoke.frcol,
// runs each CLI step from the review-fixes spec (B1–B6) and checks the outcome against
// the server's own log. No manual steps. Exits 1 if any check fails.
//   npm run smoke            (from App/cli-command; builds first)
//   node smoke/run-smoke.mjs (uses the existing dist build)
// Env: PORT (default 8787), SMOKE_KEEP=1 keeps the scratch folder even on success.
// The scratch folder is kept on failure either way so the server log can be read.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCollection } from './make-collection.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(here, '..', 'dist', 'index.js');
const SERVER = path.join(here, 'smoke-server.mjs');
const PORT = Number(process.env.PORT ?? 8787);
const BASE = `http://localhost:${PORT}`;
const results = [];

const check = (group, name, ok, detail = '') => {
  results.push({ group, name, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${!ok && detail ? `\n        ${detail}` : ''}`);
};

// Resolves once the server prints its ready line. Everything it prints goes to logFile.
const startServer = (logFile) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(PORT) } });
  let output = '';
  const timer = setTimeout(() => reject(new Error('smoke server did not start within 5s')), 5000);
  const onData = d => {
    output += d;
    appendFileSync(logFile, d);
    if (output.includes('smoke server on')) { clearTimeout(timer); resolve(child); }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', code => {
    clearTimeout(timer);
    reject(new Error(`smoke server exited with ${code} (is port ${PORT} in use? set PORT)\n${output}`));
  });
});

const api = async (method, p) => (await fetch(BASE + p, { method })).json();
const reset = () => api('POST', '/reset');
const log = () => api('GET', '/log');

const runCase = (dir, action) => {
  const r = spawnSync(process.execPath, [CLI, 'run', '-c', 'smoke.frcol', '-a', action], { cwd: dir, encoding: 'utf8', timeout: 60000 });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

const gaps = entries => entries.slice(1).map((e, i) => e.at - entries[i].at);

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), 'fr-smoke-'));
  const serverLog = path.join(dir, 'server-output.log');
  let server;
  let failed = false;
  try {
    console.log(`smoke: port ${PORT}, scratch ${dir}`);
    buildCollection(dir, { port: PORT, cli: CLI });
    server = await startServer(serverLog);

    console.log('B1  fresh {{$guid}} on every trigger firing (fix 2)');
    await reset();
    let r = runCase(dir, 'watch-fresh.frreq');
    let fires = (await log()).filter(e => e.path == '/fire');
    check('B1', 'watch-fresh passes', r.status == 0 && /PASS watch-fresh/.test(r.out), r.out);
    check('B1', '3 /fire calls, all 200', fires.length == 3 && fires.every(e => e.status == 200), JSON.stringify(fires.map(e => e.status)));
    check('B1', '3 distinct guids', new Set(fires.map(e => e.id)).size == 3, fires.map(e => e.id).join(' '));

    console.log('B2  fixed beat: a firing every interval from the start of the last one (fix 4a)');
    await reset();
    r = runCase(dir, 'watch-beat.frreq');
    fires = (await log()).filter(e => e.path == '/fire');
    const beat = gaps(fires.slice(0, 4));
    check('B2', 'watch-beat passes', r.status == 0 && /PASS watch-beat/.test(r.out), r.out);
    check('B2', 'at least 4 /fire calls', fires.length >= 4, `got ${fires.length}`);
    check('B2', 'every gap is about 1000ms (850–1250)', beat.length == 3 && beat.every(g => g >= 850 && g <= 1250), `gaps ${beat.join(', ')}`);

    console.log('B3  one {{$guid}} shared by url, message and expect (fix 3)');
    await reset();
    r = runCase(dir, 'watch-room.frreq');
    check('B3', 'watch-room passes', r.status == 0 && /PASS watch-room/.test(r.out), r.out);

    console.log('B4  timeout note counts each trigger status (fix 7)');
    await reset();
    r = runCase(dir, 'watch-flaky.frreq');
    const flakyCalls = (await log()).filter(e => e.path == '/flaky');
    const note = (r.out.match(/trigger returned ([^\n]+?) across (\d+) calls/) ?? []);
    check('B4', 'watch-flaky fails (the trigger never succeeds)', r.status == 1 && /FAIL watch-flaky/.test(r.out), r.out);
    check('B4', 'note gives a count per status, not one status for all calls', note[1] !== undefined && !/on all/.test(r.out), r.out);
    if (note[1] !== undefined) {
      const counts = {};
      for (const [, status, n] of note[1].matchAll(/(\d{3}) ×(\d+)/g)) counts[status] = Number(n);
      const noted = Object.values(counts).reduce((a, b) => a + b, 0);
      check('B4', 'note call total matches the number of /flaky calls (±1 for timing)', Math.abs(Number(note[2]) - flakyCalls.length) <= 1 && Math.abs(noted - flakyCalls.length) <= 1, `note ${note[2]} calls, log ${flakyCalls.length}`);
      const logCounts = {};
      for (const e of flakyCalls) logCounts[e.status] = (logCounts[e.status] ?? 0) + 1;
      const statusesMatch = Object.keys(counts).every(s => Math.abs((counts[s] ?? 0) - (logCounts[s] ?? 0)) <= 1);
      check('B4', 'per-status counts match the log (±1 for timing)', statusesMatch, `note ${JSON.stringify(counts)}, log ${JSON.stringify(logCounts)}`);
    } else {
      check('B4', 'note line found', false, r.out);
    }

    console.log('B5  interval below 100 is clamped at run time (fix 4b)');
    const clampFile = readFileSync(path.join(dir, 'watch-clamp.frreq'), 'utf8');
    check('B5', 'collection has interval 0 (hand-edited, the old .frreq shape)', /"interval": 0/.test(clampFile));
    await reset();
    r = runCase(dir, 'watch-clamp.frreq');
    fires = (await log()).filter(e => e.path == '/fire');
    const clampGaps = gaps(fires);
    check('B5', 'watch-clamp fails on timeout (its schema never matches)', r.status == 1 && /Timed out/.test(r.out), r.out);
    check('B5', 'about 9–10 calls in 1s, not a flood (5–15)', fires.length >= 5 && fires.length <= 15, `got ${fires.length}`);
    check('B5', 'no gap under 90ms', clampGaps.every(g => g >= 90), `smallest ${Math.min(...clampGaps)}`);

    console.log('B6  an MCP trigger target is named correctly (fix 5)');
    const edit = spawnSync(process.execPath, [CLI, 'edit', 'set-trigger', '-c', 'smoke.frcol', '--scope', 'request:watch-room.frreq', '--request', 'mcp-call.frreq'], { cwd: dir, encoding: 'utf8' });
    const edited = `${edit.stdout ?? ''}${edit.stderr ?? ''}`;
    check('B6', 'set-trigger refuses an mcp target', edit.status != 0, edited);
    check('B6', 'error says "is a mcp request"', /is a mcp request/.test(edited), edited);
    check('B6', 'nothing was saved on watch-room', !/"trigger"/.test(readFileSync(path.join(dir, 'watch-room.frreq'), 'utf8')));
  } catch (err) {
    failed = true;
    console.log(`\nERROR: ${err.message}`);
  } finally {
    if (server) server.kill();
    const failures = results.filter(r => !r.ok).length;
    const passed = results.length - failures;
    console.log(`\n${passed} checks passed, ${failures + (failed ? 1 : 0)} failed`);
    if (failures || failed) {
      console.log(`scratch kept for inspection: ${dir} (server output: ${serverLog})`);
      process.exitCode = 1;
    } else if (process.env.SMOKE_KEEP === '1') {
      console.log(`scratch kept: ${dir}`);
    } else {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

main();
