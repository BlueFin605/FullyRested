import { describe, it, expect } from 'vitest';
import {
    AuthenticationDetails, CollectionConfig, CollectionNode, CreateEmptyAction, CreateEmptyAuthenticationDetails,
    CreateEmptyFolderConfig, CreateEmptyRestActionValidation, FolderConfig, FolderNode, RequestNode, ScopeSettings,
    ValidationType, normaliseCollectionConfig
} from '../src';

const h = (key: string, value: string, active = true) => ({ key, value, active, id: key });
const v = (variable: string, value: string, active = true) => ({ variable, value, active, id: variable });
const s = ($secret: string, $value: string) => ({ $secret, $value, active: true, id: $secret });

function bearer(token: string): AuthenticationDetails {
    const a = CreateEmptyAuthenticationDetails('bearertoken');
    a.bearerToken.token = token;
    return a;
}

function config(): CollectionConfig {
    return normaliseCollectionConfig({
        collectionGuid: 'c1', selectedEnvironmentId: 'dev',
        collectionEnvironment: { name: 'system.settings', id: '', variables: [v('host', 'collection'), v('who', 'collection')], secrets: [s('key', 'collection')], auth: bearer('collection'), headers: [h('X-Level', 'collection'), h('x-collection', 'yes')] },
        environments: [
            { name: 'Dev', id: 'dev', variables: [v('host', 'dev'), v('env', 'dev')], secrets: [], auth: CreateEmptyAuthenticationDetails('inherit'), headers: [h('x-level', 'dev')] },
            { name: 'Prod', id: 'prod', variables: [v('env', 'prod')], secrets: [], auth: CreateEmptyAuthenticationDetails('inherit'), headers: [] }
        ]
    });
}

const folder = (id: string, settings: Partial<ScopeSettings>): FolderConfig => ({ ...CreateEmptyFolderConfig(id), ...settings });

function build() {
    const root = new CollectionNode(config(), 'api.frcol');
    const outer = new FolderNode(root, 'outer', folder('f1', { variables: [v('host', 'outer')], headers: [h('x-level', 'outer')], auth: bearer('outer') }), true);
    const inner = new FolderNode(outer, 'outer/inner', folder('f2', { variables: [v('host', 'inner')], headers: [h('X-LEVEL', 'inner')] }), true);
    root.children.push(outer);
    outer.children.push(inner);

    const action = CreateEmptyAction();
    action.id = 'a1';
    action.name = 'req';
    action.url = '{{host}}/x';
    action.headers = [h('accept', 'text/html')];
    action.runs = [{
        id: 'r1', name: 'one', parameters: [], headers: [h('x-level', 'run')], variables: [v('host', 'run')], secrets: [s('key', 'run')],
        authentication: CreateEmptyAuthenticationDetails('inherit'), validation: CreateEmptyRestActionValidation(ValidationType.Inherit)
    }];
    const request = new RequestNode(inner, 'outer/inner/req.frreq', action);
    inner.children.push(request);

    const top = new RequestNode(root, 'top.frreq', { ...CreateEmptyAction(), id: 'a2', name: 'top' });
    root.children.push(top);
    return { root, outer, inner, request, top };
}

const value = (rows: { variable: string; value: string; active: boolean }[] | undefined, name: string) =>
    rows?.find(r => r.active && r.variable == name)?.value;

describe('scope precedence', () => {
    it('takes the nearest folder over outer folders, the environment and the collection', () => {
        expect(value(build().request.resolve().variables, 'host')).toBe('inner');
    });

    it('lets a run beat everything', () => {
        const resolved = build().request.run('r1').resolve();
        expect(value(resolved.variables, 'host')).toBe('run');
        expect(resolved.headers['x-level']).toBe('run');
        expect(resolved.secrets?.find(x => x.$secret == 'key')?.$value).toBe('run');
    });

    it('puts the selected environment above the collection base', () => {
        const { request } = build();
        expect(value(request.resolve().variables, 'env')).toBe('dev');
        expect(value(request.resolve({ environmentId: 'prod' }).variables, 'env')).toBe('prod');
        expect(value(request.resolve().variables, 'who')).toBe('collection');
    });

    it('merges headers by name ignoring case, nearest first', () => {
        expect(build().request.resolve().headers).toEqual({ 'X-LEVEL': 'inner', 'x-collection': 'yes', accept: 'text/html' });
    });

    it('skips inactive rows', () => {
        const { request, inner } = build();
        inner.config.variables = [v('host', 'inner', false)];
        expect(value(request.resolve().variables, 'host')).toBe('outer');
    });

    it('inherits auth from the first level that sets one', () => {
        const { request, outer } = build();
        expect(request.resolve().authentication?.bearerToken.token).toBe('outer');
        outer.config.auth = CreateEmptyAuthenticationDetails('inherit');
        expect(request.resolve().authentication?.bearerToken.token).toBe('collection');
    });

    it('stops at none', () => {
        const { request } = build();
        request.action.authentication = CreateEmptyAuthenticationDetails('none');
        expect(request.resolve().authentication?.authentication).toBe('none');
    });
});

describe('request and run resolution', () => {
    it('adds run parameters to the request parameters, the run winning a repeated key', () => {
        const { request } = build();
        request.action.url = 'host/search';
        request.action.parameters = [h('q', 'from action'), h('page', '1')];
        request.action.runs[0].parameters = [h('q', 'from run')];
        expect(request.resolve().url).toBe('host/search?q=from+action&page=1');
        expect(request.run('r1').resolve().url).toBe('host/search?q=from+run&page=1');
    });

    it('takes the request validation when the run inherits it, else the run validation', () => {
        const { request } = build();
        request.action.validation = CreateEmptyRestActionValidation(ValidationType.ResponseCode);
        expect(request.resolve().validation?.type).toBe(ValidationType.ResponseCode);
        expect(request.run('r1').resolve().validation?.type).toBe(ValidationType.ResponseCode);
        request.action.runs[0].validation = CreateEmptyRestActionValidation(ValidationType.Headers);
        expect(request.run('r1').resolve().validation?.type).toBe(ValidationType.Headers);
    });

    it('auth: a run beats the request unless the run inherits', () => {
        const { request } = build();
        request.action.authentication = bearer('action');
        expect(request.run('r1').resolve().authentication?.bearerToken.token).toBe('action');
        request.action.runs[0].authentication = bearer('run');
        expect(request.run('r1').resolve().authentication?.bearerToken.token).toBe('run');
    });

    it('finds a run by name and does not reorder the request headers', () => {
        const { request } = build();
        request.action.headers = [h('accept', 'text/html'), h('x-action', 'yes')];
        expect(request.run('one').run.id).toBe('r1');
        request.run('r1').resolve();
        request.resolve();
        expect(request.action.headers.map(x => x.key)).toEqual(['accept', 'x-action']);
    });

    it('substitutes the resolved values', () => {
        expect(build().request.resolve().replaceVariables().url).toBe('inner/x');
    });
});

describe('effectiveSettings', () => {
    it('names where each value comes from and agrees with resolve()', () => {
        const { request } = build();
        const effective = request.effectiveSettings();
        const levels = effective.headers.filter(x => x.value.key.toLowerCase() == 'x-level');
        expect(levels.map(x => [x.source.kind, x.source.name, x.overridden])).toEqual([
            ['folder', 'outer/inner', false], ['folder', 'outer', true], ['environment', 'Dev', true], ['collection', 'api', true]
        ]);
        const sent = Object.fromEntries(effective.headers.filter(x => !x.overridden).map(x => [x.value.key, x.value.value]));
        expect(sent).toEqual(request.resolve().headers);
        expect(effective.auth?.source).toEqual({ kind: 'folder', name: 'outer' });
    });
});

describe('load errors', () => {
    it('refuses to resolve below a broken file but leaves siblings alone', () => {
        const { request, outer, top } = build();
        outer.loadError = { file: 'outer/folder.frfolder', message: 'bad json' };
        expect(() => request.resolve()).toThrow("Cannot resolve 'req': outer/folder.frfolder is invalid: bad json");
        expect(() => top.resolve()).not.toThrow();
    });
});

describe('tree helpers', () => {
    it('finds nodes by collection-relative path', () => {
        const { root, inner, request } = build();
        expect(root.find('')).toBe(root);
        expect(root.find('outer/inner')).toBe(inner);
        expect(root.find('outer/inner/req.frreq')).toBe(request);
        expect(root.find('nope')).toBeUndefined();
    });

    it('lists requests depth first and folders', () => {
        const { root } = build();
        expect(root.requestNodes().map(r => r.path)).toEqual(['outer/inner/req.frreq', 'top.frreq']);
        expect(root.folderNodes().map(f => f.path)).toEqual(['outer', 'outer/inner']);
    });

    it('attaches an open request under the folder its file is in', () => {
        const { root, inner, outer } = build();
        const action = CreateEmptyAction();
        expect(root.attach(action, 'outer/inner/new.frreq').parent).toBe(inner);
        expect(root.attach(action, 'outer/missing/new.frreq').parent).toBe(outer);
        expect(root.attach(action, undefined).parent).toBe(root);
        expect(root.children.length).toBe(2);
    });

    it('throws for an unknown run', () => {
        expect(() => build().request.run('nope')).toThrow("Run 'nope' not found in request 'req'");
    });
});
