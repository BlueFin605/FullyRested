import WebSocket from 'ws';
import { SocketConnectError, SocketTransport } from '@fullyrested/core';

/**
 * `ws`-backed SocketTransport for the CLI host. Core stays free of node imports, so the
 * real socket lives here. The url already carries any query-string token (built by core's
 * withQueryToken); nothing in this file logs or echoes the url.
 */
export class WsTransport implements SocketTransport {
  private socket?: WebSocket;
  private messageHandlers: ((text: string) => void)[] = [];
  private closeHandlers: ((code: number, reason: string) => void)[] = [];
  private errorHandlers: ((error: Error) => void)[] = [];

  connect(url: string, headers: { [header: string]: string }): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let opened = false;
      let socket: WebSocket;
      try {
        socket = new WebSocket(url, { headers });
      } catch (e) {
        reject(new SocketConnectError(e instanceof Error ? e.message : 'Invalid websocket URL'));
        return;
      }
      this.socket = socket;

      socket.on('open', () => {
        opened = true;
        resolve();
      });
      // A rejected handshake (401, 403, ...) arrives as a normal HTTP response.
      socket.on('unexpected-response', (req, res) => {
        const status = res.statusCode;
        res.resume();
        req.destroy();
        reject(new SocketConnectError(`Handshake rejected with HTTP ${status}`, status));
      });
      socket.on('error', (err: Error) => {
        if (!opened) {
          reject(new SocketConnectError(err.message));
          return;
        }
        for (const h of this.errorHandlers) h(err);
      });
      socket.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
        const text = isBinary ? Buffer.from(data as Buffer).toString('utf8') : data.toString();
        for (const h of this.messageHandlers) h(text);
      });
      socket.on('close', (code: number, reason: Buffer) => {
        if (!opened) return;
        const text = reason.toString('utf8');
        for (const h of this.closeHandlers) h(code, text);
      });
    });
  }

  send(text: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error('Socket is not open');
    this.socket.send(text);
  }

  close(code?: number, reason?: string): void {
    this.socket?.close(code, reason);
  }

  onMessage(handler: (text: string) => void): void { this.messageHandlers.push(handler); }
  onClose(handler: (code: number, reason: string) => void): void { this.closeHandlers.push(handler); }
  onError(handler: (error: Error) => void): void { this.errorHandlers.push(handler); }
}
