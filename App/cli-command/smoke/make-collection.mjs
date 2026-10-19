// Builds smoke.frcol with the `fullyrested edit` CLI. Node instead of a shell script so it
// runs the same on Windows, macOS and Linux. Used by run-smoke.mjs; can also be run alone:
//   node smoke/make-collection.mjs <outDir> [port]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLI = path.resolve(here, '..', 'dist', 'index.js');

// Writes smoke.frcol into dir (created if missing, its smoke files replaced). cli is the
// path to the built CLI entry, run with this node binary so the build under test is used.
export function buildCollection(dir, { port = 8787, cli = DEFAULT_CLI } = {}) {
  mkdirSync(dir, { recursive: true });
  for (const f of ['smoke.frcol', 'fire-guid.frreq', 'fire-slow.frreq', 'flaky.frreq', 'mcp-call.frreq'])
    rmSync(path.join(dir, f), { force: true });
  for (const f of readdirSync(dir)) if (/^watch-.*\.frreq$/.test(f)) rmSync(path.join(dir, f));

  const base = `http://localhost:${port}`;
  const wsBase = `ws://localhost:${port}`;
  const C = 'smoke.frcol';
  const run = args => execFileSync(process.execPath, [cli, ...args], { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
  const fr = (args) => run(['edit', ...args, '-c', C]);

  run(['edit', 'new-collection', '--file', C]);

  // --- http requests used as triggers ---
  fr(['new-request', '--path', 'fire-guid.frreq', '--method', 'post', '--url', `${base}/fire`]);
  fr(['set-body', '--scope', 'request:fire-guid.frreq', '--content-type', 'application/json', '--text', '{"id":"{{$guid}}"}']);
  fr(['new-request', '--path', 'fire-slow.frreq', '--method', 'post', '--url', `${base}/fire?slow=600`]);
  fr(['set-body', '--scope', 'request:fire-slow.frreq', '--content-type', 'application/json', '--text', '{"id":"{{$guid}}"}']);
  fr(['new-request', '--path', 'flaky.frreq', '--method', 'post', '--url', `${base}/flaky`]);
  fr(['new-request', '--path', 'mcp-call.frreq', '--method', 'post', '--url', `${base}/mcp`]);
  fr(['set-type', 'mcp', '--scope', 'request:mcp-call.frreq']);

  const schemaFired = '{"type":"object","required":["fired"]}';
  const schemaRoom = '{"type":"object","required":["urlRoom","msgRoom"],"properties":{"urlRoom":{"const":"{{$guid}}"},"msgRoom":{"const":"{{$guid}}"}}}';
  const schemaFile = 'schema-fired.json';
  writeFileSync(path.join(dir, schemaFile), schemaFired);
  writeFileSync(path.join(dir, 'schema-room.json'), schemaRoom);

  const ws = (name, url) => {
    fr(['new-request', '--path', `${name}.frreq`, '--method', 'get', '--url', url]);
    fr(['set-type', 'websocket', '--scope', `request:${name}.frreq`]);
  };

  // A: fresh {{$guid}} on every firing (3 pushes need 3 distinct ids)
  ws('watch-fresh', `${wsBase}/room/a`);
  fr(['set-expect', '--scope', 'request:watch-fresh.frreq', '--count', '3', '--timeout', '8000', '--schema', `@${schemaFile}`]);
  fr(['set-trigger', '--scope', 'request:watch-fresh.frreq', '--request', 'fire-guid.frreq', '--repeat', 'until-done', '--interval', '500']);

  // B: fixed beat — the call takes 600ms, interval 1000ms
  ws('watch-beat', `${wsBase}/room/b`);
  fr(['set-expect', '--scope', 'request:watch-beat.frreq', '--count', '4', '--timeout', '10000', '--schema', `@${schemaFile}`]);
  fr(['set-trigger', '--scope', 'request:watch-beat.frreq', '--request', 'fire-slow.frreq', '--repeat', 'until-done', '--interval', '1000']);

  // C: one {{$guid}} shared by url, message and expect
  ws('watch-room', `${wsBase}/room/{{$guid}}`);
  fr(['set-message', '--scope', 'request:watch-room.frreq', '{"room":"{{$guid}}"}']);
  fr(['set-expect', '--scope', 'request:watch-room.frreq', '--count', '1', '--timeout', '3000', '--schema', '@schema-room.json']);

  // D: mixed trigger failures in the timeout note
  ws('watch-flaky', `${wsBase}/room/d`);
  fr(['set-expect', '--scope', 'request:watch-flaky.frreq', '--count', '1', '--timeout', '1800', '--schema', `@${schemaFile}`]);
  fr(['set-trigger', '--scope', 'request:watch-flaky.frreq', '--request', 'flaky.frreq', '--repeat', 'until-done', '--interval', '500']);

  // E: interval below 100 is clamped at run time. The CLI refuses 0, so set 100 and then
  // hand-edit the file to 0, the way an old or hand-edited .frreq would look.
  ws('watch-clamp', `${wsBase}/room/e`);
  fr(['set-expect', '--scope', 'request:watch-clamp.frreq', '--count', '1', '--match', 'any', '--timeout', '1000', '--schema', '{"type":"object","required":["never"]}']);
  fr(['set-trigger', '--scope', 'request:watch-clamp.frreq', '--request', 'fire-guid.frreq', '--repeat', 'until-done', '--interval', '100']);
  const clampFile = path.join(dir, 'watch-clamp.frreq');
  writeFileSync(clampFile, readFileSync(clampFile, 'utf8').replace(/"interval": *100/, '"interval": 0'));

  return path.join(dir, C);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(process.argv[2] ?? 'smoke-out');
  console.log(`built ${buildCollection(out, { port: Number(process.argv[3] ?? 8787) })}`);
}
