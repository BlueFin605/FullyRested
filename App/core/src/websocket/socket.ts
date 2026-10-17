/**
 * The transport the host gives core for websockets. Core never opens a socket itself,
 * so it stays free of `node:` imports; the CLI and Electron main supply a `ws`-backed
 * implementation and tests use FakeSocket.
 */
export interface SocketTransport {
  /** Resolves once the handshake completes. Rejects with a SocketConnectError on failure. */
  connect(url: string, headers: { [header: string]: string }): Promise<void>;
  /** Throws when the socket is not open. */
  send(text: string): void;
  /** Starts a close handshake; onClose fires when it finishes. */
  close(code?: number, reason?: string): void;
  onMessage(handler: (text: string) => void): void;
  onClose(handler: (code: number, reason: string) => void): void;
  onError(handler: (error: Error) => void): void;
}

/** A failed connect: network error, TLS error, or a rejected handshake (then `status` is set, e.g. 401). */
export class SocketConnectError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'SocketConnectError';
  }
}

/** Gives a fresh, unconnected transport per socket. */
export type SocketFactory = () => SocketTransport;
