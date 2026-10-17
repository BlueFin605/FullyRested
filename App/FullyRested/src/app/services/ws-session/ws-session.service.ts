import { Injectable, NgZone, inject } from '@angular/core';
import { Observable, Subject, filter } from 'rxjs';
import { RequestNode, RunNode, substituteDeep } from '@fullyrested/core';
import type { SessionEvent } from '@fullyrested/core';
import { CollectionTreeService } from '../collection-tree/collection-tree.service';

// What the main process pushes on wsSessionEvent, and returns from a cursor read
export interface WsSessionPush { sessionId: string; events: SessionEvent[]; lastSeq: number; closed: boolean; }
export interface WsSessionRead { events: SessionEvent[]; lastSeq: number; closed: boolean; }

// The resolved connection the main process opens. A bearer token is never resolved here: main adds it.
export interface WsConnectRequest { url: string; headers: { [header: string]: string }; authentication?: unknown; }
export type WsOpenResult = { sessionId: string } | { error: string; status?: number };
export type WsSendResult = { ok: boolean; error?: string };

// Wraps the live websocket IPC. The renderer holds no sockets: main owns them, and this only calls
// openWsSession / wsSessionEvents / sendWsSession / closeWsSession and listens for wsSessionEvent.
@Injectable({ providedIn: 'root' })
export class WsSessionService {
  private readonly trees = inject(CollectionTreeService);
  private readonly zone = inject(NgZone);
  private readonly pushes = new Subject<WsSessionPush>();
  private listening = false;

  private get ipc(): any {
    return (<any>window).ipc;
  }

  available(): boolean {
    return this.ipc != undefined;
  }

  // The open collection's folder, which main checks on every session call
  get root(): string | undefined {
    return this.trees.openCollection?.path;
  }

  // Pushed events of one session. The preload offers no way to stop listening, so the channel is
  // subscribed once for the whole app and fanned out here.
  events$(sessionId: string): Observable<WsSessionPush> {
    if (!this.listening && this.ipc != undefined) {
      this.listening = true;
      this.ipc.receive('wsSessionEvent', (push: WsSessionPush) => this.zone.run(() => this.pushes.next(push)));
    }
    return this.pushes.pipe(filter(p => p.sessionId == sessionId));
  }

  // The request to connect for a websocket node: variables and the selected environment substituted
  requestFor(node: RequestNode | RunNode, environmentId: string | undefined): { request: WsConnectRequest; message: string } {
    const action = (node instanceof RunNode ? node.request : node).action;
    const resolved = node.resolve({ environmentId }).replaceVariables();
    return {
      request: { url: resolved.url, headers: resolved.headers, authentication: resolved.authentication },
      message: substituteDeep(action.message ?? '', resolved.variables, resolved.secrets)
    };
  }

  async open(request: WsConnectRequest, message?: string): Promise<WsOpenResult> {
    if (this.ipc == undefined) return { error: 'Live websocket sessions can only be opened in the desktop app' };
    try {
      return await this.ipc.invoke('openWsSession', { root: this.root, request, message: message || undefined });
    } catch (e) {
      return { error: (e as Error)?.message ?? String(e) };
    }
  }

  async read(sessionId: string, after: number): Promise<WsSessionRead> {
    return this.ipc.invoke('wsSessionEvents', { root: this.root, sessionId, after });
  }

  async send(sessionId: string, text: string): Promise<WsSendResult> {
    try {
      return await this.ipc.invoke('sendWsSession', { root: this.root, sessionId, text });
    } catch (e) {
      return { ok: false, error: (e as Error)?.message ?? String(e) };
    }
  }

  // Never rejects: a session main no longer holds is already closed
  async close(sessionId: string): Promise<void> {
    try {
      await this.ipc?.invoke('closeWsSession', { root: this.root, sessionId });
    } catch { /* already closed */ }
  }
}
