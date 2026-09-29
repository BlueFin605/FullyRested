import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, IncomingHttpHeaders, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ExecuteRestAction, HttpProtocol, NETWORK_ERROR_STATUS, RestTypeVerb, bodyToString, executeRequest } from '../src';

let server: Server;
let host = '';
let received: { method?: string, headers: IncomingHttpHeaders, body: string } = { headers: {}, body: '' };

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      received = { method: req.method, headers: req.headers, body };
      if (req.url === '/missing') {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end('{"error":"not found"}');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'x-test': 'yes' });
      res.end('hello');
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

const to = (path: string) => ExecuteRestAction.NewExecuteRestAction().setProtocol(HttpProtocol.http).setUrl(`${host}${path}`);
const text = (result: Awaited<ReturnType<typeof executeRequest>>) => bodyToString(result.body?.contentType, result.body?.body);

describe('executeRequest', () => {
  it('returns status, headers, sent headers and body', async () => {
    const result = await executeRequest(to('/ok').setHeaders({ 'x-custom': 'abc' }));

    expect(result.status).toBe(200);
    expect(result.headers['x-test']).toBe('yes');
    expect(result.headersSent['x-custom']).toBe('abc');
    expect(result.body?.contentType).toBe('text/plain; charset=utf-8');
    expect(text(result)).toBe('hello');
  });

  it('returns the body of a non-2xx response', async () => {
    const result = await executeRequest(to('/missing'));

    expect(result.status).toBe(404);
    expect(text(result)).toBe('{"error":"not found"}');
  });

  it('sends no body and no content-type when the body is none', async () => {
    await executeRequest(to('/ok').setBody({ contentType: 'none', body: '' }));

    expect(received.method).toBe('GET');
    expect(received.headers['content-type']).toBeUndefined();
    expect(received.body).toBe('');
  });

  it('sends a JSON body with its content-type', async () => {
    await executeRequest(to('/ok').setVerb(RestTypeVerb.post).setBody({ contentType: 'application/json', body: '{"a":1}' }));

    expect(received.method).toBe('POST');
    expect(received.headers['content-type']).toBe('application/json');
    expect(received.body).toBe('{"a":1}');
  });

  it('keeps a content-type header the user set explicitly', async () => {
    await executeRequest(to('/ok').setVerb(RestTypeVerb.put)
      .setHeaders({ 'Content-Type': 'application/vnd.api+json' })
      .setBody({ contentType: 'application/json', body: '{}' }));

    expect(received.headers['content-type']).toBe('application/vnd.api+json');
  });

  it('sends the option verb as OPTIONS', async () => {
    await executeRequest(to('/ok').setVerb(RestTypeVerb.option));
    expect(received.method).toBe('OPTIONS');
  });

  it('reports connection refused as ECONNREFUSED / -4', async () => {
    const closed = createServer();
    await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>(resolve => closed.close(() => resolve()));

    const result = await executeRequest(to('').setUrl(`127.0.0.1:${port}/`));

    expect(result.status).toBe(NETWORK_ERROR_STATUS['ECONNREFUSED']);
    expect(result.status).toBe(-4);
    expect(result.statusText).toBe('ECONNREFUSED');
  });
});
