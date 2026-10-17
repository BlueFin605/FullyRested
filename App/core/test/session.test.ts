import { describe, it, expect } from 'vitest';
import { FakeSocket, LiveSession, MAX_SESSION_EVENTS, SocketConnectError } from '../src/websocket';

const open = async () => { const s = new FakeSocket(); const session = await LiveSession.open(s, 'wss://x', { a: 'b' }); return { s, session }; };

describe('LiveSession', () => {
  it('connects with url and headers and records messages with seq and timestamp', async () => {
    const s = new FakeSocket();
    const session = await LiveSession.open(s, 'wss://x', { a: 'b' }, () => 42);
    expect(s.connectedUrl).toBe('wss://x');
    expect(s.connectedHeaders).toEqual({ a: 'b' });
    s.push('one'); s.push('two');
    expect(session.readEvents().events).toEqual([
      { seq: 1, at: 42, kind: 'message', text: 'one' },
      { seq: 2, at: 42, kind: 'message', text: 'two' },
    ]);
  });

  it('rejects open when the connect fails', async () => {
    const s = new FakeSocket();
    s.failConnectWith = new SocketConnectError('nope', 401);
    await expect(LiveSession.open(s, 'wss://x')).rejects.toThrow('nope');
  });

  it('drops the oldest events past the cap', async () => {
    const { s, session } = await open();
    for (let i = 1; i <= MAX_SESSION_EVENTS + 5; i++) s.push('m' + i);
    const { events, lastSeq } = session.readEvents();
    expect(events).toHaveLength(MAX_SESSION_EVENTS);
    expect(events[0].seq).toBe(6);
    expect(events[events.length - 1].seq).toBe(MAX_SESSION_EVENTS + 5);
    expect(lastSeq).toBe(MAX_SESSION_EVENTS + 5);
  });

  it('reads by cursor without missing or repeating events', async () => {
    const { s, session } = await open();
    s.push('a'); s.push('b');
    const first = session.readEvents(0);
    expect(first.events.map(e => e.seq)).toEqual([1, 2]);
    expect(session.readEvents(first.lastSeq).events).toEqual([]);
    s.push('c');
    const next = session.readEvents(first.lastSeq);
    expect(next.events.map(e => (e as { text: string }).text)).toEqual(['c']);
    expect(next.lastSeq).toBe(3);
  });

  it('sends on an open session', async () => {
    const { s, session } = await open();
    expect(session.send('hi')).toEqual({ ok: true });
    expect(s.sent).toEqual(['hi']);
  });

  it('send after close returns an error and does not throw', async () => {
    const { session } = await open();
    session.close();
    const r = session.send('late');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/closed/i);
  });

  it('send after a server close returns an error', async () => {
    const { s, session } = await open();
    s.serverClose(1001, 'bye');
    expect(session.send('x').ok).toBe(false);
  });

  it('close records the code and reason in the feed', async () => {
    const { s, session } = await open();
    s.push('a');
    session.close(4000, 'done');
    expect(s.closeRequest).toEqual({ code: 4000, reason: 'done' });
    const r = session.readEvents(1);
    expect(r.closed).toBe(true);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ seq: 2, kind: 'close', code: 4000, reason: 'done' });
  });

  it('records a server close once, and ignores a later close()', async () => {
    const { s, session } = await open();
    s.serverClose(1001, 'going away');
    session.close(1000, 'again');
    const closes = session.readEvents().events.filter(e => e.kind === 'close');
    expect(closes).toMatchObject([{ code: 1001, reason: 'going away' }]);
  });
});
