import { ExecuteRestAction } from './builder';
import {
    AuthenticationDetails, CollectionConfig, CreateEmptyRestActionValidation, FolderConfig, HeaderTable, REConstants,
    RestAction, RestActionRun, ScopeSettings, SecretTable, ValidationType, VariableTable
} from './model';
import { basenameOf, dirnameOf, extensionOf, joinPath } from './paths';
import { buildRequestUrl } from './resolve';
import { Captured, mergeCaptureRules } from './capture';
import { CaptureRule } from './model';

// A collection is a tree: the collection, its folders, their requests and each request's runs.
// Every level can set variables, secrets, auth and headers; a request inherits from the levels above it,
// nearest first: run → request → folders (nearest first) → selected environment → collection.

export type ScopeKind = 'collection' | 'environment' | 'folder' | 'request' | 'run';

// Where an inherited value was set
export interface SettingSource {
    kind: ScopeKind;
    name: string;
}

export interface ScopeLayer {
    source: SettingSource;
    settings: Partial<ScopeSettings>;
}

export interface ResolveContext {
    environmentId?: string;   // defaults to the collection's selected environment
    captured?: Captured;      // values earlier requests in this run captured; they override every other level
}

export interface EffectiveValue<T> {
    value: T;
    source: SettingSource;
    overridden: boolean;      // a nearer level sets the same name
}

export interface EffectiveSettings {
    headers: EffectiveValue<HeaderTable>[];
    variables: EffectiveValue<VariableTable>[];
    secrets: EffectiveValue<SecretTable>[];
    auth: EffectiveValue<AuthenticationDetails> | undefined;
}

// A file that could not be read. It stays in the tree so the failure is reported, never skipped.
export interface LoadError {
    file: string;
    message: string;
}

// Merges layers given nearest first. Every active row is listed; rows a nearer layer already set are marked overridden.
export function mergeLayers(layers: ScopeLayer[]): EffectiveSettings {
    return {
        headers: collect(layers, l => l.settings.headers, r => r.key.toLowerCase(), r => r.active && r.key != '' && r.value != ''),
        variables: collect(layers, l => l.settings.variables, r => r.variable, r => r.active && r.variable != ''),
        secrets: collect(layers, l => l.settings.secrets, r => r.$secret, r => r.active && r.$secret != ''),
        auth: firstAuth(layers)
    };
}

function collect<T>(layers: ScopeLayer[], rows: (layer: ScopeLayer) => T[] | undefined, key: (row: T) => string, use: (row: T) => boolean): EffectiveValue<T>[] {
    const seen = new Set<string>();
    const values: EffectiveValue<T>[] = [];
    for (const layer of layers) {
        const used = (rows(layer) ?? []).filter(use);
        // within one layer the last row for a key wins; across layers the nearest does
        const last = new Map<string, number>();
        used.forEach((row, i) => last.set(key(row), i));
        used.forEach((row, i) => values.push({ value: row, source: layer.source, overridden: seen.has(key(row)) || last.get(key(row)) !== i }));
        used.forEach(row => seen.add(key(row)));
    }
    return values;
}

// The first level that does not say 'inherit' decides; 'none' therefore stops the search
function firstAuth(layers: ScopeLayer[]): EffectiveValue<AuthenticationDetails> | undefined {
    for (const layer of layers) {
        const auth = layer.settings.auth;
        if (auth != undefined && auth.authentication != 'inherit')
            return { value: auth, source: layer.source, overridden: false };
    }
    return undefined;
}

function winners<T>(values: EffectiveValue<T>[]): T[] {
    return values.filter(v => !v.overridden).map(v => v.value);
}

function toExecute(action: RestAction, run: RestActionRun | undefined, layers: ScopeLayer[], captured: Captured | undefined): ExecuteRestAction {
    const effective = mergeLayers(layers);
    const params = run == undefined ? action.parameters : action.parameters.concat(run.parameters);
    const validation = run != undefined && run.validation.type != ValidationType.Inherit
        ? run.validation
        : (action.validation ?? CreateEmptyRestActionValidation(undefined));

    return ExecuteRestAction.NewExecuteRestAction()
        .setVerb(action.verb)
        .setProtocol(action.protocol)
        .setBody(action.body)
        .setUrl(buildRequestUrl(action.url, params))
        .setHeaders(Object.fromEntries(winners(effective.headers).map(h => [h.key, h.value])))
        .authentication_pushBack(effective.auth?.value)
        .variables_pushBack(winners(effective.variables))
        .variables_pushFront(captured)
        .secrets_pushBack(winners(effective.secrets))
        .setValidation(validation);
}

export abstract class ScopeNode {
    abstract readonly kind: ScopeKind;
    loadError: LoadError | undefined = undefined;

    constructor(public parent: ScopeNode | undefined) { }

    abstract get name(): string;
    // Relative to the collection folder; '' for the collection itself
    abstract get path(): string;
    // This level's settings, nearest first (the collection gives two: the environment, then its own)
    abstract layers(context: ResolveContext): ScopeLayer[];

    // This node, then its parents up to the collection
    ancestors(): ScopeNode[] {
        const chain: ScopeNode[] = [];
        for (let node: ScopeNode | undefined = this; node != undefined; node = node.parent)
            chain.push(node);
        return chain;
    }

    // Every layer that applies here, nearest first
    chain(context: ResolveContext): ScopeLayer[] {
        this.assertLoaded();
        return this.ancestors().flatMap(n => n.layers(context));
    }

    assertLoaded(): void {
        const broken = this.ancestors().find(n => n.loadError != undefined);
        if (broken?.loadError != undefined)
            throw new Error(`Cannot resolve '${this.name}': ${broken.loadError.file} is invalid: ${broken.loadError.message}`);
    }

    effectiveSettings(context: ResolveContext = {}): EffectiveSettings {
        return mergeLayers(this.chain(context));
    }
}

export abstract class ContainerNode extends ScopeNode {
    children: (FolderNode | RequestNode)[] = [];

    // Every request below, depth first in child order (as the explorer shows them)
    requestNodes(): RequestNode[] {
        return this.children.flatMap(c => c instanceof FolderNode ? c.requestNodes() : [c]);
    }

    folderNodes(): FolderNode[] {
        return this.children.flatMap(c => c instanceof FolderNode ? [c, ...c.folderNodes()] : []);
    }

    // The node at a collection-relative path at or below this one
    find(path: string): ScopeNode | undefined {
        if (path == this.path)
            return this;
        for (const child of this.children) {
            if (child.path == path)
                return child;
            if (child instanceof FolderNode && path.startsWith(child.path + '/'))
                return child.find(path);
        }
        return undefined;
    }
}

export class CollectionNode extends ContainerNode {
    readonly kind = 'collection';
    // Problems that didn't stop loading, e.g. an ignored folder.frfolder next to the collection file
    warnings: string[] = [];

    constructor(public config: CollectionConfig, public fileName: string) {
        super(undefined);
    }

    get name(): string {
        const ext = extensionOf(this.fileName);
        return ext == '' ? this.fileName : this.fileName.substring(0, this.fileName.length - ext.length);
    }

    get path(): string {
        return '';
    }

    layers(context: ResolveContext): ScopeLayer[] {
        const envId = context.environmentId ?? this.config.selectedEnvironmentId;
        const env = this.config.environments.find(e => e.id == envId);
        const layers: ScopeLayer[] = [];
        if (env != undefined)
            layers.push({ source: { kind: 'environment', name: env.name }, settings: env });
        layers.push({ source: { kind: 'collection', name: this.name }, settings: this.config.collectionEnvironment });
        return layers;
    }

    // The nearest loaded folder containing a collection-relative file path
    folderFor(filePath: string): ContainerNode {
        for (let dir = dirnameOf(filePath); dir != ''; dir = dirnameOf(dir)) {
            const node = this.find(dir);
            if (node instanceof ContainerNode)
                return node;
        }
        return this;
    }

    // A node for a request held elsewhere (an open tab), placed under the folder its file is in.
    // Without a path (unsaved, or outside the collection folder) it inherits from the collection only.
    // The node is not added to the tree.
    attach(action: RestAction, filePath: string | undefined): RequestNode {
        return new RequestNode(filePath == undefined ? this : this.folderFor(filePath), filePath ?? '', action);
    }
}

export class FolderNode extends ContainerNode {
    readonly kind = 'folder';

    constructor(parent: ContainerNode, private readonly folderPath: string, public config: FolderConfig, public hasSettingsFile: boolean) {
        super(parent);
    }

    get name(): string {
        return basenameOf(this.folderPath);
    }

    get path(): string {
        return this.folderPath;
    }

    get settingsFile(): string {
        return joinPath(this.folderPath, REConstants.FolderSettingsFile);
    }

    layers(): ScopeLayer[] {
        return [{ source: { kind: 'folder', name: this.folderPath }, settings: this.config }];
    }
}

export class RequestNode extends ScopeNode {
    readonly kind = 'request';

    constructor(parent: ScopeNode, private readonly filePath: string, public action: RestAction) {
        super(parent);
    }

    get name(): string {
        if (this.action.name)
            return this.action.name;
        const file = basenameOf(this.filePath);
        return file.substring(0, file.length - extensionOf(file).length);
    }

    get path(): string {
        return this.filePath;
    }

    layers(): ScopeLayer[] {
        return [{ source: { kind: 'request', name: this.name }, settings: { headers: this.action.headers, auth: this.action.authentication } }];
    }

    captureRules(): CaptureRule[] {
        return this.action.capture ?? [];
    }

    runs(): RunNode[] {
        return this.action.runs.map(r => new RunNode(this, r));
    }

    run(idOrName: string): RunNode {
        const run = this.action.runs.find(r => r.id == idOrName || r.name == idOrName);
        if (run == undefined)
            throw new Error(`Run '${idOrName}' not found in request '${this.name}'`);
        return new RunNode(this, run);
    }

    // The request ready for replaceVariables(): everything it inherits applied
    resolve(context: ResolveContext = {}): ExecuteRestAction {
        return toExecute(this.action, undefined, this.chain(context), context.captured);
    }
}

export class RunNode extends ScopeNode {
    readonly kind = 'run';

    constructor(public request: RequestNode, public run: RestActionRun) {
        super(request);
    }

    get name(): string {
        return `${this.request.name} › ${this.run.name}`;
    }

    get path(): string {
        return this.request.path;
    }

    layers(): ScopeLayer[] {
        const run = this.run;
        return [{ source: { kind: 'run', name: run.name }, settings: { variables: run.variables, secrets: run.secrets, headers: run.headers, auth: run.authentication } }];
    }

    // The request's rules with this run's laid over them
    captureRules(): CaptureRule[] {
        return mergeCaptureRules(this.request.action.capture, this.run.capture);
    }

    resolve(context: ResolveContext = {}): ExecuteRestAction {
        return toExecute(this.request.action, this.run, this.chain(context), context.captured);
    }
}
