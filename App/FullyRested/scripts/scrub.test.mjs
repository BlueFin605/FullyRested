import test from 'node:test';
import assert from 'node:assert/strict';
import { scrubText, FAKE_IP, FAKE_TRACE } from './scrub.mjs';

test('replaces IPv4 literals', () => {
    assert.equal(scrubText('"origin": "1.2.3.4"'), `"origin": "${FAKE_IP}"`);
    assert.equal(scrubText('a 10.20.30.40, 200.1.2.3 b'), `a ${FAKE_IP}, ${FAKE_IP} b`);
});
test('replaces trace ids', () => {
    assert.equal(scrubText('Root=1-65a1b2c3-0123456789abcdef01234567'), FAKE_TRACE);
});
test('leaves non-IP and loopback text alone', () => {
    for (const s of ['127.0.0.1', 'version 1.2.3', 'build 1.2.3.4.5', '999.1.1.1', 'plain text', '']) assert.equal(scrubText(s), s);
});
