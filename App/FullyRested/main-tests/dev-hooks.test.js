const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { readHooks, applyEarlyHooks, applyOpenCollection } = require('../dev-hooks');

test('unset env gives inert hooks and touches nothing', () => {
    const hooks = readHooks({});
    assert.deepStrictEqual(hooks, { remoteDebuggingPort: null, openCollection: null, userData: null, noDevTools: false });
    const calls = [];
    applyEarlyHooks({ setPath: () => calls.push('p'), commandLine: { appendSwitch: () => calls.push('s') } }, hooks);
    let subscribed = false;
    applyOpenCollection({ once: () => { subscribed = true; } }, hooks, () => {});
    assert.deepStrictEqual(calls, []);
    assert.strictEqual(subscribed, false);
});

test('set env applies userData and debugging port', () => {
    const hooks = readHooks({ FR_REMOTE_DEBUGGING_PORT: '9222', FR_USER_DATA: 'tmp-ud', FR_OPEN_COLLECTION: 'a/b.frcol' });
    const calls = [];
    applyEarlyHooks({ setPath: (k, v) => calls.push(['path', k, v]), commandLine: { appendSwitch: (k, v) => calls.push(['sw', k, v]) } }, hooks);
    assert.deepStrictEqual(calls, [['path', 'userData', path.resolve('tmp-ud')], ['sw', 'remote-debugging-port', '9222']]);
});

test('non-numeric port is ignored', () => {
    assert.strictEqual(readHooks({ FR_REMOTE_DEBUGGING_PORT: 'abc' }).remoteDebuggingPort, null);
});

test('open collection loads after did-finish-load', () => {
    const hooks = readHooks({ FR_OPEN_COLLECTION: 'x/y.frcol' });
    let handler; const loaded = [];
    applyOpenCollection({ once: (ev, fn) => { assert.strictEqual(ev, 'did-finish-load'); handler = fn; } }, hooks, (...a) => loaded.push(a));
    assert.deepStrictEqual(loaded, []);
    handler();
    assert.deepStrictEqual(loaded, [[path.resolve('x/y.frcol'), 'y.frcol', path.dirname(path.resolve('x/y.frcol'))]]);
});

test('FR_NO_DEVTOOLS flag', () => {
    assert.strictEqual(readHooks({ FR_NO_DEVTOOLS: '1' }).noDevTools, true);
    assert.strictEqual(readHooks({ FR_NO_DEVTOOLS: '0' }).noDevTools, false);
});
