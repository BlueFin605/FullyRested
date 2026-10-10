import { describe, it, expect } from 'vitest';
import { REConstants, CreateEmptyAction, CreateEmptyRestActionRun, ExecuteRestAction, HttpProtocol, RestTypeVerb, ValidationType } from '../src';

describe('model defaults', () => {
  it('creates an empty GET https action that inherits authentication', () => {
    const action = CreateEmptyAction();
    expect(action.verb).toBe(RestTypeVerb.get);
    expect(action.protocol).toBe(HttpProtocol.https);
    expect(action.authentication.authentication).toBe('inherit');
    expect(action.runs).toEqual([]);
  });

  it('creates an empty run that inherits authentication', () => {
    const run = CreateEmptyRestActionRun({ generateGUID: () => 'r1' }, ValidationType.Inherit);
    expect(run.id).toBe('r1');
    expect(run.authentication.authentication).toBe('inherit');
  });

  it('builds an ExecuteRestAction immutably', () => {
    const empty = ExecuteRestAction.NewExecuteRestAction();
    const post = empty.setVerb(RestTypeVerb.post).setUrl('api.example.com/items');
    expect(empty.verb).toBe(RestTypeVerb.get);
    expect(post.verb).toBe(RestTypeVerb.post);
    expect(post.url).toBe('api.example.com/items');
    expect(post.validation?.type).toBe(ValidationType.None);
  });
});

describe('REConstants', () => {
  it('names the folder settings file', () => {
    expect(REConstants.FolderSettingsFile).toBe('folder.frfolder');
  });
});
