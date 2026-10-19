// Drives the real Electron app over CDP and writes help screenshots to docs/help/images.
// Privacy: shot() first runs the scrub from ./scrub.mjs in the page (twice, since virtualised CodeMirror may re-render):
// every text node, input value and title/placeholder/aria-label/value attribute has IPv4 literals replaced by 203.0.113.7
// and AWS trace ids (Root=1-xxxxxxxx-...) replaced by a fixed fake, so no real public IP or trace id reaches an image.
// Usage: npm run help:screenshots [-- <shot-name> ...]   (needs dist/fullyrested and ../core/dist built)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shots } from './help-shots.mjs';
import { scrubPageExpression } from './scrub.mjs';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');
const electronPath = require('electron');
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appDir, '..', '..');
const imagesDir = path.join(repoRoot, 'docs', 'help', 'images');
const collection = path.join(repoRoot, 'docs', 'help', 'sample-collection', 'Help Sample.frcol');
const port = 9333 + Math.floor(Math.random() * 500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let child, userData, ws, nextId = 1;
const pending = new Map();

function cdp(method, params = {}) {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
}

async function evaluate(expression) {
    const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
}

async function connect() {
    for (let i = 0; i < 100; i++) {
        try {
            const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
            const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
            if (page) {
                ws = new WebSocket(page.webSocketDebuggerUrl);
                await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
                ws.on('message', (m) => {
                    const msg = JSON.parse(m);
                    const p = pending.get(msg.id);
                    if (!p) return;
                    pending.delete(msg.id);
                    msg.error ? p.reject(new Error(`${p.method}: ${msg.error.message}`)) : p.resolve(msg.result);
                });
                return;
            }
        } catch { /* app not up yet */ }
        await sleep(200);
    }
    throw new Error('Could not connect to the Electron page target');
}

// Finds the first visible element matching a CSS selector, else the smallest visible element whose text
// contains the given string; returns its centre point.
const locate = (target, scroll = false) => `(() => {
    const t = ${JSON.stringify(target)};
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    let el = null;
    try { el = [...document.querySelectorAll(t)].find(vis) || null; } catch (e) {}
    if (!el) {
        const all = [...document.querySelectorAll('button, a, [role], li, span, div, mat-tree-node, label')]
            .filter((e) => vis(e) && (e.textContent || '').trim().includes(t));
        el = all.sort((a, b) => (a.textContent.length - b.textContent.length))[0] || null;
    }
    if (!el) return null;
    if (${JSON.stringify(scroll)}) el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`;

const helpers = {
    sleep,
    async waitFor(target, timeout = 15000, scroll = false) {
        const end = Date.now() + timeout;
        while (Date.now() < end) {
            const p = await evaluate(locate(target, scroll));
            if (p) return p;
            await sleep(150);
        }
        throw new Error(`waitFor timed out: ${target}`);
    },
    async click(target) {
        const { x, y } = await helpers.waitFor(target, 15000, true);
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
            await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
        await sleep(250);
    },
    // same target semantics as click; opens context menus
    async rightClick(target) {
        const { x, y } = await helpers.waitFor(target, 15000, true);
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
            await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'right', clickCount: 1, buttons: type === 'mousePressed' ? 2 : 0 });
        await sleep(400);
    },
    // left-click at explicit viewport coordinates (no target lookup)
    async clickAt(x, y) {
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
            await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
        await sleep(250);
    },
    async type(text) {
        await cdp('Input.insertText', { text });
        await sleep(100);
    },
    // key e.g. 'Enter', 'Escape', 'Tab'; modifiers: { ctrl, shift, alt }
    async press(key, { ctrl, shift, alt } = {}) {
        const modifiers = (alt ? 1 : 0) | (ctrl ? 2 : 0) | (shift ? 8 : 0);
        const codes = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, ArrowDown: 40, ArrowUp: 38, F1: 112 };
        const base = { key, modifiers, windowsVirtualKeyCode: codes[key] || key.toUpperCase().charCodeAt(0), text: key === 'Enter' ? '\r' : undefined };
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
        await sleep(200);
    },
    async setWindowSize(width = 1280, height = 800) {
        // the page target has no Browser domain, so pin the viewport instead of the window
        await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await sleep(400);
    },
    // clip: { x, y, width, height } in CSS pixels
    async shot(name, { clip } = {}) {
        mkdirSync(imagesDir, { recursive: true });
        await evaluate(scrubPageExpression());
        await sleep(300);
        await evaluate(scrubPageExpression());
        const params = { format: 'png' };
        if (clip) params.clip = { ...clip, scale: 1 };
        const { data } = await cdp('Page.captureScreenshot', params);
        const file = path.join(imagesDir, `${name}.png`);
        writeFileSync(file, Buffer.from(data, 'base64'));
        console.log('wrote', path.relative(repoRoot, file));
    }
};

async function cleanup() {
    try { ws?.close(); } catch (e) {}
    if (child && child.exitCode === null) {
        if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        else child.kill('SIGKILL');
        await sleep(800);
    }
    if (userData) try { rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch (e) {}
}

async function main() {
    const wanted = process.argv.slice(2);
    const todo = wanted.length ? shots.filter((s) => wanted.includes(s.name)) : shots;
    if (!todo.length) throw new Error(`No matching shots: ${wanted.join(', ')}`);
    userData = mkdtempSync(path.join(tmpdir(), 'fr-help-'));
    child = spawn(electronPath, ['.'], {
        cwd: appDir,
        stdio: 'inherit',
        env: { ...process.env, FR_REMOTE_DEBUGGING_PORT: String(port), FR_OPEN_COLLECTION: collection, FR_USER_DATA: userData, FR_NO_DEVTOOLS: '1' }
    });
    await connect();
    await cdp('Page.enable');
    // an occluded or minimised window reports document.visibilityState 'hidden' and stops rendering, so the tree never paints
    await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
    await helpers.setWindowSize(1280, 800);
    await sleep(1500); // let the collection open
    for (const s of todo) await s.run(helpers);
}

const stop = async (code) => { await cleanup(); process.exit(code); };
process.on('SIGINT', () => stop(130));
process.on('SIGTERM', () => stop(143));
main().then(() => stop(0), async (e) => { console.error(e); await stop(1); });
