import { createServer, IncomingHttpHeaders } from 'node:http';
import { AddressInfo } from 'node:net';

// A small MCP streamable-HTTP server for tests. Paths pick its behaviour:
//   /stateless  JSON replies, no session (like BlueFinWiki's /mcp)
//   /sse        the same replies as a text/event-stream
//   /stateful   initialize hands out Mcp-Session-Id 's-1'; any other request without it is a 400
//   /locked     401 for everything
// Tools: echo (returns its arguments as JSON text), fail (isError, text 'boom'); any other tool is
// JSON-RPC error -32602, any other method -32601.
export interface FakeMcp {
  host: string;
  received: { url: string; headers: IncomingHttpHeaders; body: any }[];
  stop(): Promise<void>;
}

function reply(message: any): any {
  const id = message.id;
  switch (message.method) {
    case 'initialize':
      return { jsonrpc: '2.0', id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1' } } };
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: [{ name: 'echo', inputSchema: { type: 'object' } }, { name: 'fail', inputSchema: { type: 'object' } }] } };
    case 'tools/call': {
      const name = message.params?.name;
      if (name == 'echo')
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(message.params.arguments ?? {}) }] } };
      if (name == 'fail')
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'boom' }], isError: true } };
      return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${name}` } };
    }
    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${message.method}` } };
  }
}

export async function startFakeMcp(): Promise<FakeMcp> {
  const received: FakeMcp['received'] = [];
  const server = createServer((req, res) => {
    let text = '';
    req.on('data', chunk => text += chunk);
    req.on('end', () => {
      let message: any;
      try { message = JSON.parse(text); } catch { message = undefined; }
      received.push({ url: req.url ?? '', headers: req.headers, body: message });

      if (req.url == '/locked') {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end('{"message":"Unauthorized"}');
        return;
      }
      if (req.method != 'POST' || message == undefined) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
        return;
      }
      if (req.url == '/stateful' && message.method != 'initialize' && req.headers['mcp-session-id'] != 's-1') {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Bad Request: No valid session ID provided' } }));
        return;
      }
      if (message.id === undefined) {   // a notification
        res.writeHead(202);
        res.end();
        return;
      }

      const headers: Record<string, string> = req.url == '/stateful' && message.method == 'initialize' ? { 'mcp-session-id': 's-1' } : {};
      const body = JSON.stringify(reply(message));
      if (req.url == '/sse') {
        res.writeHead(200, { ...headers, 'content-type': 'text/event-stream' });
        res.end(`event: message\ndata: ${body}\n\n`);
        return;
      }
      res.writeHead(200, { ...headers, 'content-type': 'application/json' });
      res.end(body);
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    host: `127.0.0.1:${(server.address() as AddressInfo).port}`,
    received,
    stop: () => new Promise<void>(resolve => server.close(() => resolve()))
  };
}
