// FullyRested websocket-trigger smoke server. Uses the ws package the CLI already depends on.
// HTTP + WS on http://localhost:<PORT> (default 8787, override with the PORT env var)
//   WS   /room/<id>      on each client frame, replies {"urlRoom":<id>,"msgRoom":<frame.room>}
//   POST /fire[?slow=ms] body {"id":...}: 409 if that id was seen before, else 200 and
//                        pushes {"fired":<id>} to every socket. ?slow delays the reply.
//   POST /flaky          answers 500, 500, 401, 500, 500, 401 ... in turn
//   GET  /log            every /fire and /flaky call with ms since the first call and the gap
//   POST /reset          clears the log, seen ids and the flaky counter
import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 8787);

let seen = new Set(), log = [], flaky = 0, t0 = 0;
const sockets = new Set();
const note = (path, id, status) => {
  const now = Date.now(); if (!log.length) t0 = now;
  const at = now - t0, prev = log.at(-1);
  log.push({ path, id, status, at, gap: prev ? at - prev.at : 0 });
  console.log(`${String(at).padStart(6)}ms  ${path}  ${status}  ${id ?? ''}`);
};
const body = req => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });
const send = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method == 'GET' && url.pathname == '/log') return send(res, 200, log);
  if (req.method == 'POST' && url.pathname == '/reset') { seen = new Set(); log = []; flaky = 0; return send(res, 200, { ok: true }); }
  if (req.method == 'POST' && url.pathname == '/flaky') {
    const status = [500, 500, 401][flaky++ % 3]; note('/flaky', null, status); return send(res, status, { status });
  }
  if (req.method == 'POST' && url.pathname == '/fire') {
    let id; try { id = JSON.parse(await body(req)).id; } catch { return send(res, 400, { error: 'body must be {"id":...}' }); }
    const dup = seen.has(id); seen.add(id);
    const status = dup ? 409 : 200; note('/fire', id, status);
    if (!dup) for (const s of sockets) s.send(JSON.stringify({ fired: id }));
    const slow = Number(url.searchParams.get('slow') ?? 0);
    return setTimeout(() => send(res, status, { id, duplicate: dup }), slow);
  }
  send(res, 404, { error: 'not found' });
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws, req) => {
  const urlRoom = decodeURIComponent((req.url.match(/^\/room\/([^?]*)/) ?? [])[1] ?? '');
  sockets.add(ws); ws.on('close', () => sockets.delete(ws));
  ws.on('message', d => {
    let msgRoom; try { msgRoom = JSON.parse(d.toString()).room; } catch { }
    ws.send(JSON.stringify({ urlRoom, msgRoom }));
  });
});
server.listen(PORT, () => console.log(`smoke server on http://localhost:${PORT}  (ws://localhost:${PORT}/room/<id>)`));
