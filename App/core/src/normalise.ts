import {
    AuthenticationDetails, CollectionConfig, CurrentState, Environment, RestAction, RestActionRun, RestActionValidation,
    ValidationType, ValidationTypeBody,
    CreateEmptyActionBody, CreateEmptyAuthenticationDetails, CreateEmptyAuthenticationDetailsAwsSig,
    CreateEmptyAuthenticationDetailsBasicAuth, CreateEmptyAuthenticationDetailsBearerToken, CreateEmptyRestActionValidation
} from './model';

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

    return action;
}

export function normaliseEnvironment(env: Environment): Environment {
    env.variables = env.variables ?? [];
    env.secrets = env.secrets ?? [];
    env.auth = normaliseAuthentication(env.auth, 'inherit');
    return env;
}

export function normaliseCollectionConfig(config: CollectionConfig): CollectionConfig {
    config.collectionEnvironment = normaliseEnvironment(config.collectionEnvironment ?? { name: 'system.settings', id: '', variables: [], secrets: [], auth: CreateEmptyAuthenticationDetails('none') });
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
