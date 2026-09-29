import { describe, it, expect } from 'vitest';
import { ACTION_FILE_EXTENSIONS, COLLECTION_FILE_EXTENSIONS, REConstants } from '../src';

describe('file extensions', () => {
  it('uses the FullyRested extensions for new files', () => {
    expect(REConstants.CollectionExtension).toBe('.frcol');
    expect(REConstants.ActionExtension).toBe('.frreq');
  });

  it('still recognises the old Rest Easy extensions, new ones first', () => {
    expect(COLLECTION_FILE_EXTENSIONS).toEqual(['.frcol', '.reasycol']);
    expect(ACTION_FILE_EXTENSIONS).toEqual(['.frreq', '.reasyreq']);
  });
});
