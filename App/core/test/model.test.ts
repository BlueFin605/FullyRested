import { describe, it, expect } from 'vitest';
import { CreateEmptyAction, ExecuteRestAction, HttpProtocol, RestTypeVerb, ValidationType } from '../src';

describe('model defaults', () => {
  it('creates an empty GET https action that inherits authentication', () => {
    const action = CreateEmptyAction();
    expect(action.verb).toBe(RestTypeVerb.get);
    expect(action.protocol).toBe(HttpProtocol.https);
    expect(action.authentication.authentication).toBe('inherit');
    expect(action.runs).toEqual([]);
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
