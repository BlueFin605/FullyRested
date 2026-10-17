// The ws-backed SocketTransport of the main process. Core stays free of node imports, so the real
// socket lives in the host; this is the Electron host's copy of the CLI host's WsTransport (the app
// does not depend on CLI internals). The url already carries any query-string token; nothing here
// logs or echoes it.
const WebSocket = require('ws');
const { SocketConnectError } = require('@fullyrested/core');

class WsTransport {
    constructor() {
        this.socket = undefined;
        this.messageHandlers = [];
        this.closeHandlers = [];
        this.errorHandlers = [];
    }

    connect(url, headers) {
        return new Promise((resolve, reject) => {
            let opened = false;
            let socket;
            try {
                socket = new WebSocket(url, { headers });
            } catch (e) {
                reject(new SocketConnectError(e instanceof Error ? e.message : 'Invalid websocket URL'));
                return;
            }
            this.socket = socket;

            socket.on('open', () => { opened = true; resolve(); });
            // A rejected handshake (401, 403, ...) arrives as a normal HTTP response.
            socket.on('unexpected-response', (req, res) => {
                const status = res.statusCode;
                res.resume();
                req.destroy();
                reject(new SocketConnectError(`Handshake rejected with HTTP ${status}`, status));
            });
            socket.on('error', err => {
                if (!opened) {
                    reject(new SocketConnectError(err.message));
                    return;
                }
                for (const h of this.errorHandlers) h(err);
            });
            socket.on('message', (data, isBinary) => {
                const text = isBinary ? Buffer.from(data).toString('utf8') : data.toString();
                for (const h of this.messageHandlers) h(text);
            });
            socket.on('close', (code, reason) => {
                if (!opened) return;
                for (const h of this.closeHandlers) h(code, reason.toString('utf8'));
            });
        });
    }

    send(text) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error('Socket is not open');
        this.socket.send(text);
    }

    close(code, reason) { this.socket?.close(code, reason); }
    onMessage(handler) { this.messageHandlers.push(handler); }
    onClose(handler) { this.closeHandlers.push(handler); }
    onError(handler) { this.errorHandlers.push(handler); }
}

module.exports = { WsTransport };
