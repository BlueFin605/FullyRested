// The websocket IPC handlers of the main process, against a real local ws server: the test run, the live
// session (open, send, cursor read, close, pushed events), the collection guard, and that a query-placed
// token reaches the server but never comes back to the renderer.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { WebSocketServer } = require('ws');
const { CollectionAccess } = require('../collection-access');
const { WsSessions } = require('../ws-sessions');

const TOKEN = 'sw0rdf1sh/secret token';

let dir, collection, access, server, wss, base, upgradeUrl, upgradeHeaders, pushed, sessions;

async function start({ reject } = {}) {
    server = http.createServer();
    wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
        upgradeUrl = req.url;
        upgradeHeaders = req.headers;
        if (reject) {
            socket.write(`HTTP/1.1 ${reject} Nope\r\nConnection: close\r\n\r\n`);
            socket.destroy();
            return;
        }
        wss.handleUpgrade(req, socket, head, ws => {
            ws.send('{"hello":true}');
            ws.on('message', data => ws.send(`echo:${data}`));
        });
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `ws://127.0.0.1:${server.address().port}`;
}

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-sessions-'));
    collection = path.join(dir, 'collection');
    fs.mkdirSync(collection);
    fs.writeFileSync(path.join(collection, 'my.frcol'), '{}');
    access = new CollectionAccess(path.join(dir, 'trusted.json'));
    access.openCollection(path.join(collection, 'my.frcol'), { collectionGuid: 'g' });
    pushed = [];
    sessions = new WsSessions(access, { emit: (channel, payload) => pushed.push({ channel, payload }) });
});

afterEach(async () => {
    sessions.closeAll();
    for (const c of wss?.clients ?? []) c.terminate();
    wss?.close();
    if (server) await new Promise(r => server.close(() => r()));
    server = wss = undefined;
});

const bearerInQuery = { authentication: 'bearertoken', placement: 'token', bearerToken: { token: TOKEN } };
const expectOne = { count: 1, match: 'all', extras: 'ignore', timeout: 3000, settle: 0 };
const until = async (condition) => {
    for (let i = 0; i < 200 && !condition(); i++) await new Promise(r => setTimeout(r, 10));
    assert.ok(condition(), 'condition was not met in time');
};

test('runWsTest passes when the server sends the expected message', async () => {
    await start();

    const result = await sessions.runWsTest({
        root: collection, request: { url: `${base}/feed`, headers: { 'X-Test': 'yes' } }, expect: expectOne
    });

    assert.equal(result.passed, true);
    assert.deepEqual(result.messages.map(m => m.text), ['{"hello":true}']);
    assert.equal(upgradeHeaders['x-test'], 'yes');
});

test('runWsTest reports a failed test as a result, not a rejection', async () => {
    await start();

    const result = await sessions.runWsTest({
        root: collection, request: { url: base }, expect: { ...expectOne, count: 2, timeout: 200 }
    });

    assert.equal(result.passed, false);
    assert.ok(result.errors.length > 0);
});

test('a query-placed token reaches the server and never the renderer', async () => {
    await start();

    const result = await sessions.runWsTest({
        root: collection, request: { url: `${base}/feed`, authentication: bearerInQuery }, expect: expectOne
    });

    assert.equal(new URL(upgradeUrl, 'http://x').searchParams.get('token'), TOKEN);
    assert.ok(!JSON.stringify(result).includes(TOKEN));
    assert.ok(!JSON.stringify(result).includes(encodeURIComponent(TOKEN)));
});

test('a header-placed bearer token goes in the Authorization header', async () => {
    await start();

    await sessions.runWsTest({
        root: collection,
        request: { url: base, authentication: { authentication: 'bearertoken', placement: 'header', bearerToken: { token: 'abc' } } },
        expect: expectOne
    });

    assert.equal(upgradeHeaders.authorization, 'Bearer abc');
});

test('a rejected handshake is reported with its status and without the token', async () => {
    await start({ reject: 401 });

    const result = await sessions.runWsTest({
        root: collection, request: { url: base, authentication: bearerInQuery }, expect: expectOne
    });

    assert.equal(result.passed, false);
    assert.equal(result.connectStatus, 401);
    assert.ok(!JSON.stringify(result).includes(TOKEN));
});

test('every handler refuses a root that is not the open collection', async () => {
    await start();
    const other = path.join(dir, 'other');
    fs.mkdirSync(other);
    const request = { url: base };

    await assert.rejects(() => sessions.runWsTest({ root: other, request }), /not the open collection/);
    await assert.rejects(() => sessions.openSession({ root: other, request }), /not the open collection/);
    await assert.rejects(async () => sessions.sessionEvents({ root: other, sessionId: 'ws-1' }), /not the open collection/);
    await assert.rejects(async () => sessions.sendToSession({ root: other, sessionId: 'ws-1', text: 'x' }), /not the open collection/);
    await assert.rejects(async () => sessions.closeSession({ root: other, sessionId: 'ws-1' }), /not the open collection/);
});

test('a request with no url is refused', async () => {
    await assert.rejects(() => sessions.runWsTest({ root: collection, request: { url: '' } }), /no url/);
});

test('a session opens, sends, reads by cursor and closes', async () => {
    await start();

    const opened = await sessions.openSession({ root: collection, request: { url: base } });
    assert.match(opened.sessionId, /^ws-/);
    const { sessionId } = opened;

    await until(() => sessions.sessionEvents({ root: collection, sessionId }).events.length >= 1);
    const first = sessions.sessionEvents({ root: collection, sessionId });
    assert.equal(first.events[0].text, '{"hello":true}');
    assert.equal(first.closed, false);

    assert.deepEqual(sessions.sendToSession({ root: collection, sessionId, text: 'ping' }), { ok: true });
    await until(() => sessions.sessionEvents({ root: collection, sessionId, after: first.lastSeq }).events.length >= 1);
    const next = sessions.sessionEvents({ root: collection, sessionId, after: first.lastSeq });
    assert.deepEqual(next.events.map(e => e.text), ['echo:ping']);

    assert.deepEqual(sessions.closeSession({ root: collection, sessionId }), { closed: true });
    await assert.rejects(async () => sessions.sessionEvents({ root: collection, sessionId }), /not an open websocket session/);
});

test('session events are pushed to the renderer in order, once each', async () => {
    await start();
    const { sessionId } = await sessions.openSession({ root: collection, request: { url: base }, message: 'hi' });

    await until(() => pushed.flatMap(p => p.payload.events).length >= 2);
    sessions.closeSession({ root: collection, sessionId });

    const events = pushed.flatMap(p => p.payload.events);
    assert.ok(pushed.every(p => p.channel == 'wsSessionEvent' && p.payload.sessionId == sessionId));
    assert.deepEqual(events.map(e => e.seq), events.map((_, i) => i + 1));
    assert.deepEqual(events.slice(0, 2).map(e => e.text), ['{"hello":true}', 'echo:hi']);
    assert.equal(events.at(-1).kind, 'close');
});

test('a connect failure comes back as an error without the token', async () => {
    const result = await sessions.openSession({
        root: collection, request: { url: 'ws://127.0.0.1:1/feed', authentication: bearerInQuery }
    });

    assert.equal(result.sessionId, undefined);
    assert.ok(result.error.length > 0);
    assert.ok(!JSON.stringify(result).includes(TOKEN));
});

test('a handshake rejection on open carries the status', async () => {
    await start({ reject: 403 });

    const result = await sessions.openSession({ root: collection, request: { url: base } });

    assert.equal(result.status, 403);
});

test('a send on a closed session is an error result, and the session survives', async () => {
    await start();
    const { sessionId } = await sessions.openSession({ root: collection, request: { url: base } });
    for (const c of wss.clients) c.close(1000, 'bye');
    await until(() => sessions.sessionEvents({ root: collection, sessionId }).closed);

    const sent = sessions.sendToSession({ root: collection, sessionId, text: 'late' });

    assert.equal(sent.ok, false);
    assert.match(sent.error, /closed/);
    assert.equal(sessions.sessionEvents({ root: collection, sessionId }).events.at(-1).kind, 'close');
});

test('session events carry no token even when the server echoes it', async () => {
    await start();
    const { sessionId } = await sessions.openSession({ root: collection, request: { url: base, authentication: bearerInQuery } });
    sessions.sendToSession({ root: collection, sessionId, text: TOKEN });
    await until(() => sessions.sessionEvents({ root: collection, sessionId }).events.length >= 2);

    const read = sessions.sessionEvents({ root: collection, sessionId });

    assert.ok(!JSON.stringify(read).includes(TOKEN));
    assert.ok(!JSON.stringify(pushed).includes(TOKEN));
});

test('no more than ten sessions can be open', async () => {
    await start();
    for (let i = 0; i < 10; i++)
        assert.ok((await sessions.openSession({ root: collection, request: { url: base } })).sessionId);

    const eleventh = await sessions.openSession({ root: collection, request: { url: base } });

    assert.match(eleventh.error, /At most 10/);
});
