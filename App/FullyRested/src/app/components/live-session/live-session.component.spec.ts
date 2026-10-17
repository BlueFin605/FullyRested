import { CUSTOM_ELEMENTS_SCHEMA, provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import type { SessionEvent } from '@fullyrested/core';
import { WsSessionPush, WsSessionService } from '../../services/ws-session/ws-session.service';
import { LiveSessionComponent, isWebSocketUrl } from './live-session.component';

const message = (seq: number, text: string): SessionEvent => ({ seq, at: Date.UTC(2026, 0, 1, 12, 0, seq), kind: 'message', text });
const closeEvent = (seq: number, code: number, reason: string): SessionEvent => ({ seq, at: Date.now(), kind: 'close', code, reason });

describe('LiveSessionComponent', () => {
  let push$: Subject<WsSessionPush>;
  let service: { open: jasmine.Spy; read: jasmine.Spy; send: jasmine.Spy; close: jasmine.Spy; events$: jasmine.Spy };

  function create(request: any = { url: 'ws://localhost:9/x', headers: {} }, none = false) {
    push$ = new Subject<WsSessionPush>();
    service = {
      open: jasmine.createSpy('open').and.resolveTo({ sessionId: 'ws-1' }),
      read: jasmine.createSpy('read').and.resolveTo({ events: [], lastSeq: 0, closed: false }),
      send: jasmine.createSpy('send').and.resolveTo({ ok: true }),
      close: jasmine.createSpy('close').and.resolveTo(undefined),
      events$: jasmine.createSpy('events$').and.callFake(() => push$.asObservable())
    };
    TestBed.configureTestingModule({
      declarations: [LiveSessionComponent],
      imports: [FormsModule],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [provideZoneChangeDetection(), { provide: WsSessionService, useValue: service }]
    });
    const fixture = TestBed.createComponent(LiveSessionComponent);
    if (!none) fixture.componentRef.setInput('request', request);
    return fixture;
  }

  async function settle(f: { detectChanges(): void }) {
    f.detectChanges();
    await new Promise(r => setTimeout(r));
    f.detectChanges();
  }

  const el = (f: any) => f.nativeElement as HTMLElement;

  it('connects on the request it is given and lists nothing yet', async () => {
    const f = create();
    await settle(f);
    expect(service.open).toHaveBeenCalledOnceWith({ url: 'ws://localhost:9/x', headers: {} }, undefined);
    expect(f.componentInstance.live).toBeTrue();
    expect(el(f).textContent).toContain('Waiting for messages');
  });

  it('shows each pushed message with its sequence number and time', async () => {
    const f = create();
    await settle(f);
    push$.next({ sessionId: 'ws-1', events: [message(1, 'hello'), message(2, 'world')], lastSeq: 2, closed: false });
    await settle(f);
    const rows = el(f).querySelectorAll('.event');
    expect(rows.length).toBe(2);
    expect(rows[0].querySelector('.seq')!.textContent).toBe('#1');
    expect(rows[0].querySelector('.at')!.textContent).toMatch(/^\d\d:\d\d:\d\d\.\d{3}$/);
    expect(rows[1].querySelector('.text')!.textContent).toBe('world');
  });

  it('fills a gap by reading the events after its cursor', async () => {
    const f = create();
    await settle(f);
    push$.next({ sessionId: 'ws-1', events: [message(1, 'a')], lastSeq: 1, closed: false });
    service.read.and.resolveTo({ events: [message(2, 'b'), message(3, 'c')], lastSeq: 3, closed: false });
    push$.next({ sessionId: 'ws-1', events: [message(3, 'c')], lastSeq: 3, closed: false });
    await settle(f);
    expect(service.read).toHaveBeenCalledWith('ws-1', 1);
    expect(f.componentInstance.events.map(e => e.seq)).toEqual([1, 2, 3]);
  });

  it('ignores an event it already has', async () => {
    const f = create();
    await settle(f);
    push$.next({ sessionId: 'ws-1', events: [message(1, 'a')], lastSeq: 1, closed: false });
    push$.next({ sessionId: 'ws-1', events: [message(1, 'a')], lastSeq: 1, closed: false });
    await settle(f);
    expect(f.componentInstance.events.length).toBe(1);
  });

  it('sends the draft as a text frame and clears it', async () => {
    const f = create();
    await settle(f);
    f.componentInstance.draft = 'ping';
    await f.componentInstance.send();
    expect(service.send).toHaveBeenCalledOnceWith('ws-1', 'ping');
    expect(f.componentInstance.draft).toBe('');
  });

  it('keeps the draft and shows the error when a send is refused', async () => {
    const f = create();
    await settle(f);
    service.send.and.resolveTo({ ok: false, error: 'Session is closed' });
    f.componentInstance.draft = 'ping';
    await f.componentInstance.send();
    await settle(f);
    expect(f.componentInstance.draft).toBe('ping');
    expect(el(f).textContent).toContain('Session is closed');
  });

  it('closes the session from the close button', async () => {
    const f = create();
    await settle(f);
    (el(f).querySelector('.close-session') as HTMLButtonElement).click();
    await settle(f);
    expect(service.close).toHaveBeenCalledOnceWith('ws-1');
    expect(f.componentInstance.live).toBeFalse();
  });

  it('shows the closed state with the close code and reason from the feed', async () => {
    const f = create();
    await settle(f);
    push$.next({ sessionId: 'ws-1', events: [message(1, 'bye'), closeEvent(2, 1001, 'going away')], lastSeq: 2, closed: true });
    await settle(f);
    expect(f.componentInstance.closed).toBeTrue();
    expect(el(f).querySelector('.closed-note')!.textContent).toContain('code 1001: going away');
    expect(el(f).querySelector('.close-session')).toBeNull();
    expect((el(f).querySelector('.send') as HTMLButtonElement).disabled).toBeTrue();
    expect((el(f).querySelector('.draft') as HTMLInputElement).disabled).toBeTrue();
  });

  it('shows a connect failure instead of a feed', async () => {
    const f = create();
    service.open.and.resolveTo({ error: 'Unexpected server response: 401', status: 401 });
    await settle(f);
    expect(f.componentInstance.sessionId).toBeUndefined();
    expect(el(f).textContent).toContain('Unexpected server response: 401 (status 401)');
  });

  it('asks for a ws:// or wss:// url when opened without a request, and connects on the typed one', async () => {
    const f = create(undefined, true);
    await settle(f);
    expect(service.open).not.toHaveBeenCalled();
    f.componentInstance.typedUrl = 'http://nope';
    await f.componentInstance.connect();
    expect(service.open).not.toHaveBeenCalled();
    expect(f.componentInstance.error).toContain('ws://');
    f.componentInstance.typedUrl = ' wss://host.example/feed ';
    await f.componentInstance.connect();
    expect(service.open).toHaveBeenCalledOnceWith({ url: 'wss://host.example/feed', headers: {} }, undefined);
  });

  it('closes a still-open session when the panel is destroyed', async () => {
    const f = create();
    await settle(f);
    f.destroy();
    expect(service.close).toHaveBeenCalledOnceWith('ws-1');
  });

  it('recognises ws and wss urls only', () => {
    expect(isWebSocketUrl('ws://a')).toBeTrue();
    expect(isWebSocketUrl('WSS://a/b')).toBeTrue();
    expect(isWebSocketUrl('https://a')).toBeFalse();
    expect(isWebSocketUrl('ws://')).toBeFalse();
  });
});
