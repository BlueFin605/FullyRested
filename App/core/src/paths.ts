// Paths inside a collection are '/' separated with no leading slash; '' is the collection folder.
// Hosts map them to real paths; core never touches the file system.

export function joinPath(...parts: string[]): string {
    return parts.filter(p => p != '').join('/');
}

export function dirnameOf(path: string): string {
    const i = path.lastIndexOf('/');
    return i < 0 ? '' : path.substring(0, i);
}

export function basenameOf(path: string): string {
    return path.substring(path.lastIndexOf('/') + 1);
}

export function extensionOf(name: string): string {
    const i = name.lastIndexOf('.');
    return i < 0 ? '' : name.substring(i).toLowerCase();
}

// fullPath relative to the root folder, or undefined when it is outside it.
// Separators and case are ignored when comparing (Windows paths).
export function relativePath(root: string, fullPath: string): string | undefined {
    const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
    const r = norm(root);
    const f = norm(fullPath);
    if (r == '')
        return undefined;
    if (f.toLowerCase() == r.toLowerCase())
        return '';
    if (!f.toLowerCase().startsWith(r.toLowerCase() + '/'))
        return undefined;
    return f.substring(r.length + 1);
}

// The host path of a collection-relative path, using the root's own separator
export function hostPath(root: string, path: string): string {
    const trimmed = root.replace(/[\\/]+$/, '');
    if (path == '')
        return trimmed;
    const sep = root.includes('\\') ? '\\' : '/';
    return trimmed + sep + path.split('/').join(sep);
}
