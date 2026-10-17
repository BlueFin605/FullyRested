import { TestBed } from '@angular/core/testing';
import { CollectionTreeService } from '../collection-tree/collection-tree.service';
import { WsSessionPush, WsSessionService } from './ws-session.service';

describe('WsSessionService', () => {
  let service: WsSessionService;
  let invoke: jasmine.Spy;
  let handlers: { [channel: string]: (payload: any) => void };

  beforeEach(() => {
    handlers = {};
    invoke = jasmine.createSpy('invoke').and.resolveTo({});
    (window as any).ipc = { invoke, receive: (channel: string, fn: any) => (handlers[channel] = fn) };
    TestBed.configureTestingModule({
      providers: [{ provide: CollectionTreeService, useValue: { openCollection: { path: '/c' } } }]
    });
    service = TestBed.inject(WsSessionService);
  });

  afterEach(() => delete (window as any).ipc);

  it('opens a session with the collection root and the request, and drops an empty message', async () => {
    invoke.and.resolveTo({ sessionId: 'ws-1' });
    const request = { url: 'ws://h/x', headers: { a: 'b' } };
    expect(await service.open(request, '')).toEqual({ sessionId: 'ws-1' });
    expect(invoke).toHaveBeenCalledOnceWith('openWsSession', { root: '/c', request, message: undefined });
  });

  it('turns a rejected open into an error result', async () => {
    invoke.and.rejectWith(new Error('not open'));
    expect(await service.open({ url: 'ws://h', headers: {} })).toEqual({ error: 'not open' });
  });

  it('answers an open outside the desktop app with an error', async () => {
    delete (window as any).ipc;
    const result = await service.open({ url: 'ws://h', headers: {} });
    expect('error' in result).toBeTrue();
  });

  it('reads by cursor, sends and closes with the session id and root', async () => {
    await service.read('ws-1', 4);
    await service.send('ws-1', 'hi');
    await service.close('ws-1');
    expect(invoke.calls.allArgs()).toEqual([
      ['wsSessionEvents', { root: '/c', sessionId: 'ws-1', after: 4 }],
      ['sendWsSession', { root: '/c', sessionId: 'ws-1', text: 'hi' }],
      ['closeWsSession', { root: '/c', sessionId: 'ws-1' }]
    ]);
  });

  it('never rejects on send or close', async () => {
    invoke.and.rejectWith(new Error('gone'));
    expect(await service.send('ws-1', 'x')).toEqual({ ok: false, error: 'gone' });
    await expectAsync(service.close('ws-1')).toBeResolved();
  });

  it('delivers pushed events only to the session they belong to, over one receive registration', () => {
    const receive = spyOn((window as any).ipc, 'receive').and.callThrough();
    const one: WsSessionPush[] = [];
    const two: WsSessionPush[] = [];
    service.events$('ws-1').subscribe(p => one.push(p));
    service.events$('ws-2').subscribe(p => two.push(p));
    handlers['wsSessionEvent']({ sessionId: 'ws-2', events: [], lastSeq: 0, closed: false });
    handlers['wsSessionEvent']({ sessionId: 'ws-1', events: [], lastSeq: 0, closed: true });
    expect(receive).toHaveBeenCalledTimes(1);
    expect(one.length).toBe(1);
    expect(two.length).toBe(1);
  });
});
