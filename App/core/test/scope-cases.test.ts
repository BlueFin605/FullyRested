import { describe, it, expect } from 'vitest';
import {
    CollectionNode, CreateEmptyAction, CreateEmptyAuthenticationDetails, CreateEmptyFolderConfig,
    CreateEmptyRestActionValidation, FolderNode, RequestNode, ValidationType, casesFor, casesForScope,
    normaliseCollectionConfig
} from '../src';

const run = (id: string, name: string) => ({
    id, name, parameters: [], headers: [], variables: [], secrets: [],
    authentication: CreateEmptyAuthenticationDetails('inherit'), validation: CreateEmptyRestActionValidation(ValidationType.Inherit)
});

function build() {
    const root = new CollectionNode(normaliseCollectionConfig({ collectionGuid: 'c1', selectedEnvironmentId: '', collectionEnvironment: { name: 'system.settings', id: '', variables: [], secrets: [], auth: CreateEmptyAuthenticationDetails('inherit'), headers: [] }, environments: [] }), 'api.frcol');
    const outer = new FolderNode(root, 'outer', CreateEmptyFolderConfig('f1'), true);
    const inner = new FolderNode(outer, 'outer/inner', CreateEmptyFolderConfig('f2'), true);
    const other = new FolderNode(root, 'other', CreateEmptyFolderConfig('f3'), true);
    root.children.push(outer, other);

    const mk = (parent: any, file: string, name: string, runs: string[] = []) => {
        const node = new RequestNode(parent, file, { ...CreateEmptyAction(), id: name, name, runs: runs.map(r => run(`${name}-${r}`, r)) });
        parent.children.push(node);
        return node;
    };
    const plain = mk(outer, 'outer/plain.frreq', 'plain');
    outer.children.push(inner);
    const multi = mk(inner, 'outer/inner/multi.frreq', 'multi', ['first', 'second']);
    const elsewhere = mk(other, 'other/else.frreq', 'else');
    const top = mk(root, 'top.frreq', 'top');
    return { root, outer, plain, multi, elsewhere, top };
}

describe('scope cases', () => {
    it('gives a request without runs one case named after the request', () => {
        const { plain } = build();
        expect(casesFor(plain).map(c => [c.node, c.name])).toEqual([[plain, 'plain']]);
    });

    it('gives a request with runs one case per run, in order', () => {
        const { multi } = build();
        const cases = casesFor(multi);
        expect(cases.map(c => c.name)).toEqual(['multi › first', 'multi › second']);
        expect(cases.map(c => c.node)).toEqual(multi.runs());
    });

    it('lists a folder\'s cases including nested folders, in tree order', () => {
        const { outer } = build();
        expect(casesForScope(outer).map(c => c.name)).toEqual(['plain', 'multi › first', 'multi › second']);
    });

    it('lists every case from the root', () => {
        const { root } = build();
        const names = casesForScope(root).map(c => c.name);
        expect(names).toHaveLength(5);
        expect(names).toEqual(expect.arrayContaining(['plain', 'multi › first', 'multi › second', 'else', 'top']));
    });
});
