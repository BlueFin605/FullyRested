// The renderer resolves a request and sends it to main's testRest handler, which calls core's
// executeRequest. For an MCP request what crosses IPC is a structured clone of the resolved
// ExecuteRestAction, so this checks that its mcp field survives the clone and drives the handshake,
// session header and SSE handling in main.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {
    CollectionNode, CreateEmptyAction, CreateEmptyCollectionConfig, executeRequest, normaliseAction, validateResponse, bodyToString
} = require('@fullyrested/core');

let server;
let host;
const seen = [];

before(async () => {
    // Stateful: initialize hands out a session; anything else needs it. Replies are SSE.
    server = http.createServer((req, res) => {
        let text = '';
        req.on('data', c => text += c);
        req.on('end', () => {
            const message = JSON.parse(text);
            seen.push({ method: message.method, session: req.headers['mcp-session-id'] });
            if (message.method != 'initialize' && req.headers['mcp-session-id'] != 'abc') {
                res.writeHead(400, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'No session' } }));
                return;
            }
            if (message.id === undefined) { res.writeHead(202); res.end(); return; }
            const result = message.method == 'initialize'
                ? { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'fake', version: '1' } }
                : { content: [{ type: 'text', text: `called ${message.params.name}` }] };
            res.writeHead(200, { 'content-type': 'text/event-stream', ...(message.method == 'initialize' ? { 'mcp-session-id': 'abc' } : {}) });
            res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n\n`);
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    host = `127.0.0.1:${server.address().port}`;
});

after(() => new Promise(resolve => server.close(resolve)));

test('an MCP request resolved in the renderer runs in main with its handshake', async () => {
    const action = normaliseAction({
        ...CreateEmptyAction(), id: 'm', name: 'call', protocol: 'http', url: `${host}/mcp`, type: 'mcp',
        mcp: { method: 'tools/call', params: '{"name":"kanban_get","arguments":{}}', handshake: true, expect: { outcome: 'result', text: 'kanban_get' } }
    });
    const root = new CollectionNode(CreateEmptyCollectionConfig({ generateGUID: () => 'g' }), 'api.frcol');
    const resolved = root.attach(action, 'mcp/call.frreq').resolve().replaceVariables();

    const overIpc = structuredClone(resolved);
    const response = await executeRequest(overIpc);

    assert.equal(response.status, 200);
    assert.deepEqual(seen.map(s => s.method), ['initialize', 'notifications/initialized', 'tools/call']);
    assert.equal(seen[2].session, 'abc');
    assert.equal(response.body.contentType, 'application/json');
    assert.equal(JSON.parse(bodyToString(response.body.contentType, response.body.body)).result.content[0].text, 'called kanban_get');
    const validation = validateResponse(resolved, response);
    assert.deepEqual(validation.checks, [{ check: 'mcp', passed: true, errors: [] }]);
});
