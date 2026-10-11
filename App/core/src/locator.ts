import { QueryError } from './query-error';

// The single string every settings verb takes to say what it is editing.
// This module only parses the string; resolving it against a loaded
// collection tree is a separate step.
export type LocatorKind = 'collection' | 'environment' | 'folder' | 'request' | 'run';

export interface Locator {
    kind: LocatorKind;
    name?: string;   // environment name or id
    path?: string;   // folder path, or request file path (collection-relative)
    run?: string;    // run name or id
}

export const LOCATOR_FORMS =
    "collection | env:<name> | folder:<path> | request:<request path> | run:<request path>#<run name>";

// Backslashes to '/', then strip a leading './' or '/'.
function normalisePath(path: string): string {
    const slashed = path.replace(/\\/g, '/');
    const stripped = slashed.startsWith('./') ? slashed.slice(2) : slashed.startsWith('/') ? slashed.slice(1) : slashed;
    return stripped.endsWith('/') ? stripped.slice(0, -1) : stripped;
}

export function parseLocator(text: string): Locator {
    const trimmed = text.trim();

    if (trimmed.toLowerCase() === 'collection') return { kind: 'collection' };

    const colon = trimmed.indexOf(':');
    if (colon < 0) throw new QueryError(`Unrecognised locator '${text}'; expected one of: ${LOCATOR_FORMS}`);

    const prefix = trimmed.slice(0, colon).toLowerCase();
    const rest = trimmed.slice(colon + 1);

    switch (prefix) {
        case 'env': {
            if (rest === '') throw new QueryError("An 'env:' locator needs a name, e.g. env:Production");
            return { kind: 'environment', name: rest };
        }
        case 'folder': {
            if (rest === '') throw new QueryError("A 'folder:' locator needs a path, e.g. folder:users");
            const path = normalisePath(rest);
            if (path === '' || path === '.')
                throw new QueryError(
                    "collection-wide settings belong in the collection file; use the 'collection' locator"
                );
            return { kind: 'folder', path };
        }
        case 'request': {
            if (rest === '') throw new QueryError("A 'request:' locator needs a path, e.g. request:users/get.frreq");
            return { kind: 'request', path: normalisePath(rest) };
        }
        case 'run': {
            const hash = rest.lastIndexOf('#');
            if (hash < 0 || rest.slice(hash + 1) === '')
                throw new QueryError(
                    "A 'run:' locator needs a run name, e.g. run:users/get.frreq#not found"
                );
            return { kind: 'run', path: normalisePath(rest.slice(0, hash)), run: rest.slice(hash + 1) };
        }
        default:
            throw new QueryError(`Unrecognised locator '${text}'; expected one of: ${LOCATOR_FORMS}`);
    }
}
