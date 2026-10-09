import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
    normaliseAction, normaliseCollectionConfig, normaliseCurrentState,
    CollectionConfig, CurrentState, RestAction, ValidationType, ValidationTypeBody
} from '../src';

const testCollection = path.resolve(__dirname, '../../../Test Collection');

function readJson<T>(relative: string): T {
    return JSON.parse(fs.readFileSync(path.join(testCollection, relative), 'utf8')) as T;
}

function requestFiles(): string[] {
    return fs.readdirSync(testCollection, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .flatMap(d => fs.readdirSync(path.join(testCollection, d.name))
            .filter(f => f.endsWith('.frreq'))
            .map(f => path.join(d.name, f)));
}

describe('normaliseAction', () => {
    it.each(requestFiles())('gives %s the full shape', (file) => {
        const action = normaliseAction(readJson<RestAction>(file));

        expect(Array.isArray(action.headers)).toBe(true);
        expect(Array.isArray(action.parameters)).toBe(true);
        expect(action.authentication.basicAuth).toBeDefined();
        expect(action.authentication.bearerToken).toBeDefined();
        expect(action.authentication.awsSig.signUrl).toBeTypeOf('boolean');
        expect(action.validation.headers).toBeDefined();
        expect(action.validation.httpCode).toBeTypeOf('number');
        expect(typeof action.body).toBe('object');
        for (const run of action.runs) {
            expect(run.validation.type).toBeDefined();
            expect(run.authentication.basicAuth).toBeDefined();
            expect(Array.isArray(run.variables)).toBe(true);
        }
    });

    it('keeps values that are already present', () => {
        const action = normaliseAction(readJson<RestAction>('google search/google search.frreq'));
        expect(action.url).toContain('{{host}}');
        expect(action.runs.length).toBe(1);
    });

    it('fills a bare old-style request', () => {
        const action = normaliseAction({ id: 'x', name: 'old', verb: 'get', protocol: 'https', url: 'a.b', body: 'text' } as unknown as RestAction);

        expect(action.headers).toEqual([]);
        expect(action.parameters).toEqual([]);
        expect(action.runs).toEqual([]);
        expect(action.authentication.authentication).toBe('inherit');
        expect(action.validation).toEqual({ type: ValidationType.None, headers: [], body: ValidationTypeBody.None, httpCode: 200, jsonSchema: undefined });
        expect(action.body).toEqual({ contentType: 'none', body: undefined });
    });

    it('fills missing validation fields without overwriting set ones', () => {
        const action = normaliseAction({ id: 'x', name: 'v', url: '', body: { contentType: 'none' }, validation: { httpCode: 404 } } as unknown as RestAction);
        expect(action.validation.httpCode).toBe(404);
        expect(action.validation.type).toBe(ValidationType.None);
        expect(action.validation.body).toBe(ValidationTypeBody.None);
    });

    it('returns the same object it was given', () => {
        const json = readJson<RestAction>('xml/XML Result.frreq');
        expect(normaliseAction(json)).toBe(json);
    });
});

describe('normaliseCollectionConfig', () => {
    it('fills auth gaps in the test collection', () => {
        const config = normaliseCollectionConfig(readJson<CollectionConfig>('my collection.frcol'));

        expect(config.collectionEnvironment.auth.authentication).toBe('awssig');
        expect(config.collectionEnvironment.auth.awsSig.accessKey).toBe('akey');
        expect(config.collectionEnvironment.auth.awsSig.signUrl).toBe(false);
        expect(config.collectionEnvironment.auth.awsSig.sessionToken).toBe('');   // saved before session tokens existed
        expect(config.environments.length).toBe(3);
        config.environments.forEach(e => {
            expect(e.auth.basicAuth).toBeDefined();
            expect(Array.isArray(e.secrets)).toBe(true);
        });
    });

    it('fills an empty config', () => {
        const config = normaliseCollectionConfig({ collectionGuid: 'g' } as CollectionConfig);
        expect(config.environments).toEqual([]);
        expect(config.selectedEnvironmentId).toBe('');
        expect(config.collectionEnvironment.auth.authentication).toBe('none');
    });
});

describe('normaliseCurrentState', () => {
    it('normalises every open action', () => {
        const state = normaliseCurrentState({
            currentCollection: '',
            sessions: [{ collectionGuid: 'c', actions: [{ action: { id: 'a', body: 'x' } as unknown as RestAction, fullFilename: '', dirty: false, activeTab: true }] }]
        } as unknown as CurrentState);

        expect(state.recentCollections).toEqual([]);
        expect(state.sessions[0]!.actions[0]!.action.runs).toEqual([]);
        expect(state.sessions[0]!.actions[0]!.action.body.contentType).toBe('none');
    });
});
