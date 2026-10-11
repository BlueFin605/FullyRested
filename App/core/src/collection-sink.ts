import { joinPath } from './paths';
import { CollectionSource, DirEntry } from './tree';

// The write sibling of CollectionSource. Core declares the interface; hosts implement it.
// Paths are collection-relative, '/' separated, no leading slash; '' is the collection folder.
export interface CollectionSink {
    writeText(path: string, text: string): Promise<void>;
    mkdir(path: string): Promise<void>;
    remove(path: string): Promise<void>; // a file, or a directory and everything under it
    exists(path: string): Promise<boolean>;
}

// Name of the immediate child of dir on path, or undefined when path is not under dir.
function immediateChild(dir: string, path: string): string | undefined {
    if (dir == '') {
        if (path == '') return undefined;
        const i = path.indexOf('/');
        return i < 0 ? path : path.substring(0, i);
    }
    if (!path.startsWith(dir + '/')) return undefined;
    const rest = path.substring(dir.length + 1);
    const i = rest.indexOf('/');
    return i < 0 ? rest : rest.substring(0, i);
}

// In-memory test double: one object is both a CollectionSource and a CollectionSink.
export class MemoryCollectionSink implements CollectionSink, CollectionSource {
    readonly files: Map<string, string>;
    private readonly dirs = new Set<string>();

    constructor(files: Record<string, string> = {}) {
        this.files = new Map(Object.entries(files));
    }

    async listDir(dir: string): Promise<DirEntry[]> {
        const byName = new Map<string, boolean>();

        for (const key of this.files.keys()) {
            const child = immediateChild(dir, key);
            if (child === undefined) continue;
            const isDirectory = joinPath(dir, child) != key;
            if (isDirectory || !byName.has(child)) byName.set(child, isDirectory || byName.get(child) === true);
        }
        for (const d of this.dirs) {
            const child = immediateChild(dir, d);
            if (child === undefined) continue;
            byName.set(child, true);
        }

        return [...byName.entries()]
            .map(([name, isDirectory]) => ({ name, isDirectory }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    async readText(file: string): Promise<string> {
        const text = this.files.get(file);
        if (text === undefined) throw new Error(`Cannot read ${file}: not found`);
        return text;
    }

    async writeText(file: string, text: string): Promise<void> {
        this.files.set(file, text);
    }

    async mkdir(dir: string): Promise<void> {
        this.dirs.add(dir);
    }

    async remove(path: string): Promise<void> {
        if (this.files.has(path)) {
            this.files.delete(path);
            return;
        }
        for (const key of [...this.files.keys()])
            if (key == path || key.startsWith(path + '/')) this.files.delete(key);
        for (const d of [...this.dirs])
            if (d == path || d.startsWith(path + '/')) this.dirs.delete(d);
    }

    async exists(path: string): Promise<boolean> {
        if (path == '') return true;
        if (this.files.has(path)) return true;
        for (const key of this.files.keys())
            if (key.startsWith(path + '/')) return true;
        for (const d of this.dirs)
            if (d == path || d.startsWith(path + '/')) return true;
        return false;
    }
}
