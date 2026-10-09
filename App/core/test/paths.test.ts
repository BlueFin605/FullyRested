import { describe, it, expect } from 'vitest';
import { basenameOf, dirnameOf, extensionOf, hostPath, joinPath, relativePath } from '../src';

describe('collection paths', () => {
    it('joins, splits and finds extensions', () => {
        expect(joinPath('', 'a', 'b.frreq')).toBe('a/b.frreq');
        expect(dirnameOf('a/b/c.frreq')).toBe('a/b');
        expect(dirnameOf('c.frreq')).toBe('');
        expect(basenameOf('a/b/c.frreq')).toBe('c.frreq');
        expect(extensionOf('X.FRREQ')).toBe('.frreq');
        expect(extensionOf('folder')).toBe('');
    });

    it('makes host paths relative, ignoring separators and case', () => {
        expect(relativePath('C:\\Col', 'c:\\col\\a\\b.frreq')).toBe('a/b.frreq');
        expect(relativePath('/home/col/', '/home/col')).toBe('');
        expect(relativePath('/home/col', '/home/other/b.frreq')).toBeUndefined();
        expect(relativePath('/home/col', '/home/collection/b.frreq')).toBeUndefined();
        expect(relativePath('', '/x')).toBeUndefined();
    });

    it('turns a relative path back into a host path with the root\'s separator', () => {
        expect(hostPath('C:\\Col', 'a/b.frreq')).toBe('C:\\Col\\a\\b.frreq');
        expect(hostPath('/home/col/', 'a/b.frreq')).toBe('/home/col/a/b.frreq');
        expect(hostPath('/home/col', '')).toBe('/home/col');
    });
});
