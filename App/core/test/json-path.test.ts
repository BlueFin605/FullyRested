import { describe, it, expect } from 'vitest';
import { jsonPath, QueryError } from '../src';

const doc = { id: 1, items: [{ id: 'a', tags: ['x', 'y'] }, { id: 'b', tags: [] }], map: { k1: { v: 1 }, k2: { v: 2 } }, 'odd key': 7 };

describe('jsonPath', () => {
  it('returns the root for $', () => expect(jsonPath(doc, '$')).toEqual([doc]));
  it('follows dotted keys', () => expect(jsonPath(doc, '$.map.k1.v')).toEqual([1]));
  it('supports bracket keys', () => expect(jsonPath(doc, "$['odd key']")).toEqual([7]));
  it('supports array indexes', () => expect(jsonPath(doc, '$.items[1].id')).toEqual(['b']));
  it('supports [*] over arrays', () => expect(jsonPath(doc, '$.items[*].id')).toEqual(['a', 'b']));
  it('supports [*] over objects', () => expect(jsonPath(doc, '$.map[*].v')).toEqual([1, 2]));
  it('chains wildcards', () => expect(jsonPath(doc, '$.items[*].tags[*]')).toEqual(['x', 'y']));
  it('returns no matches for missing keys', () => expect(jsonPath(doc, '$.nope.deeper')).toEqual([]));
  it('rejects unsupported syntax', () => {
    for (const expr of ['$..id', '$.items[?(@.id)]', 'items', '$.items[1:2]', '']) {
      expect(() => jsonPath(doc, expr)).toThrow(QueryError);
    }
    expect(() => jsonPath(doc, '$..id')).toThrow("Unsupported path '$..id'. Supported: $.a.b, [n], [*], ['key']");
  });
});
