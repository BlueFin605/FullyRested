import { describe, it, expect } from 'vitest';
import {
    applyEnvironment, buildRequestUrl, resolveExecuteAction, resolveRequest,
    AuthenticationDetails, CollectionConfig, CreateEmptyAction, CreateEmptyAuthenticationDetails, CreateEmptyRestActionValidation,
    ExecuteRestAction, RestAction, RestActionRun, ValidationType
} from '../src';

const p = (key: string, value: string, active = true) => ({ key, value, active, id: key });
const v = (variable: string, value: string) => ({ variable, value, active: true, id: variable });
const s = ($secret: string, $value: string) => ({ $secret, $value, active: true, id: $secret });

function auth(type: string, token = ''): AuthenticationDetails {
    const a = CreateEmptyAuthenticationDetails(type);
    a.bearerToken.token = token;
    return a;
}

function action(): RestAction {
    const a = CreateEmptyAction();
    a.id = 'a1';
    a.name = 'req';
    a.url = '{{host}}/search';
    a.parameters = [p('q', 'from action'), p('page', '1')];
    a.headers = [p('accept', 'text/html'), p('x-action', 'yes')];
    a.validation = CreateEmptyRestActionValidation(ValidationType.ResponseCode);
    a.runs = [run()];
    return a;
}

function run(): RestActionRun {
    return {
        id: 'r1', name: 'run one',
        parameters: [p('q', 'from run')],
        headers: [p('accept', 'application/json')],
        variables: [v('host', 'run.example.com')],
        secrets: [s('key', 'run-secret')],
        authentication: auth('inherit'),
        validation: CreateEmptyRestActionValidation(ValidationType.Inherit)
    };
}

function config(): CollectionConfig {
    return {
        collectionGuid: 'c',
        selectedEnvironmentId: 'dev',
        collectionEnvironment: { name: 'system.settings', id: '', variables: [v('host', 'collection.example.com'), v('only', 'collection')], secrets: [s('key', 'collection-secret'), s('other', 'collection-other')], auth: auth('bearer', 'collection-token') },
        environments: [
            { name: 'Dev', id: 'dev', variables: [v('host', 'dev.example.com'), v('env', 'dev')], secrets: [s('key', 'dev-secret')], auth: auth('inherit') },
            { name: 'Prod', id: 'prod', variables: [v('host', 'prod.example.com'), v('env', 'prod')], secrets: [], auth: auth('bearer', 'prod-token') }
        ]
    };
}

const varValue = (e: ExecuteRestAction, name: string) => e.variables?.find(x => x.variable == name)?.value;
const secretValue = (e: ExecuteRestAction, name: string) => e.secrets?.find(x => x.$secret == name)?.$value;

describe('buildRequestUrl', () => {
    it('appends active, non-empty parameters; later keys win', () => {
        expect(buildRequestUrl('api.example.com/items', [p('a', '1'), p('b', ''), p('c', '3', false), p('a', '2')])).toBe('api.example.com/items?a=2');
    });

    it('keeps {{variables}}, slashes and URL punctuation readable', () => {
        expect(buildRequestUrl('{{host}}/v1/items', [p('q', 'a b'), p('filter', '{{f}}'), p('r', 'x/y?z=1'), p('at', 'me@x:1,$;')]))
            .toBe('{{host}}/v1/items?q=a+b&filter={{f}}&r=x/y?z=1&at=me@x:1,$;');
    });

    it('escapes & and + in values, and parentheses in the path', () => {
        expect(buildRequestUrl('host/a(b)', [p('v', 'x&y+z')])).toBe('host/a%28b%29?v=x%26y%2Bz');
    });

    it('returns the bare url when there are no parameters', () => {
        expect(buildRequestUrl('host/path', [])).toBe('host/path');
    });
});

describe('resolveRequest', () => {
    it('uses the action alone when there is no run', () => {
        const e = resolveRequest(action());
        expect(e.url).toBe('{{host}}/search?q=from+action&page=1');
        expect(e.headers).toEqual({ accept: 'text/html', 'x-action': 'yes' });
        expect(e.authentication?.authentication).toBe('inherit');
        expect(e.validation?.type).toBe(ValidationType.ResponseCode);
    });

    it('lets run parameters and headers override the action', () => {
        const e = resolveRequest(action(), run());
        expect(e.url).toBe('{{host}}/search?q=from+run&page=1');
        expect(e.headers).toEqual({ accept: 'application/json', 'x-action': 'yes' });
    });

    it('does not reorder the action headers it was given', () => {
        const a = action();
        resolveRequest(a, run());
        resolveRequest(a);
        expect(a.headers.map(h => h.key)).toEqual(['accept', 'x-action']);
    });

    it('takes the action validation when the run inherits it, else the run', () => {
        expect(resolveRequest(action(), run()).validation?.type).toBe(ValidationType.ResponseCode);
        const r = run();
        r.validation = CreateEmptyRestActionValidation(ValidationType.Headers);
        expect(resolveRequest(action(), r).validation?.type).toBe(ValidationType.Headers);
    });

    it('auth: run beats action unless the run inherits', () => {
        const a = action();
        a.authentication = auth('bearer', 'action-token');
        expect(resolveRequest(a, run()).authentication?.bearerToken.token).toBe('action-token');
        const r = run();
        r.authentication = auth('bearer', 'run-token');
        expect(resolveRequest(a, r).authentication?.bearerToken.token).toBe('run-token');
    });
});

describe('applyEnvironment / resolveExecuteAction precedence', () => {
    it('variables and secrets: run > environment > collection', () => {
        const e = resolveExecuteAction({ collection: config(), action: action(), runId: 'r1' });
        expect(varValue(e, 'host')).toBe('run.example.com');
        expect(varValue(e, 'env')).toBe('dev');
        expect(varValue(e, 'only')).toBe('collection');
        expect(secretValue(e, 'key')).toBe('run-secret');
        expect(secretValue(e, 'other')).toBe('collection-other');
    });

    it('environment beats collection when the run does not set a value', () => {
        const e = resolveExecuteAction({ collection: config(), action: action() });
        expect(varValue(e, 'host')).toBe('dev.example.com');
        expect(secretValue(e, 'key')).toBe('dev-secret');
    });

    it('uses the selected environment unless one is named', () => {
        expect(varValue(resolveExecuteAction({ collection: config(), action: action() }), 'env')).toBe('dev');
        expect(varValue(resolveExecuteAction({ collection: config(), action: action(), environmentId: 'prod' }), 'env')).toBe('prod');
    });

    it('auth: run > action > environment > collection', () => {
        // everything inherits down to the collection
        expect(resolveExecuteAction({ collection: config(), action: action(), runId: 'r1' }).authentication?.bearerToken.token).toBe('collection-token');
        // environment
        expect(resolveExecuteAction({ collection: config(), action: action(), environmentId: 'prod' }).authentication?.bearerToken.token).toBe('prod-token');
        // action
        const a = action();
        a.authentication = auth('bearer', 'action-token');
        expect(resolveExecuteAction({ collection: config(), action: a, environmentId: 'prod' }).authentication?.bearerToken.token).toBe('action-token');
        // a non-inherit 'none' stops the chain
        a.authentication = auth('none');
        expect(resolveExecuteAction({ collection: config(), action: a }).authentication?.authentication).toBe('none');
    });

    it('finds a run by id or by name, and rejects an unknown run', () => {
        const a = action();
        a.runs = [run()];
        expect(resolveExecuteAction({ collection: config(), action: a, runId: 'run one' }).url).toContain('from+run');
        expect(() => resolveExecuteAction({ collection: config(), action: a, runId: 'nope' })).toThrow(/nope/);
    });

    it('works without a collection', () => {
        const e = applyEnvironment(resolveRequest(action()), undefined);
        expect(e.variables).toEqual([]);
        expect(e.authentication?.authentication).toBe('inherit');
    });

    it('substitutes the resolved values', () => {
        const e = resolveExecuteAction({ collection: config(), action: action() }).replaceVariables();
        expect(e.url).toBe('dev.example.com/search?q=from+action&page=1');
    });
});
