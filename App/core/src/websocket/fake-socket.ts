import { SocketConnectError, SocketTransport } from './socket';

/** In-memory SocketTransport that tests drive: push messages, close with a code, fail a connect. */
export class FakeSocket implements SocketTransport {
  /** Set before connect() to make it reject. */
  failConnectWith?: SocketConnectError;
  connectedUrl?: string;
  connectedHeaders?: { [header: string]: string };
  /** Everything the code under test sent. */
  readonly sent: string[] = [];
  closeRequest?: { code?: number; reason?: string };
  isOpen = false;

  private messageHandlers: ((text: string) => void)[] = [];
  private closeHandlers: ((code: number, reason: string) => void)[] = [];
  private errorHandlers: ((error: Error) => void)[] = [];

  async connect(url: string, headers: { [header: string]: string }): Promise<void> {
    this.connectedUrl = url;
    this.connectedHeaders = { ...headers };
    if (this.failConnectWith) throw this.failConnectWith;
    this.isOpen = true;
  }

  send(text: string): void {
    if (!this.isOpen) throw new Error('Socket is not open');
    this.sent.push(text);
  }

  close(code?: number, reason?: string): void {
    this.closeRequest = { code, reason };
    this.serverClose(code ?? 1005, reason ?? '');
  }

  onMessage(handler: (text: string) => void): void { this.messageHandlers.push(handler); }
  onClose(handler: (code: number, reason: string) => void): void { this.closeHandlers.push(handler); }
  onError(handler: (error: Error) => void): void { this.errorHandlers.push(handler); }

  /** Test driver: the server sends a message. Ignored once closed. */
  push(text: string): void {
    if (!this.isOpen) return;
    for (const h of this.messageHandlers) h(text);
  }

  /** Test driver: the server closes the socket. */
  serverClose(code: number, reason = ''): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    for (const h of this.closeHandlers) h(code, reason);
  }

  /** Test driver: the socket reports an error. */
  raiseError(error: Error): void {
    for (const h of this.errorHandlers) h(error);
  }
}
