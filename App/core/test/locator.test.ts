import { describe, expect, it } from 'vitest';
import { parseLocator } from '../src/locator';
import { QueryError } from '../src/query-error';

describe('parseLocator', () => {
  it('parses every form', () => {
    expect(parseLocator('collection')).toEqual({ kind: 'collection' });
    expect(parseLocator('env:Production')).toEqual({ kind: 'environment', name: 'Production' });
    expect(parseLocator('folder:users')).toEqual({ kind: 'folder', path: 'users' });
    expect(parseLocator('request:users/get.frreq')).toEqual({ kind: 'request', path: 'users/get.frreq' });
    expect(parseLocator('run:users/get.frreq#not found'))
      .toEqual({ kind: 'run', path: 'users/get.frreq', run: 'not found' });
  });

  it('is forgiving about case, whitespace and separators', () => {
    expect(parseLocator('  REQUEST:users\\get.frreq ')).toEqual({ kind: 'request', path: 'users/get.frreq' });
    expect(parseLocator('folder:./users/')).toEqual({ kind: 'folder', path: 'users' });
  });

  it('keeps a colon in a name and splits a run on the last hash', () => {
    expect(parseLocator('env:prod:eu')).toEqual({ kind: 'environment', name: 'prod:eu' });
    expect(parseLocator('run:a#b.frreq#case 1'))
      .toEqual({ kind: 'run', path: 'a#b.frreq', run: 'case 1' });
  });

  it('rejects an unknown prefix, listing the forms', () => {
    expect(() => parseLocator('thing:x')).toThrow(QueryError);
    expect(() => parseLocator('thing:x')).toThrow(/run:<request path>#<run name>/);
  });

  it('rejects an empty target and a run with no name', () => {
    expect(() => parseLocator('env:')).toThrow(/needs a name/);
    expect(() => parseLocator('folder:')).toThrow(/needs a path/);
    expect(() => parseLocator('run:users/get.frreq')).toThrow(/needs a run name/);
    expect(() => parseLocator('folder:.')).toThrow(/collection-wide settings/);
  });
});
