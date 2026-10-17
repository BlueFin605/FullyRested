import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, IncomingHttpHeaders, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ExecuteRestAction, HttpProtocol, MULTIPART_CONTENT_TYPE, MultipartPart, RestTypeVerb, buildMultipart, buildCaseRecord, executeRequest, prepareRequest } from '../src';

const part = (key: string, extra: Partial<MultipartPart> = {}): MultipartPart => ({ key, value: '', active: true, id: key, ...extra });
const decode = (b: Uint8Array) => Buffer.from(b).toString('latin1');

describe('buildMultipart', () => {
  it('frames parts with CRLF, text fields, file parts, binary and generated content', () => {
    const body = buildMultipart([
      part('note', { value: 'hi\nthere' }),
      part('doc', { value: 'abc', filename: 'a.txt' }),
      part('bin', { filename: 'b.bin', contentType: 'image/png', base64: 'AAECgw==' }),
      part('big', { size: 4 }),
      part('off', { value: 'x', active: false })
    ]);
    const b = body.boundary;
    expect(decode(body.bytes)).toBe([
      `--${b}`, 'Content-Disposition: form-data; name="note"', '', 'hi\nthere',
      `--${b}`, 'Content-Disposition: form-data; name="doc"; filename="a.txt"', 'Content-Type: text/plain', '', 'abc',
      `--${b}`, 'Content-Disposition: form-data; name="bin"; filename="b.bin"', 'Content-Type: image/png', '', '\u0000\u0001\u0002\u0083',
      `--${b}`, 'Content-Disposition: form-data; name="big"; filename="file"', 'Content-Type: application/octet-stream', '', 'aaaa',
      `--${b}--`, ''
    ].join('\r\n'));
    expect(body.text).toContain('<4 bytes>');
    expect(body.text).not.toContain('\u0083');
  });

  it('picks a boundary that is not in the content', () => {
    const body = buildMultipart([part('f', { value: '----FullyRestedBoundary' })]);
    expect(body.boundary).not.toBe('----FullyRestedBoundary');
  });
});

describe('prepareRequest with a multipart body', () => {
  const action = (headers: Record<string, string> = {}) => ExecuteRestAction.NewExecuteRestAction()
    .setVerb(RestTypeVerb.post).setHeaders(headers)
    .setBody({ contentType: MULTIPART_CONTENT_TYPE, body: [part('f', { filename: 'f.bin', base64: 'AAEC' })] });

  it('sets the content type with the boundary', () => {
    const r = prepareRequest(action());
    expect(r.headers['content-type']).toMatch(/^multipart\/form-data; boundary=----FullyRestedBoundary/);
    expect(r.bodyBytes!.length).toBeGreaterThan(3);
  });
  it('completes a bare multipart/form-data header with the boundary', () => {
    expect(prepareRequest(action({ 'Content-Type': 'multipart/form-data' })).headers['Content-Type']).toMatch(/boundary=/);
  });
  it('leaves another content type as written', () => {
    expect(prepareRequest(action({ 'content-type': 'application/json' })).headers['content-type']).toBe('application/json');
  });
  it('records the readable body with the true byte count', () => {
    const request = prepareRequest(action());
    const record = buildCaseRecord({ index: 1, name: 'n', requestFile: 'f', ms: 1, request });
    expect(record.request.body!.bytes).toBe(request.bodyBytes!.length);
    expect(record.request.body!.text).toContain('<3 bytes>');
  });
});

describe('sending multipart', () => {
  let server: Server;
  let host = '';
  let got: { headers: IncomingHttpHeaders; body: Buffer } = { headers: {}, body: Buffer.alloc(0) };
  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => { got = { headers: req.headers, body: Buffer.concat(chunks) }; res.end('ok'); });
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>(r => server.close(() => r())));

  it('delivers the binary part byte for byte', async () => {
    const bytes = Buffer.from([0, 255, 128, 13, 10, 1]);
    await executeRequest(ExecuteRestAction.NewExecuteRestAction().setProtocol(HttpProtocol.http).setVerb(RestTypeVerb.post)
      .setUrl(`${host}/u`).setBody({ contentType: MULTIPART_CONTENT_TYPE, body: [part('file', { filename: 'x.bin', base64: bytes.toString('base64') })] }));
    expect(got.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    const at = got.body.indexOf('\r\n\r\n') + 4;
    expect(got.body.subarray(at, at + bytes.length).equals(bytes)).toBe(true);
    expect(got.body.toString('latin1')).toContain('filename="x.bin"');
  });
});
