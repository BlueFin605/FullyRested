const test = require('node:test');
const assert = require('node:assert');
const { isExternal, applyExternalLinkGuards } = require('../window-links');

function fake() {
    const opened = [];
    let openHandler; let navHandler;
    const wc = { setWindowOpenHandler: h => { openHandler = h; }, on: (n, h) => { if (n === 'will-navigate') navHandler = h; } };
    applyExternalLinkGuards(wc, url => opened.push(url));
    return { opened, openHandler, navHandler };
}

test('isExternal accepts only http(s)', () => {
    assert.ok(isExternal('https://example.com/a'));
    assert.ok(isExternal('http://example.com'));
    assert.ok(!isExternal('file:///C:/app/dist/index.html'));
    assert.ok(!isExternal('javascript:alert(1)'));
    assert.ok(!isExternal('not a url'));
});

test('window.open of an external url opens the browser and is denied', () => {
    const { opened, openHandler } = fake();
    assert.deepStrictEqual(openHandler({ url: 'https://example.com' }), { action: 'deny' });
    assert.deepStrictEqual(opened, ['https://example.com']);
});

test('window.open of a non-http url is denied without opening anything', () => {
    const { opened, openHandler } = fake();
    assert.deepStrictEqual(openHandler({ url: 'file:///x' }), { action: 'deny' });
    assert.deepStrictEqual(opened, []);
});

test('will-navigate to http(s) is prevented and opened externally; file:// is left alone', () => {
    const { opened, navHandler } = fake();
    let prevented = 0;
    navHandler({ preventDefault: () => prevented++ }, 'https://example.com/x');
    navHandler({ preventDefault: () => prevented++ }, 'file:///C:/app/dist/fullyrested/index.html');
    assert.strictEqual(prevented, 1);
    assert.deepStrictEqual(opened, ['https://example.com/x']);
});
