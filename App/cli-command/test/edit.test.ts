import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LOCATOR_FORMS } from '@fullyrested/core';

// Runs the built CLI (npm run build first) the same way cli.test.ts does, against a throwaway
// collection this suite builds up itself (edit writes, so it cannot share the read-only fixture).
const cli = path.resolve(__dirname, '..', 'dist', 'index.js');

function fullyrested(args: string[], workDir: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise(resolve => {
    execFile(process.execPath, [cli, ...args], { cwd: workDir, encoding: 'utf8' }, (error, out, err) =>
      resolve({ code: error ? (error as { code?: number }).code ?? 1 : 0, out, err }));
  });
}

describe('fullyrested edit', () => {
  let dir = '';
  let collection = '';
  let port = 0;
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-edit-'));
    collection = path.join(dir, 'api.frcol');

    // Answers any method/path with a 200 JSON body, so later steps can run a real case against it
    // without needing a request-specific route.
    server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // many sequential CLI subprocess spawns; the default 5s test timeout is too tight for this one
  it('builds, edits and tears down a collection end to end', async () => {
    // new-collection: no -c, since the file does not exist yet
    let r = await fullyrested(['edit', 'new-collection', '--file', collection, '--environment', 'Dev', 'Prod'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe('Created collection api.frcol\n');
    expect(fs.existsSync(collection)).toBe(true);
    let doc = JSON.parse(fs.readFileSync(collection, 'utf8'));
    expect(doc.environments.map((e: { name: string }) => e.name)).toEqual(['Dev', 'Prod']);
    const devId = doc.environments[0].id;
    const prodId = doc.environments[1].id;
    expect(doc.selectedEnvironmentId).toBe(devId);

    // select-environment / new-environment: both act on the collection itself, no --scope
    r = await fullyrested(['edit', 'select-environment', '-c', collection, '--name', 'Prod'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe("Selected environment 'Prod'\n");
    doc = JSON.parse(fs.readFileSync(collection, 'utf8'));
    expect(doc.selectedEnvironmentId).toBe(prodId);

    r = await fullyrested(['edit', 'new-environment', '-c', collection, '--name', 'Staging'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe("Added environment 'Staging'\n");

    // new-folder then set-header: set-header on a folder with no folder.frfolder yet creates one
    r = await fullyrested(['edit', 'new-folder', '-c', collection, '--path', 'items'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe('Created folder items\n');
    expect(fs.statSync(path.join(dir, 'items')).isDirectory()).toBe(true);
    expect(fs.existsSync(path.join(dir, 'items', 'folder.frfolder'))).toBe(false);

    r = await fullyrested(['edit', 'set-header', '-c', collection, '--scope', 'folder:items', '--name', 'X-Folder', '--value', 'items-value'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe("Set header 'X-Folder' on folder:items\n");
    const folderFile = path.join(dir, 'items', 'folder.frfolder');
    expect(fs.existsSync(folderFile)).toBe(true);
    let folder = JSON.parse(fs.readFileSync(folderFile, 'utf8'));
    expect(folder.headers).toEqual([{ key: 'X-Folder', value: 'items-value', active: true, id: expect.any(String) }]);

    // remove-setting: once it is gone, removing it again reports no change, with '(no change)' from formatEdit
    r = await fullyrested(['edit', 'remove-setting', '-c', collection, '--scope', 'folder:items', '--kind', 'header', '--name', 'X-Folder'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe("Removed header 'X-Folder' from folder:items\n");
    folder = JSON.parse(fs.readFileSync(folderFile, 'utf8'));
    expect(folder.headers).toEqual([]);

    r = await fullyrested(['edit', 'remove-setting', '-c', collection, '--scope', 'folder:items', '--kind', 'header', '--name', 'X-Folder'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe("No header 'X-Folder' on folder:items: nothing to remove (no change)\n");

    // new-request: a leading http:// is split off into protocol, the rest kept verbatim
    r = await fullyrested(['edit', 'new-request', '-c', collection, '--path', 'items/ping.frreq', '--method', 'get', '--url', `http://127.0.0.1:${port}/ping`], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe('Created request items/ping.frreq\n');
    const requestFile = path.join(dir, 'items', 'ping.frreq');
    let action = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    expect(action.verb).toBe('get');
    expect(action.protocol).toBe('http');
    expect(action.url).toBe(`127.0.0.1:${port}/ping`);

    // set-method / set-url: both re-resolve the file through request:<path>
    r = await fullyrested(['edit', 'set-method', '-c', collection, '--scope', 'request:items/ping.frreq', '--method', 'post'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe("Set method 'post' on request:items/ping.frreq\n");

    r = await fullyrested(['edit', 'set-url', '-c', collection, '--scope', 'request:items/ping.frreq', '--url', `http://127.0.0.1:${port}/pong`], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe(`Set url '127.0.0.1:${port}/pong' on request:items/ping.frreq\n`);
    action = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    expect(action.verb).toBe('post');
    expect(action.url).toBe(`127.0.0.1:${port}/pong`);

    // set-body text, then set-body fields: --field splits on the FIRST '=' only, so a value that
    // itself contains '=' (b=two=three below) is kept whole rather than cut short.
    r = await fullyrested(['edit', 'set-body', '-c', collection, '--scope', 'request:items/ping.frreq', '--content-type', 'application/json', '--text', '{}'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe('Set body on request:items/ping.frreq\n');
    action = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    expect(action.body).toEqual({ contentType: 'application/json', body: '{}' });

    r = await fullyrested(['edit', 'set-body', '-c', collection, '--scope', 'request:items/ping.frreq',
      '--content-type', 'application/x-www-form-urlencoded', '--field', 'a=1', '--field', 'b=two=three'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe('Set form body on request:items/ping.frreq\n');
    action = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    expect(action.body.contentType).toBe('application/x-www-form-urlencoded');
    expect(action.body.body).toEqual([
      { key: 'a', value: '1', active: true, id: expect.any(String) },
      { key: 'b', value: 'two=three', active: true, id: expect.any(String) }
    ]);

    // --field with no '=' at all is a usage error, before anything is written
    const badField = await fullyrested(['edit', 'set-body', '-c', collection, '--scope', 'request:items/ping.frreq',
      '--content-type', 'application/x-www-form-urlencoded', '--field', 'nope'], dir);
    expect(badField.code).toBe(2);
    expect(badField.err).toBe("error: --field needs name=value (got 'nope')\n");
    action = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    expect(action.body.body).toHaveLength(2); // unchanged by the failed call above

    // set-param --disabled inverts the verb's default-enabled argument
    r = await fullyrested(['edit', 'set-param', '-c', collection, '--scope', 'request:items/ping.frreq', '--name', 'mode', '--value', 'test', '--disabled'], dir);
    expect(r.code).toBe(0);
    action = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    expect(action.parameters).toEqual([{ key: 'mode', value: 'test', active: false, id: expect.any(String) }]);

    // set-validation-header, then set-validation (type/httpCode only -- headers untouched)
    r = await fullyrested(['edit', 'set-validation-header', '-c', collection, '--scope', 'request:items/ping.frreq', '--name', 'X-Expect', '--value', 'yes'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe("Set validation header 'X-Expect' on request:items/ping.frreq\n");

    r = await fullyrested(['edit', 'set-validation', '-c', collection, '--scope', 'request:items/ping.frreq', '--type', 'ResponseCode', '--http-code', '200'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe('Set validation on request:items/ping.frreq\n');
    action = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    expect(action.validation.type).toBe('ResponseCode');
    expect(action.validation.httpCode).toBe(200);
    expect(action.validation.headers).toEqual([{ key: 'X-Expect', value: 'yes', active: true, id: expect.any(String) }]);

    // set-validation --json-schema <file>: read as a file path (fs.readFileSync in the command), not inline JSON
    const schemaFile = path.join(dir, 'schema.json');
    fs.writeFileSync(schemaFile, JSON.stringify({ type: 'object' }));
    r = await fullyrested(['edit', 'set-validation', '-c', collection, '--scope', 'request:items/ping.frreq', '--type', 'Body', '--body', 'JsonSchema', '--json-schema', schemaFile], dir);
    expect(r.code).toBe(0);
    action = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    expect(action.validation.type).toBe('Body');
    expect(action.validation.body).toBe('JsonSchema');
    expect(JSON.parse(action.validation.jsonSchema.schema)).toEqual({ type: 'object' });

    // new-run, then variable/secret-ref/auth on the run scope
    r = await fullyrested(['edit', 'new-run', '-c', collection, '--request', 'items/ping.frreq', '--name', 'case-one'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe("Added run 'case-one'\n");

    r = await fullyrested(['edit', 'set-variable', '-c', collection, '--scope', 'run:items/ping.frreq#case-one', '--name', 'token', '--value', 'abc123'], dir);
    expect(r.code).toBe(0);
    action = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    expect(action.runs[0].variables).toEqual([{ variable: 'token', value: 'abc123', active: true, id: expect.any(String) }]);

    r = await fullyrested(['edit', 'add-secret-ref', '-c', collection, '--scope', 'run:items/ping.frreq#case-one', '--name', 'apikey'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe("Added secret reference 'apikey' on run:items/ping.frreq#case-one\n");
    action = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    expect(action.runs[0].secrets).toEqual([{ $secret: 'apikey', active: true, id: expect.any(String) }]);

    // set-auth: stored type is lower-case; camelCase input still matches (core is case-insensitive)
    r = await fullyrested(['edit', 'set-auth', '-c', collection, '--scope', 'run:items/ping.frreq#case-one', '--type', 'BasicAuth', '--user-name', 'alice'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe("Set auth 'basicauth' on run:items/ping.frreq#case-one\n");
    action = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    expect(action.runs[0].authentication.authentication).toBe('basicauth');
    expect(action.runs[0].authentication.basicAuth.userName).toBe('alice');

    // rename a run (bare name only; a path is move's job)
    r = await fullyrested(['edit', 'rename', '-c', collection, '--scope', 'run:items/ping.frreq#case-one', '--name', 'case-renamed'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe("Renamed run 'case-one' to 'case-renamed'\n");
    action = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    expect(action.runs[0].name).toBe('case-renamed');

    // Record one real run of it, then learn a validation from that case via validation-from-case
    const ran = await fullyrested(['run', '-c', collection, '-a', 'items/ping.frreq', '-r', 'case-renamed', '--record', '--store', dir], dir);
    expect(ran.code).toBe(0);
    const runId = fs.readdirSync(path.join(dir, '.fullyrested-runs'))[0]!.replace('.frrun', '');

    r = await fullyrested(['edit', 'validation-from-case', '-c', collection, '--scope', 'run:items/ping.frreq#case-renamed', '--case', '1', '--store', dir], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe(`Set validation on run:items/ping.frreq#case-renamed from run ${runId} case 1: expect 200 and a JSON body of 1 property\n`);
    action = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    expect(action.runs[0].validation.type).toBe('Body');
    expect(action.runs[0].validation.httpCode).toBe(200);
    expect(JSON.parse(action.runs[0].validation.jsonSchema.schema).properties).toHaveProperty('ok');

    // move a request to a new path
    r = await fullyrested(['edit', 'move', '-c', collection, '--scope', 'request:items/ping.frreq', '--to', 'items/renamed.frreq'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe('Moved items/ping.frreq to items/renamed.frreq\n');
    expect(fs.existsSync(requestFile)).toBe(false);
    const movedFile = path.join(dir, 'items', 'renamed.frreq');
    expect(fs.existsSync(movedFile)).toBe(true);

    // delete a run, then delete the folder (and everything delete recognises beneath it)
    r = await fullyrested(['edit', 'delete', '-c', collection, '--scope', 'run:items/renamed.frreq#case-renamed'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe("Deleted run 'case-renamed'\n");
    action = JSON.parse(fs.readFileSync(movedFile, 'utf8'));
    expect(action.runs).toEqual([]);

    r = await fullyrested(['edit', 'delete', '-c', collection, '--scope', 'folder:items'], dir);
    expect(r.code).toBe(0);
    expect(r.out).toBe('Deleted items\n');
    expect(fs.existsSync(path.join(dir, 'items'))).toBe(false);

    // --json prints a parseable EditResult instead of the text line
    r = await fullyrested(['edit', 'new-environment', '-c', collection, '--name', 'Temp', '--json'], dir);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.out);
    expect(parsed).toEqual({ file: 'api.frcol', scope: 'collection', changed: true, message: "Added environment 'Temp'" });
  }, 60000);

  // AIF-12: --disabled on a validation header, spelled as set-header s own flag is.
  it('set-validation-header --disabled writes an inactive check, and the default stays active', async () => {
    let r = await fullyrested(['edit', 'new-request', '-c', collection, '--path', 'parked.frreq', '--method', 'get', '--url', 'https://x/p'], dir);
    expect(r.code).toBe(0);
    const file = path.join(dir, 'parked.frreq');
    const checks = () => JSON.parse(fs.readFileSync(file, 'utf8')).validation.headers;

    r = await fullyrested(['edit', 'set-validation-header', '-c', collection, '--scope', 'request:parked.frreq',
      '--name', 'X-Trace', '--value', '1', '--disabled'], dir);
    expect(r.code).toBe(0);
    expect(checks()).toMatchObject([{ key: 'X-Trace', value: '1', active: false }]);

    r = await fullyrested(['edit', 'set-validation-header', '-c', collection, '--scope', 'request:parked.frreq',
      '--name', 'X-Trace', '--value', '1'], dir);
    expect(r.code).toBe(0);
    expect(checks()[0].active).toBe(true);
  });

  // AIF-11: password, secretKey and sessionToken are reference-only, so an agent can finish a
  // basicauth or awssig block without a value ever passing through the CLI.
  it('set-auth takes a secret reference for the password, and refuses a literal', async () => {
    let r = await fullyrested(['edit', 'add-secret-ref', '-c', collection, '--scope', 'collection', '--name', 'apiPass'], dir);
    expect(r.code).toBe(0);

    r = await fullyrested(['edit', 'set-auth', '-c', collection, '--scope', 'collection',
      '--type', 'basicauth', '--user-name', 'api', '--password', '{{$apiPass}}'], dir);
    expect(r.code).toBe(0);
    const auth = JSON.parse(fs.readFileSync(collection, 'utf8')).collectionEnvironment.auth;
    expect(auth.basicAuth).toEqual({ userName: 'api', password: '{{$apiPass}}' });

    // a literal is refused by core, which queryAction maps to exit 2
    r = await fullyrested(['edit', 'set-auth', '-c', collection, '--scope', 'collection',
      '--type', 'basicauth', '--password', 'hunter2'], dir);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/password takes a secret reference/);
  });

  it('set-auth takes secret references for the awssig secret key and session token', async () => {
    let r = await fullyrested(['edit', 'set-auth', '-c', collection, '--scope', 'collection',
      '--type', 'awssig', '--access-key', 'AKIAEXAMPLE', '--secret-key', '{{$awsSecret}}',
      '--session-token', '{{$awsSession}}'], dir);
    expect(r.code).toBe(0);
    const awsSig = JSON.parse(fs.readFileSync(collection, 'utf8')).collectionEnvironment.auth.awsSig;
    expect(awsSig.secretKey).toBe('{{$awsSecret}}');
    expect(awsSig.sessionToken).toBe('{{$awsSession}}');

    r = await fullyrested(['edit', 'set-auth', '-c', collection, '--scope', 'collection',
      '--type', 'awssig', '--secret-key', 'AKIASECRETVALUE'], dir);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/secretKey takes a secret reference/);
  });

  it('a bad locator exits 2 and lists the forms, matching --scope\'s own help text', async () => {
    const r = await fullyrested(['edit', 'set-header', '-c', collection, '--scope', 'bogus', '--name', 'x', '--value', 'y'], dir);
    expect(r.code).toBe(2);
    expect(r.err).toContain(LOCATOR_FORMS);
  });

  it('remove-setting rejects an unknown --kind before touching the file', async () => {
    const r = await fullyrested(['edit', 'remove-setting', '-c', collection, '--scope', 'collection', '--kind', 'bogus', '--name', 'x'], dir);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/^error: --kind must be one of header, param, variable, secret, validation-header/);
  });

  it('every subcommand but new-collection requires -c/--collection', async () => {
    const r = await fullyrested(['edit', 'set-header', '--scope', 'collection', '--name', 'x', '--value', 'y'], dir);
    expect(r.code).toBe(1); // commander's own missing-required-option exit, not queryAction's
    expect(r.err).toContain('required option');
  });
});

describe('fullyrested edit: websocket verbs', () => {
  let dir = '';
  let collection = '';
  const req = 'request:chat.frreq';
  const readReq = () => JSON.parse(fs.readFileSync(path.join(dir, 'chat.frreq'), 'utf8'));
  const edit = (...args: string[]) => fullyrested(['edit', ...args, '-c', collection], dir);

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-edit-ws-'));
    collection = path.join(dir, 'ws.frcol');
    let r = await fullyrested(['edit', 'new-collection', '--file', collection], dir);
    expect(r.code).toBe(0);
    r = await edit('new-request', '--path', 'chat.frreq', '--method', 'get', '--url', 'ws://localhost/x');
    expect(r.code).toBe(0);
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('set-type switches a request to websocket and back, and refuses an unknown type', async () => {
    let r = await edit('set-type', 'websocket', '--scope', req);
    expect(r.code).toBe(0);
    expect(readReq().type).toBe('websocket');

    const before = fs.readFileSync(path.join(dir, 'chat.frreq'), 'utf8');
    r = await edit('set-type', 'carrier-pigeon', '--scope', req);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/request type/);
    expect(fs.readFileSync(path.join(dir, 'chat.frreq'), 'utf8')).toBe(before);

    r = await edit('set-type', 'http', '--scope', req);
    expect(r.code).toBe(0);
    expect(readReq().type).toBe('http');
  });

  it('set-message writes the message of a websocket request, and refuses an http one', async () => {
    let r = await edit('set-message', 'hello', '--scope', req);
    expect(r.code).toBe(2); // still http
    expect(r.err).toMatch(/websocket/);
    expect(readReq().message ?? '').toBe('');

    await edit('set-type', 'websocket', '--scope', req);
    r = await edit('set-message', '{"op":"{{name}}"}', '--scope', req);
    expect(r.code).toBe(0);
    expect(readReq().message).toBe('{"op":"{{name}}"}');
  });

  it('set-expect changes only the options given and refuses invalid values', async () => {
    await edit('set-type', 'websocket', '--scope', req);
    let r = await edit('set-expect', '--scope', req, '--count', '3', '--match', 'any', '--extras', 'fail',
      '--timeout', '5000', '--settle', '200');
    expect(r.code).toBe(0);
    expect(readReq().expect).toMatchObject({ count: 3, match: 'any', extras: 'fail', timeout: 5000, settle: 200 });

    r = await edit('set-expect', '--scope', req, '--timeout', '9000');
    expect(r.code).toBe(0);
    expect(readReq().expect).toMatchObject({ count: 3, match: 'any', extras: 'fail', timeout: 9000, settle: 200 });

    const schemaFile = path.join(dir, 'schema.json');
    fs.writeFileSync(schemaFile, '{"type":"object"}');
    r = await edit('set-expect', '--scope', req, '--schema', `@${schemaFile}`);
    expect(r.code).toBe(0);
    expect(JSON.stringify(readReq().expect.schema)).toContain('object');
    expect(readReq().expect).toMatchObject({ count: 3, timeout: 9000 });

    const before = fs.readFileSync(path.join(dir, 'chat.frreq'), 'utf8');
    for (const bad of [['--timeout', '0'], ['--timeout', 'soon'], ['--count', '0'], ['--match', 'some'], ['--extras', 'x'], ['--schema', '{nope']]) {
      r = await edit('set-expect', '--scope', req, ...bad);
      expect(r.code, bad.join(' ')).toBe(2);
    }
    expect((await edit('set-expect', '--scope', req, '--timeout', '0')).err).toMatch(/timeout must be a positive whole number/);
    expect(fs.readFileSync(path.join(dir, 'chat.frreq'), 'utf8')).toBe(before);
  }, 60000); // about a dozen CLI spawns; Windows CI runs them well over the 5s default

  it('set-trigger round-trips, shows in tree and show, clears, and refuses bad values', async () => {
    let r = await edit('new-request', '--path', 'touch.frreq', '--method', 'put', '--url', 'http://localhost/touch');
    expect(r.code).toBe(0);
    r = await edit('new-run', '--request', 'touch.frreq', '--name', 'fixture');
    expect(r.code).toBe(0);
    await edit('set-type', 'websocket', '--scope', req);

    r = await edit('set-trigger', '--scope', req, '--request', 'touch.frreq', '--run', 'fixture', '--repeat', 'once', '--interval', '250', '--delay', '50');
    expect(r.code, r.err).toBe(0);
    expect(readReq().trigger).toMatchObject({ request: 'touch.frreq', repeat: 'once', interval: 250, delay: 50 });
    expect(readReq().trigger.run).toBe('fixture');

    // only the options given change
    r = await edit('set-trigger', '--scope', req, '--delay', '75');
    expect(r.code).toBe(0);
    expect(readReq().trigger).toMatchObject({ request: 'touch.frreq', repeat: 'once', interval: 250, delay: 75, run: 'fixture' });

    const tree = await fullyrested(['tree', '-c', collection], dir);
    expect(tree.out).toContain('trigger: touch.frreq › fixture, once, interval 250ms, delay 75ms');
    expect(tree.out).toContain('expect: count 3, match any, extras fail, timeout 9000ms, settle 200ms, schema yes');
    const shown = JSON.parse((await fullyrested(['show', '-c', collection, '-a', 'chat.frreq', '--json'], dir)).out);
    expect(shown.websocket.trigger).toMatchObject({ request: 'touch.frreq', run: 'fixture', delay: 75 });
    expect(shown.websocket.expect).toMatchObject({ count: 3, schema: true });
    expect(shown.requestType).toBe('websocket');

    const before = fs.readFileSync(path.join(dir, 'chat.frreq'), 'utf8');
    for (const bad of [['--request', 'nope.frreq'], ['--request', 'chat.frreq'], ['--repeat', 'twice'], ['--interval', '5'], ['--delay', '-1'], ['--interval', 'soon'], ['--run', 'missing'], ['--clear', '--delay', '5'], []]) {
      r = await edit('set-trigger', '--scope', req, ...bad);
      expect(r.code, bad.join(' ')).toBe(2);
    }
    expect(fs.readFileSync(path.join(dir, 'chat.frreq'), 'utf8')).toBe(before);

    r = await edit('set-trigger', '--scope', req, '--clear');
    expect(r.code).toBe(0);
    expect(readReq().trigger).toBeUndefined();
    await edit('set-type', 'http', '--scope', req);
    r = await edit('set-trigger', '--scope', req, '--request', 'touch.frreq');
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/websocket/);
  }, 60000);

  it('set-auth --placement stores where the token goes, and refuses a bad name', async () => {
    let r = await edit('set-auth', '--scope', req, '--type', 'bearertoken', '--token', 'abc', '--placement', 'token');
    expect(r.code).toBe(0);
    expect(readReq().authentication.placement).toBe('token');

    r = await edit('set-auth', '--scope', req, '--type', 'bearertoken', '--placement', 'header');
    expect(r.code).toBe(0);
    expect(readReq().authentication.placement).toBe('header');

    const before = fs.readFileSync(path.join(dir, 'chat.frreq'), 'utf8');
    r = await edit('set-auth', '--scope', req, '--type', 'bearertoken', '--placement', 'not valid!');
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/placement must be/);
    expect(fs.readFileSync(path.join(dir, 'chat.frreq'), 'utf8')).toBe(before);
  });
});
