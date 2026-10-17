import {
    AuthenticationDetails, CollectionConfig, CurrentState, Environment, FolderConfig, RestAction, RestActionRun, RestActionValidation,
    ValidationType, ValidationTypeBody,
    CreateEmptyActionBody, CreateEmptyAuthenticationDetails, CreateEmptyAuthenticationDetailsAwsSig,
    CreateEmptyAuthenticationDetailsBasicAuth, CreateEmptyAuthenticationDetailsBearerToken, CreateEmptyRestActionValidation,
    WebSocketExpect, CreateEmptyWebSocketExpect, WebSocketTrigger, DEFAULT_TRIGGER_INTERVAL_MS
} from './model';
import { normaliseMcpCall } from './mcp';

// Older .frreq / .frcol files (and the saved session state) can be missing fields that
// newer versions added. These functions fill them in place and return the same object,
// so a file loaded by the app or the CLI always has the full shape.

export function normaliseAuthentication(auth: AuthenticationDetails | undefined, defaultType: string): AuthenticationDetails {
    if (auth == undefined)
        return CreateEmptyAuthenticationDetails(defaultType);

    if (auth.authentication == undefined)
        auth.authentication = defaultType;

    auth.awsSig = { ...CreateEmptyAuthenticationDetailsAwsSig(), ...auth.awsSig };
    auth.basicAuth = { ...CreateEmptyAuthenticationDetailsBasicAuth(), ...auth.basicAuth };
    auth.bearerToken = { ...CreateEmptyAuthenticationDetailsBearerToken(), ...auth.bearerToken };
    return auth;
}

export function normaliseValidation(validation: RestActionValidation | undefined): RestActionValidation {
    if (validation == undefined)
        return CreateEmptyRestActionValidation(undefined);

    if (validation.type == undefined)
        validation.type = ValidationType.None;

    if (validation.headers == undefined)
        validation.headers = [];

    if (validation.body == undefined)
        validation.body = ValidationTypeBody.None;

    if (validation.httpCode == undefined)
        validation.httpCode = 200;

    return validation;
}

export function normaliseRun(run: RestActionRun): RestActionRun {
    run.variables = run.variables ?? [];
    run.secrets = run.secrets ?? [];
    run.headers = run.headers ?? [];
    run.parameters = run.parameters ?? [];
    run.authentication = normaliseAuthentication(run.authentication, 'inherit');
    run.validation = normaliseValidation(run.validation);
    return run;
}

export function normaliseAction(action: RestAction): RestAction {
    action.headers = action.headers ?? [];
    action.parameters = action.parameters ?? [];
    action.authentication = normaliseAuthentication(action.authentication, 'inherit');
    action.validation = normaliseValidation(action.validation);
    action.runs = (action.runs ?? []).map(normaliseRun);

    // Very old files stored the body as a bare string; those are not carried over
    if (action.body == undefined || typeof (action.body) == "string")
        action.body = CreateEmptyActionBody();

    // HTTP requests (type missing or 'http') stay exactly as they were on disk; only websocket
    // requests get the extra fields filled in.
    if (action.type == 'websocket') {
        action.message = action.message ?? '';
        action.expect = normaliseExpect(action.expect);
        if (action.trigger != undefined)
            action.trigger = normaliseTrigger(action.trigger);
        action.authentication.placement = action.authentication.placement ?? 'header';
    }
    if (action.type == 'mcp')
        action.mcp = normaliseMcpCall(action.mcp);

    return action;
}

export function normaliseExpect(expect: Partial<WebSocketExpect> | undefined): WebSocketExpect {
    const defined = Object.fromEntries(Object.entries(expect ?? {}).filter(([, v]) => v !== undefined));
    return { ...CreateEmptyWebSocketExpect(), ...defined };
}

export function normaliseTrigger(trigger: Partial<WebSocketTrigger> & { request: string }): WebSocketTrigger {
    const defined = Object.fromEntries(Object.entries(trigger).filter(([, v]) => v !== undefined));
    return { repeat: 'until-done', interval: DEFAULT_TRIGGER_INTERVAL_MS, delay: 0, ...defined } as WebSocketTrigger;
}

export function normaliseEnvironment(env: Environment): Environment {
    env.variables = env.variables ?? [];
    env.secrets = env.secrets ?? [];
    env.headers = env.headers ?? [];
    env.auth = normaliseAuthentication(env.auth, 'inherit');
    return env;
}

export function normaliseFolderConfig(config: FolderConfig): FolderConfig {
    config.folderId = config.folderId ?? '';
    config.variables = config.variables ?? [];
    config.secrets = config.secrets ?? [];
    config.headers = config.headers ?? [];
    config.auth = normaliseAuthentication(config.auth, 'inherit');
    return config;
}

export function normaliseCollectionConfig(config: CollectionConfig): CollectionConfig {
    config.collectionEnvironment = normaliseEnvironment(config.collectionEnvironment ?? { name: 'system.settings', id: '', variables: [], secrets: [], headers: [], auth: CreateEmptyAuthenticationDetails('none') });
    config.environments = (config.environments ?? []).map(normaliseEnvironment);
    config.selectedEnvironmentId = config.selectedEnvironmentId ?? '';
    return config;
}

export function normaliseCurrentState(state: CurrentState): CurrentState {
    state.sessions = state.sessions ?? [];
    state.recentCollections = state.recentCollections ?? [];
    state.sessions.forEach(s => (s.actions ?? []).forEach(a => normaliseAction(a.action)));
    return state;
}
