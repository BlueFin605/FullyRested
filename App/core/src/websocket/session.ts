import { SocketTransport } from './socket';

/** Most events a session keeps; the oldest are dropped past this. */
export const MAX_SESSION_EVENTS = 1000;

export interface SessionMessageEvent {
  seq: number;
  /** Epoch milliseconds when the event was recorded. */
  at: number;
  kind: 'message';
  text: string;
}

export interface SessionCloseEvent {
  seq: number;
  at: number;
  kind: 'close';
  code: number;
  reason: string;
}

export type SessionEvent = SessionMessageEvent | SessionCloseEvent;

export interface SessionReadResult {
  events: SessionEvent[];
  /** Pass as `afterSeq` on the next read. Equals the last sequence number issued (0 when none). */
  lastSeq: number;
  closed: boolean;
}

export interface SessionSendResult {
  ok: boolean;
  error?: string;
}

/**
 * A live websocket session: received messages are kept in an in-memory feed (never written
 * to disk), capped at MAX_SESSION_EVENTS, and read by cursor.
 */
export class LiveSession {
  private readonly feed: SessionEvent[] = [];
  private nextSeq = 1;
  private isClosed = false;

  private constructor(private readonly transport: SocketTransport, private readonly now: () => number) {}

  /** Connects the transport and returns an open session. Rejects with the transport's connect error. */
  static async open(
    transport: SocketTransport,
    url: string,
    headers: { [header: string]: string } = {},
    now: () => number = Date.now,
  ): Promise<LiveSession> {
    const session = new LiveSession(transport, now);
    transport.onMessage(text => session.append({ kind: 'message', text }));
    transport.onClose((code, reason) => session.recordClose(code, reason));
    transport.onError(() => { /* errors surface as a close; nothing to record separately */ });
    await transport.connect(url, headers);
    return session;
  }

  get closed(): boolean { return this.isClosed; }

  /** Events with seq greater than afterSeq (default: all held). Events dropped by the cap are gone. */
  readEvents(afterSeq = 0): SessionReadResult {
    return {
      events: this.feed.filter(e => e.seq > afterSeq),
      lastSeq: this.nextSeq - 1,
      closed: this.isClosed,
    };
  }

  /** Sends a text frame. Returns an error result on a closed session; never throws. */
  send(text: string): SessionSendResult {
    if (this.isClosed) return { ok: false, error: 'Session is closed' };
    try {
      this.transport.send(text);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  /** Closes the session and records the close code and reason in the feed. Idempotent. */
  close(code = 1000, reason = ''): void {
    if (this.isClosed) return;
    try { this.transport.close(code, reason); } catch { /* record the close regardless */ }
    this.recordClose(code, reason);
  }

  private recordClose(code: number, reason: string): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.append({ kind: 'close', code, reason });
  }

  private append(event: { kind: 'message'; text: string } | { kind: 'close'; code: number; reason: string }): void {
    this.feed.push({ ...event, seq: this.nextSeq++, at: this.now() } as SessionEvent);
    if (this.feed.length > MAX_SESSION_EVENTS) this.feed.splice(0, this.feed.length - MAX_SESSION_EVENTS);
  }
}
