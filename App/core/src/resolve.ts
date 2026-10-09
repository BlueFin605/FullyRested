import { ExecuteRestAction } from './builder';
import { AuthenticationDetails, CollectionConfig, CreateEmptyRestActionValidation, ParamTable, RestAction, RestActionRun, ValidationType } from './model';

// Builds the URL the request is sent to: the action's url plus its active query parameters
// (later entries win for a repeated key). Encodes like the app's Angular serializer always
// did, but leaves {{variables}} and URL punctuation readable: spaces become '+'.
export function buildRequestUrl(url: string, params: ParamTable[]): string {
    const values = paramsAsValues(params);
    const query = Object.keys(values).map(k => `${encodeQuery(k)}=${encodeQuery(values[k]!)}`).join('&');
    const path = readable(encodeUriString(url).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/%26/gi, '&'));
    return query.length > 0 ? `${path}?${query}` : path;
}

function paramsAsValues(params: ParamTable[]): { [key: string]: string } {
    const converted: { [key: string]: string } = {};
    params.filter(f => f.active == true && f.key != '' && f.value != '').forEach(v => converted[v.key] = v.value);
    return converted;
}

function encodeUriString(s: string): string {
    return encodeURIComponent(s)
        .replace(/%40/g, '@')
        .replace(/%3A/gi, ':')
        .replace(/%24/g, '$')
        .replace(/%2C/gi, ',');
}

function encodeQuery(s: string): string {
    return readable(encodeUriString(s).replace(/%3B/gi, ';'));
}

function readable(s: string): string {
    return s
        .replace(/%40/gi, '@')
        .replace(/%3A/gi, ':')
        .replace(/%24/gi, '$')
        .replace(/%2C/gi, ',')
        .replace(/%3B/gi, ';')
        .replace(/%20/gi, '+')
        .replace(/%3D/gi, '=')
        .replace(/%3F/gi, '?')
        .replace(/%2F/gi, '/')
        .replace(/%5B/gi, '[')
        .replace(/%5D/gi, ']')
        .replace(/%7B/gi, '{')
        .replace(/%7D/gi, '}');
}

function runAuthentication(action: RestAction, run: RestActionRun): AuthenticationDetails {
    if (!run.authentication || run.authentication.authentication == 'inherit')
        return action.authentication;

    return run.authentication;
}

// The request and (optionally) one of its runs, before any environment is applied.
// A run's headers and parameters override the action's; its auth wins unless 'inherit';
// its validation wins unless Inherit.
export function resolveRequest(action: RestAction, run?: RestActionRun): ExecuteRestAction {
    const base = ExecuteRestAction.NewExecuteRestAction()
        .setVerb(action.verb)
        .setProtocol(action.protocol)
        .setBody(action.body);

    if (run == undefined) {
        return base
            .setUrl(buildRequestUrl(action.url, action.parameters ?? []))
            .setHeadersFromArray(action.headers ?? [])
            .authentication_pushBack(action.authentication)
            .setValidation(action.validation);
    }

    return base
        .setUrl(buildRequestUrl(action.url, (action.parameters ?? []).concat(run.parameters ?? [])))
        .setHeadersFromArray((action.headers ?? []).concat(run.headers ?? []))
        .authentication_pushBack(runAuthentication(action, run))
        .secrets_pushBack(run.secrets)
        .variables_pushFront(run.variables)
        .setValidation(run.validation.type != ValidationType.Inherit ? run.validation : (action.validation ?? CreateEmptyRestActionValidation(undefined)));
}

// Adds the environment then the collection: variables and secrets the request doesn't set,
// and authentication when it is still 'inherit'. environmentId defaults to the collection's
// selected environment.
export function applyEnvironment(request: ExecuteRestAction, config: CollectionConfig | undefined, environmentId?: string): ExecuteRestAction {
    const envId = environmentId ?? config?.selectedEnvironmentId;
    const env = config?.environments?.find(e => e.id == envId);
    return request
        .authentication_pushBack(env?.auth)
        .authentication_pushBack(config?.collectionEnvironment?.auth)
        .variables_pushBack(env?.variables)
        .variables_pushBack(config?.collectionEnvironment?.variables)
        .secrets_pushBack(env?.secrets)
        .secrets_pushBack(config?.collectionEnvironment?.secrets);
}

export interface ResolveOptions {
    collection: CollectionConfig | undefined;
    environmentId?: string;
    action: RestAction;
    runId?: string;
}

// The whole chain, ready for replaceVariables(): run > action > environment > collection.
export function resolveExecuteAction(options: ResolveOptions): ExecuteRestAction {
    let run: RestActionRun | undefined = undefined;
    if (options.runId != undefined) {
        run = options.action.runs.find(r => r.id == options.runId || r.name == options.runId);
        if (run == undefined)
            throw new Error(`Run '${options.runId}' not found in request '${options.action.name}'`);
    }

    return applyEnvironment(resolveRequest(options.action, run), options.collection, options.environmentId);
}
