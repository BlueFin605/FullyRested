import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { request, validation } from './fixture';
import { runCollection } from '../src/run';
import { createSecretStore } from '../src/secret-store';

// The attachments API shape that raised the gaps: a multipart upload (binary part, 201 / 415 / 413),
// presign -> PUT to the returned absolute url -> confirm with the returned key, all inside one run,
// and a run that points the same request at a different url. Authored with the built CLI.
const cli = path.resolve(__dirname, '..', 'dist', 'index.js');
const fullyrested = (args: string[], cwd: string): Promise<{ code: number; out: string; err: string }> =>
  new Promise(resolve => execFile(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' }, (error, out, err) =>
    resolve({ code: error ? (error as { code?: number }).code ?? 1 : 0, out, err })));

const noKeychain = createSecretStore({}, undefined);
const BINARY = Buffer.from([0, 255, 128, 13, 10, 1, 2]);
let stop: () => Promise<void>;
let folder = '';
let col = '';
const uploads = new Map<string, string>();
const seen: string[] = [];
let lastPart: Buffer = Buffer.alloc(0);

beforeAll(async () => {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      seen.push(`${req.method} ${req.url}`);
      const send = (status: number, doc: object = {}) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(doc)); };
      const port = (server.address() as AddressInfo).port;
      if (req.method == 'POST' && req.url == '/pages/p1/attachments') {
        if (!/^multipart\/form-data; boundary=/.test(req.headers['content-type'] ?? '')) return send(415);
        if (body.length > 1000) return send(413);
        lastPart = body;
        return send(201);
      }
      if (req.method == 'POST' && req.url == '/pages/p1/attachments/presign')
        return send(200, { uploadUrl: `http://127.0.0.1:${port}/upload/k1?sig=1`, attachmentKey: 'pages/p1/k1.txt' });
      if (req.method == 'PUT' && req.url?.startsWith('/upload/k1')) { uploads.set('pages/p1/k1.txt', body.toString()); return send(200); }
      if (req.method == 'POST' && req.url == '/pages/p1/attachments/confirm')
        return send(uploads.has(JSON.parse(body.toString()).attachmentKey) ? 200 : 404);
      if (req.url?.startsWith('/pages/p1/info')) return send(200);
      send(400);
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  stop = () => new Promise(resolve => server.close(() => resolve()));

  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-multipart-'));
  col = path.join(folder, 'api.frcol');
  fs.writeFileSync(path.join(folder, 'blob.bin'), BINARY);
  const write = (name: string, doc: object) => fs.writeFileSync(path.join(folder, name), JSON.stringify(doc));
  write('api.frcol', {
    collectionGuid: 'col-1', selectedEnvironmentId: '',
    collectionEnvironment: { name: 'system.settings', variables: [{ variable: 'host', value: host, active: true, id: '1' }], secrets: [], auth: { authentication: 'none' } },
    environments: []
  });
  const run = (id: string, name: string, extra: object) => ({
    id, name, variables: [], secrets: [], headers: [], parameters: [], authentication: { authentication: 'inherit' },
    validation: { type: 'Inherit', httpCode: 200, headers: [], body: 'None' }, ...extra
  });
  const plain = { headers: [] };
  write('1-upload.frreq', request('r1', 'upload', '{{host}}/pages/p1/attachments', {
    ...plain, verb: 'post', validation: validation('ResponseCode', 201),
    runs: [
      run('u1', 'created', {}),
      run('u2', 'wrong type', { headers: [{ key: 'content-type', value: 'application/json', active: true, id: 'h' }], validation: validation('ResponseCode', 415) }),
      run('u3', 'too big', { validation: validation('ResponseCode', 413) })
    ]
  }));
  write('2-presign.frreq', request('r2', 'presign', '{{host}}/pages/p1/attachments/presign', {
    ...plain, verb: 'post',
    capture: [{ variable: 'uploadUrl', from: 'body', path: '$.uploadUrl', id: 'c1' }, { variable: 'attachmentKey', from: 'body', path: '$.attachmentKey', id: 'c2' }]
  }));
  write('3-put.frreq', request('r3', 'put', '{{uploadUrl}}', { ...plain, verb: 'put', body: { contentType: 'text/plain', body: 'hello' } }));
  write('4-confirm.frreq', request('r4', 'confirm', '{{host}}/pages/p1/attachments/confirm', {
    ...plain, verb: 'post', body: { contentType: 'application/json', body: '{"attachmentKey":"{{attachmentKey}}"}' }
  }));
  write('5-info.frreq', request('r5', 'info', '{{host}}/pages/p1/info', {
    ...plain, runs: [run('i1', 'ok', {}), run('i2', 'other guid', { validation: validation('ResponseCode', 400) })]
  }));
});

afterAll(() => stop());

describe('multipart upload, in-run fixture and per-run url, authored with the CLI', () => {
  it('authors the parts and the run url', async () => {
    const edit = (args: string[]) => fullyrested(['edit', ...args, '-c', col], folder);
    let r = await edit(['set-body', '--scope', 'request:1-upload.frreq', '--content-type', 'multipart/form-data',
      '--field', 'kind=note', '--file', `file=${path.join(folder, 'blob.bin')};type=application/octet-stream`]);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toBe('Set multipart body on request:1-upload.frreq\n');
    r = await edit(['set-body', '--scope', 'run:1-upload.frreq#too big', '--content-type', 'multipart/form-data', '--generate', 'file=5000;filename=big.bin']);
    expect(r.code, r.err).toBe(0);
    r = await edit(['set-url', '--scope', 'run:5-info.frreq#other guid', '--url', 'http://{{host}}/pages/not-a-guid/info']);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toBe("Set url '{{host}}/pages/not-a-guid/info' on run:5-info.frreq#other guid\n");

    const doc = JSON.parse(fs.readFileSync(path.join(folder, '1-upload.frreq'), 'utf8'));
    expect(doc.body.body[1]).toMatchObject({ key: 'file', filename: 'blob.bin', contentType: 'application/octet-stream', base64: BINARY.toString('base64') });
    expect(doc.runs[2].body.body[0]).toMatchObject({ key: 'file', filename: 'big.bin', size: 5000 });
  });

  it('runs the cases: 201, 415, 413, upload-then-confirm and the url override', async () => {
    const record = await runCollection({ collection: col, all: true }, noKeychain);
    expect(record.cases.map(c => [c.name, c.outcome, c.response?.status])).toEqual([
      ['upload › created', 'pass', 201], ['upload › wrong type', 'pass', 415], ['upload › too big', 'pass', 413],
      ['presign', 'pass', 200], ['put', 'pass', 200], ['confirm', 'pass', 200],
      ['info › ok', 'pass', 200], ['info › other guid', 'pass', 400]
    ]);
    expect(seen).toContain('GET /pages/not-a-guid/info');
    expect(uploads.get('pages/p1/k1.txt')).toBe('hello');
    // the binary part arrived byte for byte, and the record shows the readable form
    expect(lastPart.includes(BINARY)).toBe(true);
    expect(record.cases[0]!.request.body!.text).toContain('<7 bytes>');
    expect(record.cases[0]!.request.body!.bytes).toBe(lastPart.length);
  });
});
