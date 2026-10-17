import {
    CreateEmptyAction, CreateEmptyCollectionConfig, CreateEmptyEnvironment, CreateEmptyRestActionRun, Environment, REConstants, RestActionRun, RestTypeVerb, ValidationType
} from '../model';
import { normaliseCollectionConfig } from '../normalise';
import { basenameOf, dirnameOf, extensionOf } from '../paths';
import { QueryError } from '../query-error';
import { AuthoringContext, EditResult, editScope, writeDocument, splitScheme } from './edit-scope';
import { parseProtocol } from './request-fields';


// Writes a brand-new .frcol. This is the one verb that runs with no collection loaded, so it
// never reads ctx.collectionFile; `file` is the collection-relative name to create.
export async function newCollection(ctx: AuthoringContext, file: string, environments: string[] = []): Promise<EditResult> {
    if (extensionOf(file) != REConstants.CollectionExtension)
        throw new QueryError(`new_collection needs a name ending in ${REConstants.CollectionExtension} (given ${file})`);
    if (await ctx.sink.exists(file))
        throw new QueryError(`${file} already exists`);

    const config = CreateEmptyCollectionConfig(ctx.guid);
    config.environments = environments.map(name => ({ ...CreateEmptyEnvironment(), name, id: ctx.guid.generateGUID() }));
    if (config.environments.length > 0)
        config.selectedEnvironmentId = config.environments[0].id;

    normaliseCollectionConfig(config);
    await writeDocument(ctx, file, config);
    return { file, scope: file, changed: true, message: `Created collection ${file}` };
}

// Adds an environment to the loaded collection. Selects it when the collection had none at all.
export async function newEnvironment(ctx: AuthoringContext, name: string): Promise<EditResult> {
    return editScope(ctx, 'new_environment', 'collection', ['collection'], target => {
        if (target.document != 'collection')
            throw new Error('wrong target');

        const existing = target.config.environments.find(e => e.name == name);
        if (existing != undefined) {
            const names = target.config.environments.map(e => e.name).join(', ');
            throw new QueryError(`Environment '${name}' already exists (have ${names})`);
        }

        const hadNone = target.config.environments.length == 0;
        const environment: Environment = { ...CreateEmptyEnvironment(), name, id: ctx.guid.generateGUID() };
        target.config.environments.push(environment);
        if (hadNone)
            target.config.selectedEnvironmentId = environment.id;

        return `Added environment '${name}'`;
    });
}

// Switches which environment of the loaded collection is selected, by name or id.
export async function selectEnvironment(ctx: AuthoringContext, name: string): Promise<EditResult> {
    return editScope(ctx, 'select_environment', 'collection', ['collection'], target => {
        if (target.document != 'collection')
            throw new Error('wrong target');

        const environment = target.config.environments.find(e => e.id == name || e.name == name);
        if (environment == undefined) {
            const names = target.config.environments.map(e => e.name).join(', ');
            throw new QueryError(`Environment '${name}' is not in the collection (have ${names})`);
        }

        if (target.config.selectedEnvironmentId == environment.id)
            return '';

        target.config.selectedEnvironmentId = environment.id;
        return `Selected environment '${environment.name}'`;
    });
}

// Makes a folder on disk. Writes no folder.frfolder: a folder needs one only once it has
// settings, and editScope creates it on demand (see readDocument).
export async function newFolder(ctx: AuthoringContext, path: string): Promise<EditResult> {
    if (path == '' || path == '.')
        throw new QueryError(`new_folder needs a path (given '${path}')`);
    if (await ctx.sink.exists(path))
        throw new QueryError(`${path} already exists`);

    await ctx.sink.mkdir(path);
    return { file: path, scope: path, changed: true, message: `Created folder ${path}` };
}


// firing or displaying the request, so leaving the scheme in url would double it up).
export async function newRequest(ctx: AuthoringContext, path: string, method: string, url: string, protocol?: string): Promise<EditResult> {
    // An explicit protocol (for a url like {{baseUrl}}/pages whose scheme a variable cannot carry)
    // wins over a scheme in the url.
    const explicit = protocol == undefined || protocol == '' ? undefined : parseProtocol(protocol);
    if (extensionOf(path) != REConstants.ActionExtension)
        throw new QueryError(`new_request needs a name ending in ${REConstants.ActionExtension} (given ${path})`);
    if (await ctx.sink.exists(path))
        throw new QueryError(`${path} already exists`);

    const verbs = Object.values(RestTypeVerb);
    const verb = verbs.find(v => v.toLowerCase() == method.toLowerCase());
    if (verb == undefined)
        throw new QueryError(`Unknown method '${method}' (have ${verbs.join(', ')})`);

    const action = CreateEmptyAction();
    action.id = ctx.guid.generateGUID();
    action.name = basenameOf(path).slice(0, -extensionOf(path).length);
    action.verb = verb;
    const split = splitScheme(url);
    if (split.protocol != undefined)
        action.protocol = split.protocol;
    if (explicit != undefined)
        action.protocol = explicit;
    action.url = split.url;

    const dir = dirnameOf(path);
    if (!(await ctx.sink.exists(dir)))
        await ctx.sink.mkdir(dir);

    await writeDocument(ctx, path, action);
    return { file: path, scope: path, changed: true, message: `Created request ${path}` };
}



// Adds a run to the request at `request` (a collection-relative .frreq path). The run inherits
// the request's validation until something sets its own, matching what the app does when you
// add a run from the editor.
export async function newRun(ctx: AuthoringContext, request: string, name: string): Promise<EditResult> {
    if (name == '')
        throw new QueryError(`new_run needs a name (given '${name}')`);

    return editScope(ctx, 'new_run', `request:${request}`, ['request'], target => {
        if (target.document != 'request')
            throw new Error('wrong target');

        const existing = target.action.runs.find(r => r.name == name);
        if (existing != undefined) {
            const names = target.action.runs.map(r => r.name).join(', ');
            throw new QueryError(`Run '${name}' already exists (have ${names})`);
        }

        const run: RestActionRun = CreateEmptyRestActionRun(ctx.guid, ValidationType.Inherit);
        run.name = name;
        target.action.runs.push(run);

        return `Added run '${name}'`;
    });
}

