import { describe, it, expect } from 'vitest';
import { ExecuteRestAction, SecretTable, VariableTable, canSubstitute, isRawCredential, substituteDeep, substituteText } from '../src';

const vars = (pairs: { [name: string]: string }): VariableTable[] =>
  Object.entries(pairs).map(([variable, value], i) => ({ variable, value, active: true, id: `v${i}` }));

const secrets = (pairs: { [name: string]: string }): SecretTable[] =>
  Object.entries(pairs).map(([$secret, $value], i) => ({ $secret, $value, active: true, id: `s${i}` }));

describe('substituteText', () => {
  it('replaces {{variable}} and {{$secret}} placeholders', () => {
    expect(substituteText('https://{{host}}/u/{{$tok}}', vars({ host: 'api.example.com' }), secrets({ tok: 's3cret' })))
      .toBe('https://api.example.com/u/s3cret');
  });

  it('inserts values containing quotes and backslashes verbatim', () => {
    expect(substituteText('{{v}}', vars({ v: 'a"b\\c' }), undefined)).toBe('a"b\\c');
  });

  it('does not treat $ sequences in values as replacement patterns', () => {
    expect(substituteText('Bearer {{$tok}}', undefined, secrets({ tok: 'ab$&cd$1' }))).toBe('Bearer ab$&cd$1');
  });

  it('replaces unknown and inactive placeholders with an empty string', () => {
    const inactive: VariableTable[] = [{ variable: 'x', value: 'X', active: false, id: '1' }];
    expect(substituteText('[{{x}}][{{missing}}]', inactive, undefined)).toBe('[][]');
  });

  it('is single-pass: a value containing a placeholder is not expanded again', () => {
    expect(substituteText('{{a}}', vars({ a: '{{b}}', b: 'B' }), undefined)).toBe('{{b}}');
  });
});

describe('substituteDeep', () => {
  it('walks nested objects, arrays and object keys, leaving non-strings alone', () => {
    const input = { n: 1, flag: true, none: null, list: ['{{a}}'], nested: { '{{a}}': '{{a}}' } };
    expect(substituteDeep(input, vars({ a: 'A' }), undefined))
      .toEqual({ n: 1, flag: true, none: null, list: ['A'], nested: { A: 'A' } });
  });

  it('does not mutate its input', () => {
    const input = { url: '{{a}}' };
    substituteDeep(input, vars({ a: 'A' }), undefined);
    expect(input.url).toBe('{{a}}');
  });
});

describe('ExecuteRestAction.replaceVariables', () => {
  const action = ExecuteRestAction.NewExecuteRestAction()
    .setUrl('{{host}}/items/{{id}}')
    .setHeaders({ Authorization: 'Bearer {{$tok}}' })
    .setBody({ contentType: 'application/json', body: '{"name":"{{name}}"}' })
    .variables_pushFront(vars({ host: 'api.example.com', id: 'a"b', name: 'Ann' }))
    .secrets_pushBack(secrets({ tok: 'ab$&cd' }));

  it('returns an ExecuteRestAction instance', () => {
    const replaced = action.replaceVariables();
    expect(replaced).toBeInstanceOf(ExecuteRestAction);
    expect(typeof replaced.setUrl).toBe('function');
  });

  it('substitutes the url, headers and body', () => {
    const replaced = action.replaceVariables();
    expect(replaced.url).toBe('api.example.com/items/a"b');
    expect(replaced.headers['Authorization']).toBe('Bearer ab$&cd');
    expect(replaced.body.body).toBe('{"name":"Ann"}');
  });

  it('leaves the variable and secret tables untouched', () => {
    const replaced = action.replaceVariables();
    expect(replaced.variables).toEqual(action.variables);
    expect(replaced.secrets).toEqual(action.secrets);
  });
});

// A name is never restricted where it is declared, so one the placeholder could not match used to be
// accepted, referenced, and then resolved to '' -- sending an empty credential with no warning (AIF-2)
describe('names holding - and _', () => {
  it('substitutes a secret named with _ or -', () => {
    expect(substituteText('{{$api_key}}/{{$aws-secret}}', undefined, secrets({ api_key: 'K', 'aws-secret': 'S' }))).toBe('K/S');
  });

  it('substitutes a variable named with _ or -', () => {
    expect(substituteText('{{base_url}}/{{aws-region}}', vars({ base_url: 'http://h', 'aws-region': 'ap-southeast-2' }), undefined))
      .toBe('http://h/ap-southeast-2');
  });

  it('still leaves a name holding anything else untouched, so it is reported at load instead', () => {
    expect(substituteText('{{a.b}}/{{c d}}', vars({ 'a.b': 'X', 'c d': 'Y' }), undefined)).toBe('{{a.b}}/{{c d}}');
  });

  it('reports which names can substitute', () => {
    expect(['plain', 'api_key', 'aws-secret', 'A1_b-2', ''].every(canSubstitute)).toBe(true);
    expect(['a.b', 'c d', 'e$f', 'g/h', 'héllo'].some(canSubstitute)).toBe(false);
  });

  it('treats a secret reference named with - or _ as a reference, not a raw credential', () => {
    expect(isRawCredential('{{$api_key}}')).toBe(false);
    expect(isRawCredential('{{$aws-secret}}')).toBe(false);
    expect(isRawCredential('literal')).toBe(true);
  });
});
