import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import type { SessionEvent } from '@fullyrested/core';
import { CollectionTreeService, HttpRequestChoice } from '../../services/collection-tree/collection-tree.service';
import { ExecuteRestCallsService } from '../../services/execute-rest-calls/execute-rest-calls.service';
import { WsConnectRequest, WsSessionPush, WsSessionService } from '../../services/ws-session/ws-session.service';

// The renderer keeps the same cap as the session's own feed
export const FEED_CAP = 1000;

export const isWebSocketUrl = (url: string): boolean => /^wss?:\/\/\S+/i.test(url.trim());

type CloseEvent = Extract<SessionEvent, { kind: 'close' }>;

// A live websocket session: connects through the main process, shows the feed (sequence and time per
// event), sends text frames and closes. New events arrive by push; a gap is filled by a cursor read.
@Component({
  selector: 'app-live-session',
  templateUrl: './live-session.component.html',
  styleUrls: ['./live-session.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class LiveSessionComponent implements OnChanges, OnDestroy {
  // A resolved websocket request to connect on. Without one the panel asks for a typed ws:// or wss:// URL.
  @Input() request: WsConnectRequest | undefined;
  @Input() message: string | undefined;
  // The environment a fired request is resolved with
  @Input() environmentId: string | undefined;
  // Raised when the user hides the panel
  @Output() dismiss = new EventEmitter<void>();

  typedUrl = '';
  draft = '';
  events: SessionEvent[] = [];
  sessionId: string | undefined;
  connecting = false;
  closed = false;
  error: string | undefined;
  sendError: string | undefined;
  lastSeq = 0;

  firePath = '';
  fireRun = '';
  firing = false;
  fireOutcome: string | undefined;
  fireError: string | undefined;

  private readonly sessions = inject(WsSessionService);
  private readonly trees = inject(CollectionTreeService);
  private readonly executor = inject(ExecuteRestCallsService);
  private subscription: Subscription | undefined;
  private filling = false;
  // bumped by every connect, so a late answer for an abandoned connect is ignored
  private token = 0;

  get live(): boolean {
    return this.sessionId != undefined && !this.closed;
  }

  get closeEvent(): CloseEvent | undefined {
    return this.events.find((e): e is CloseEvent => e.kind == 'close');
  }

  get canConnect(): boolean {
    return !this.connecting && isWebSocketUrl(this.typedUrl);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['request'] && this.request != undefined) {
      this.typedUrl = this.request.url;
      void this.connect();
    }
  }

  ngOnDestroy(): void {
    this.token++;
    this.subscription?.unsubscribe();
    // a session belongs to its panel: leave none behind in the main process
    if (this.sessionId != undefined && !this.closed) void this.sessions.close(this.sessionId);
  }

  // Opens a session for the request, or for the typed URL when there is no request
  async connect(): Promise<void> {
    if (this.connecting) return;
    const request = this.request ?? { url: this.typedUrl.trim(), headers: {} };
    if (!isWebSocketUrl(request.url)) { this.error = 'Enter a ws:// or wss:// URL'; return; }
    const mine = ++this.token;
    this.reset();
    this.connecting = true;
    const result = await this.sessions.open(request, this.message);
    if (mine != this.token) {
      if ('sessionId' in result) void this.sessions.close(result.sessionId);
      return;
    }
    this.connecting = false;
    if ('error' in result) {
      this.error = result.status == undefined ? result.error : `${result.error} (status ${result.status})`;
      return;
    }
    this.sessionId = result.sessionId;
    this.subscription = this.sessions.events$(result.sessionId).subscribe(push => this.onPush(push));
    // anything pushed before the subscription existed is read by cursor
    await this.fill();
  }

  private reset() {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    this.sessionId = undefined;
    this.events = [];
    this.lastSeq = 0;
    this.closed = false;
    this.error = undefined;
    this.sendError = undefined;
  }

  private onPush(push: WsSessionPush) {
    const first = push.events[0];
    if (first != undefined && first.seq > this.lastSeq + 1) {
      // a push was missed: read what is between by cursor, which also covers this one
      void this.fill();
      return;
    }
    this.take(push.events, push.closed);
  }

  private take(incoming: SessionEvent[], closed: boolean) {
    const fresh = incoming.filter(e => e.seq > this.lastSeq);
    if (fresh.length > 0) {
      this.events = [...this.events, ...fresh].slice(-FEED_CAP);
      this.lastSeq = fresh[fresh.length - 1].seq;
    }
    if (closed) this.closed = true;
  }

  // Reads the events after the cursor
  private async fill(): Promise<void> {
    if (this.sessionId == undefined || this.filling) return;
    this.filling = true;
    const id = this.sessionId;
    try {
      const read = await this.sessions.read(id, this.lastSeq);
      if (id == this.sessionId) this.take(read.events, read.closed);
    } catch {
      // main no longer holds the session: it ended
      if (id == this.sessionId) this.closed = true;
    } finally {
      this.filling = false;
    }
  }

  async send(): Promise<void> {
    if (!this.live || this.draft == '') return;
    this.sendError = undefined;
    const result = await this.sessions.send(this.sessionId!, this.draft);
    if (result.ok) this.draft = '';
    else this.sendError = result.error ?? 'The message could not be sent';
  }

  // The http requests that can be fired into the open session
  get fireChoices(): HttpRequestChoice[] {
    return this.trees.httpRequests();
  }

  get fireRuns(): HttpRequestChoice['runs'] {
    return this.fireChoices.find(c => c.path == this.firePath)?.runs ?? [];
  }

  // Sends the chosen http request once through the normal send path while the session stays open
  async fire(): Promise<void> {
    if (!this.live || this.firePath == '' || this.firing) return;
    this.firing = true;
    this.fireError = undefined;
    this.fireOutcome = undefined;
    try {
      const result = await this.executor.fireRequest(this.firePath, this.fireRun || undefined, this.environmentId);
      this.fireOutcome = `${result.status} ${result.statusText ?? ''}`.trim() + (result.durationMs == undefined ? '' : ` in ${result.durationMs} ms`);
    } catch (e) {
      this.fireError = (e as Error)?.message ?? String(e);
    } finally {
      this.firing = false;
    }
  }

  async close(): Promise<void> {
    if (!this.live) return;
    await this.sessions.close(this.sessionId!);
    // main pushes the close event and then forgets the session; a cursor read would be refused, so
    // the push is the only source and the panel is closed either way
    this.closed = true;
  }

  time(at: number): string {
    const d = new Date(at);
    const p = (n: number, w = 2) => String(n).padStart(w, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
  }

  trackSeq(_: number, e: SessionEvent) {
    return e.seq;
  }
}
