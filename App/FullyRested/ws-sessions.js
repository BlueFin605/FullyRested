// Websocket handlers of the main process: the renderer cannot hold Node sockets, so main runs the tests
// and owns the live sessions, and the renderer drives them over IPC. Core owns every rule (the test run,
// the capped feed, the cursor); this file is auth placement, the session table and the guard.
//
// Payload for runWsTest / openWsSession: { root, request: { url, headers, authentication }, message?, expect? },
// where request is the renderer's resolved, variable-substituted request (as testRest receives it) and
// root is the open collection's folder, checked by collection-access.js like every file handler's.
// The query-placed token is added here and never leaves: every string sent back is scrubbed of it.
const { LiveSession, applyAuthentication, fireTriggerRequest, normaliseExpect, normaliseTrigger, runWebSocketTest, withQueryToken } = require('@fullyrested/core');
const { WsTransport } = require('./ws-transport');

const MAX_SESSIONS = 10;

// The connect url and headers for a request: a bearer token placed in the query goes on the url, every
// other scheme is applied to the headers.
async function connectTarget(request) {
    if (typeof request?.url != 'string' || request.url == '')
        throw new Error('The websocket request has no url');
    const auth = request.authentication;
    const placement = auth?.placement ?? 'header';
    let headers = { ...request.headers };
    let connectUrl = request.url;
    let token;
    if (auth?.authentication == 'bearertoken' && placement != 'header') {
        token = auth.bearerToken.token;
        connectUrl = withQueryToken(request.url, placement, token);
    } else {
        headers = (await applyAuthentication({ method: 'GET', url: request.url, headers, body: undefined }, auth)).headers;
    }
    return { connectUrl, headers, token };
}

// Removes the url (with its token) and the token itself, raw and encoded, from text going to the renderer.
function scrubber(target, request) {
    return text => {
        let out = String(text ?? '');
        if (target.token) {
            out = out.split(target.connectUrl).join(request.url);
            for (const t of [target.token, encodeURIComponent(target.token)])
                if (t != '') out = out.split(t).join('***');
        }
        return out;
    };
}

class WsSessions {
    // newTransport: a fresh SocketTransport per socket. emit(channel, payload): pushes to the renderer.
    constructor(access, { newTransport = () => new WsTransport(), emit = () => {} } = {}) {
        this.access = access;
        this.newTransport = newTransport;
        this.emit = emit;
        this.sessions = new Map();
        this.nextId = 1;
    }

    guard(root) {
        // refuses a stale or non-open collection folder, like every file handler
        this.access.collectionPath(root, '');
    }

    // Runs one bounded test and returns its WebSocketTestResult. A failed test is a result, not a rejection.
    async runWsTest(payload) {
        this.guard(payload?.root);
        const trigger = this.triggerFirer(payload.trigger);
        const target = await connectTarget(payload.request);
        const scrub = scrubber(target, payload.request);
        let result;
        try {
            result = await runWebSocketTest(this.newTransport(), {
                url: target.connectUrl,
                headers: target.headers,
                message: payload.message,
                expect: normaliseExpect(payload.expect),
                trigger
            });
        } catch (error) {
            throw new Error(scrub(error.message));
        }
        return {
            ...result,
            ...(result.triggerCalls === undefined ? {} : {
                triggerCalls: result.triggerCalls.map(c => c.error === undefined ? c : { ...c, error: scrub(c.error) })
            }),
            errors: result.errors.map(scrub),
            messages: result.messages.map(m => ({ ...m, text: scrub(m.text) })),
            ...(result.closeReason === undefined ? {} : { closeReason: scrub(result.closeReason) })
        };
    }

    // A TriggerFirer around core's fireTriggerRequest for payload.trigger ({ request: <resolved ExecuteRestAction>,
    // repeat, interval, delay }), or undefined. Fired by main; its calls come back as triggerCalls.
    triggerFirer(trigger) {
        if (trigger == undefined) return undefined;
        if (trigger.request == undefined) throw new Error('The trigger has no request');
        const { request, ...timing } = trigger;
        const { repeat, interval, delay } = normaliseTrigger({ request: '', ...timing });
        // The runner passes an abort signal for its per-call timeout and for a call left pending at finish
        const fire = signal => fireTriggerRequest(request, signal);
        return { repeat, interval, delay, fire };
    }

    // Opens a live session and returns { sessionId } or { error }. Events are pushed on 'wsSessionEvent'
    // and can be read again by cursor with sessionEvents.
    async openSession(payload) {
        this.guard(payload?.root);
        if (this.sessions.size >= MAX_SESSIONS)
            return { error: `At most ${MAX_SESSIONS} websocket sessions can be open at once` };
        const target = await connectTarget(payload.request);
        const scrub = scrubber(target, payload.request);
        const transport = this.newTransport();
        let live;
        try {
            live = await LiveSession.open(transport, target.connectUrl, target.headers);
        } catch (error) {
            return { error: scrub(error.message), ...(error.status === undefined ? {} : { status: error.status }) };
        }

        const sessionId = `ws-${this.nextId++}`;
        const entry = { root: payload.root, live, pushed: 0, scrub };
        this.sessions.set(sessionId, entry);
        const push = () => this.push(sessionId, entry);
        transport.onMessage(push);
        transport.onClose(push);
        if (payload.message) live.send(payload.message);
        return { sessionId };
    }

    push(sessionId, entry) {
        const { events, lastSeq, closed } = entry.live.readEvents(entry.pushed);
        if (events.length == 0) return;
        entry.pushed = lastSeq;
        this.emit('wsSessionEvent', { sessionId, events: events.map(e => this.safe(entry, e)), lastSeq, closed });
    }

    safe(entry, event) {
        return event.kind == 'message'
            ? { ...event, text: entry.scrub(event.text) }
            : { ...event, reason: entry.scrub(event.reason) };
    }

    entryFor(payload) {
        this.guard(payload?.root);
        const entry = this.sessions.get(payload.sessionId);
        // a session belongs to the collection that opened it
        if (entry == undefined || entry.root != payload.root)
            throw new Error(`${payload.sessionId} is not an open websocket session`);
        return entry;
    }

    // Events after the cursor `after` (default: all held): { events, lastSeq, closed }
    sessionEvents(payload) {
        const entry = this.entryFor(payload);
        const read = entry.live.readEvents(payload.after ?? 0);
        return { ...read, events: read.events.map(e => this.safe(entry, e)) };
    }

    // { ok } or { ok: false, error }; never throws for a closed socket
    sendToSession(payload) {
        const entry = this.entryFor(payload);
        if (typeof payload.text != 'string')
            return { ok: false, error: 'There is no message to send' };
        const result = entry.live.send(payload.text);
        return result.ok ? result : { ok: false, error: entry.scrub(result.error) };
    }

    closeSession(payload) {
        const entry = this.entryFor(payload);
        entry.live.close();
        this.push(payload.sessionId, entry);
        this.sessions.delete(payload.sessionId);
        return { closed: true };
    }

    closeAll() {
        for (const entry of this.sessions.values()) entry.live.close();
        this.sessions.clear();
    }
}

module.exports = { WsSessions, connectTarget };
