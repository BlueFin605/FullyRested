import { createServer, IncomingHttpHeaders } from 'node:http';
import { AddressInfo } from 'node:net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function validation(type: string, httpCode: number) {
  return { type, httpCode, headers: [], body: 'None', jsonSchema: undefined };
}

export function request(id: string, name: string, url: string, extra: object = {}) {
  return {
    id, name, verb: 'get', protocol: 'http', url,
    headers: [{ key: 'x-key', value: '{{$apikey}}', active: true, id: 'h1' }],
    parameters: [],
    body: { contentType: 'none', body: undefined },
    authentication: { authentication: 'inherit' },
    runs: [],
    validation: validation('ResponseCode', 200),
    ...extra
  };
}


// A local http server plus a collection on disk (secret "apikey" sent as x-key). Reusable by every CLI test.
export async function startFixture() {
  const last: { headers: IncomingHttpHeaders; url: string } = { headers: {}, url: '' };
  const server = createServer((req, res) => {
    last.headers = req.headers;
    last.url = req.url ?? '';
    const status = req.url?.startsWith('/missing') ? 404 : 200;
    res.writeHead(status, { 'content-type': 'text/plain' });
    res.end(`env=${new URL(req.url ?? '', 'http://x').searchParams.get('env')}`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;

  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fullyrested-cli-'));
  fs.writeFileSync(path.join(folder, 'api.frcol'), JSON.stringify({
    collectionGuid: 'col-1',
    selectedEnvironmentId: 'dev',
    collectionEnvironment: { name: 'system.settings', variables: [{ variable: 'host', value: host, active: true, id: '1' }], secrets: [{ $secret: 'apikey', active: true, id: 's' }], auth: { authentication: 'none' } },
    environments: [
      { name: 'Dev', id: 'dev', variables: [{ variable: 'env', value: 'dev', active: true, id: '2' }], secrets: [], auth: { authentication: 'inherit' } },
      { name: 'Prod', id: 'prod', variables: [{ variable: 'env', value: 'prod', active: true, id: '3' }], secrets: [], auth: { authentication: 'inherit' } }
    ]
  }));
  fs.mkdirSync(path.join(folder, 'items'));
  fs.writeFileSync(path.join(folder, 'items', 'folder.frfolder'), JSON.stringify({
    folderId: 'items-folder', variables: [], secrets: [], auth: { authentication: 'inherit' },
    headers: [{ key: 'x-folder', value: 'items', active: true, id: 'f' }]
  }));
  fs.writeFileSync(path.join(folder, 'items', 'ok.frreq'), JSON.stringify(request('r-ok', 'ok', '{{host}}/ok', {
    parameters: [{ key: 'env', value: '{{env}}', active: true, id: 'p' }]
  })));
  fs.writeFileSync(path.join(folder, 'items', 'runs.frreq'), JSON.stringify(request('r-runs', 'runs', '{{host}}/missing', {
    runs: [
      { id: 'run-404', name: 'expects 404', parameters: [], headers: [], variables: [], secrets: [], authentication: { authentication: 'inherit' }, validation: validation('ResponseCode', 404) },
      { id: 'run-inherit', name: 'inherits 200', parameters: [], headers: [], variables: [], secrets: [], authentication: { authentication: 'inherit' }, validation: validation('Inherit', 0) }
    ]
  })));
  fs.writeFileSync(path.join(folder, 'old.reasyreq'), JSON.stringify(request('r-old', 'old', '{{host}}/ok', { validation: undefined })));
  fs.writeFileSync(path.join(folder, 'down.frreq'), JSON.stringify(request('r-down', 'down', '127.0.0.1:1/nothing', { validation: undefined })));

  return {
    host, folder, last,
    collection: path.join(folder, 'api.frcol'),
    async stop() {
      await new Promise<void>(resolve => server.close(() => resolve()));
      fs.rmSync(folder, { recursive: true, force: true });
    }
  };
}
