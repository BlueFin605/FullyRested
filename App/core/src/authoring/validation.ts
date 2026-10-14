import { inferSchema } from '../infer';
import { LocatorKind } from '../locator';
import {
    HeaderTable, RestAction, RestActionRun, RestActionValidation, RestActionValidationJsonSchema, ValidationType, ValidationTypeBody
} from '../model';
import { normaliseAction } from '../normalise';
import { findCase, resolveRun } from '../query';
import { QueryError } from '../query-error';
import { RunStore } from '../run-store';
import { compileSchema } from '../validate';
import {
    AuthoringContext, EditResult, scopeTarget, editScope, SETTING_LOCATORS, requestSettings, sameName, upsertNamed, resolveTarget
} from './edit-scope';

// --- validation verbs ---------------------------------------------------------------------------

// Both locators a request's validation can be edited through: a request: or run: locator, never
// the other three — validation lives on RestAction and RestActionRun alone.
const VALIDATION_LOCATORS: LocatorKind[] = ['request', 'run'];

// The fields of a validation a caller may touch. Each is optional so a single call can set only
// what it means to change — see setValidation.
export interface ValidationFields {
    type?: string;         // a ValidationType value, case-insensitive
    httpCode?: number;
    body?: string;         // a ValidationTypeBody value, case-insensitive
    jsonSchema?: string;   // the schema as a string, as RestActionValidationJsonSchema stores it
}

// Matches `given` against one of an enum's values without regard to case; an unknown value is a
// QueryError listing the ones it does take, the same shape as setAuth's and setMethod's rejections.
function matchEnumValue<T extends string>(values: T[], given: string, label: string): T {
    const match = values.find(value => value.toLowerCase() == given.toLowerCase());
    if (match == undefined)
        throw new QueryError(`Unknown validation ${label} '${given}' (have ${values.join(', ')})`);
    return match;
}

// Parses and compiles a schema up front, before editScope touches any file, so a bad schema never
// gets as far as a half-written document. Reuses validate.ts's Ajv setup (compileSchema) rather
// than building a second one; an uncompilable schema would otherwise make every run of the request
// fail with a confusing error at send time instead of a clear one now, at the point it was set.
function parseJsonSchema(text: string): RestActionValidationJsonSchema {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw new QueryError(`jsonSchema is not valid JSON: ${(error as Error).message}`);
    }

    try {
        compileSchema(parsed as object);
    } catch (error) {
        throw new QueryError(`jsonSchema does not compile: ${(error as Error).message}`);
    }

    return { schema: text };
}

// Sets the validation of a request or run. Starts from what is already there — already
// normalised, since scopeTarget runs the whole document through normaliseAction/normaliseRun
// before apply() is called — and applies only the fields given: setting httpCode alone leaves an
// existing schema untouched. type and body are matched
// case-insensitively against ValidationType and ValidationTypeBody; jsonSchema given with no body
// implies body: 'JsonSchema', and body: 'None' clears jsonSchema to undefined — both so an agent
// cannot leave a half-configured check (a schema nothing checks against, or a body check with no
// schema). All of fields.type/body/jsonSchema are validated before editScope runs, so a rejection
// never touches the file, matching setAuth and setMethod.
export async function setValidation(ctx: AuthoringContext, scope: string, fields: ValidationFields): Promise<EditResult> {
    const type = fields.type == undefined ? undefined : matchEnumValue(Object.values(ValidationType), fields.type, 'type');
    const body = fields.body == undefined ? undefined : matchEnumValue(Object.values(ValidationTypeBody), fields.body, 'body');
    const jsonSchema = fields.jsonSchema == undefined ? undefined : parseJsonSchema(fields.jsonSchema);

    return editScope(ctx, 'set_validation', scope, VALIDATION_LOCATORS, target => {
        const before = JSON.parse(JSON.stringify(requestSettings(target).validation));
        const validation = JSON.parse(JSON.stringify(before)) as RestActionValidation;

        if (type != undefined)
            validation.type = type;
        if (fields.httpCode != undefined)
            validation.httpCode = fields.httpCode;
        if (body != undefined)
            validation.body = body;
        if (jsonSchema != undefined) {
            validation.jsonSchema = jsonSchema;
            if (fields.body == undefined)
                validation.body = ValidationTypeBody.JsonSchema;
        }
        if (body == ValidationTypeBody.None)
            validation.jsonSchema = undefined;

        if (JSON.stringify(validation) == JSON.stringify(before))
            return '';

        requestSettings(target).validation = validation;
        return `Set validation on ${scope}`;
    });
}

// Sets (or adds) a header the response must have, on a request's or run's validation. Matched
// case-insensitively on the header name, like setHeader; removeSetting(…, 'validation-header', …)
// removes from the same validation.headers array this upserts into.
//
// `enabled` works exactly as setHeader's does — written unconditionally, so an omitted flag means
// true and re-enables a row that was off. A header check is a HeaderTable row like any other and
// validateHeaders skips an inactive one, so this is how an agent parks a check without deleting it.
export async function setValidationHeader(
    ctx: AuthoringContext, scope: string, name: string, value: string, enabled: boolean = true
): Promise<EditResult> {
    return editScope(ctx, 'set_validation_header', scope, SETTING_LOCATORS['validation-header'], target => {
        const entry: HeaderTable = { key: name, value, active: enabled, id: ctx.guid.generateGUID() };
        if (!upsertNamed(requestSettings(target).validation.headers, 'key', name, entry, sameName))
            return '';

        return `Set validation header '${name}' on ${scope}`;
    });
}

// Turns an inferred schema into the "...and ..." clause of validationFromCase's success message.
function describeSchema(schema: Record<string, unknown>): string {
    if (schema['type'] === 'object') {
        const count = Object.keys((schema['properties'] as object | undefined) ?? {}).length;
        return `a JSON body of ${count} propert${count === 1 ? 'y' : 'ies'}`;
    }
    if (schema['type'] === 'array')
        return 'a JSON array body';
    return `a JSON body of type ${schema['type']}`;
}

const SET_VALIDATION_HINT = 'use set_validation to set it by hand instead';

// Learns a validation from one recorded case of a run: the HTTP status it got back, plus a JSON
// Schema inferred (inferSchema, infer.ts) from its response body. This is the only authoring verb
// that reads the run store - `stores` is supplied by the host, exactly as the query functions
// (resolveRun, findCase, both reused unchanged from query.ts) already take it, so core still owns
// no storage.
//
// `type` depends on whether the TARGET already has validation headers of its own (HeadersBody) or
// not (Body) - read here via resolveTarget (the same read editScope does for every other verb)
// rather than from the recorded case, since setValidation's ValidationFields has no "whatever the
// headers already imply" option. The actual write goes through setValidation so its Ajv compile
// check still runs over the inferred schema; this function only decides what fields to give it.
export async function validationFromCase(
    ctx: AuthoringContext, stores: RunStore[], scope: string, caseRef: string | number, runId?: string
): Promise<EditResult> {
    const { target } = await resolveTarget(ctx, 'validation_from_case', scope, VALIDATION_LOCATORS);
    const hasOwnHeaders = requestSettings(target).validation.headers.length > 0;

    const run = await resolveRun(stores, runId);
    const c = findCase(run, caseRef);

    if (c.outcome === 'error')
        throw new QueryError(`case ${c.index} errored (no response to learn from): ${c.error}; ${SET_VALIDATION_HINT}.`);
    if (!c.response)
        throw new QueryError(`case ${c.index} got no response to learn from; ${SET_VALIDATION_HINT}.`);

    const body = c.response.body;
    const contentType = body?.contentType ?? 'none';
    let parsed: unknown;
    try {
        if (body?.text === undefined)
            throw new Error('no text');
        parsed = JSON.parse(body.text);
    } catch {
        throw new QueryError(`case ${c.index}'s response body is not JSON (content-type ${contentType}); ${SET_VALIDATION_HINT}.`);
    }

    const schema = inferSchema(parsed) as Record<string, unknown>;
    const type = hasOwnHeaders ? ValidationType.HeadersBody : ValidationType.Body;

    const result = await setValidation(ctx, scope, {
        type,
        httpCode: c.response.status,
        body: ValidationTypeBody.JsonSchema,
        jsonSchema: JSON.stringify(schema, null, 2)
    });

    // setValidation (via editScope) reports changed: false, with its own "already in the
    // asked-for state" message, when the inferred validation matches what is already there.
    // Keep that pairing intact rather than overwriting it with the "learned" message below,
    // which would otherwise claim something changed when it did not.
    if (!result.changed)
        return result;

    const message =
        `Set validation on ${scope} from run ${run.runId} case ${c.index}: expect ${c.response.status} and ${describeSchema(schema)}`;
    return { ...result, message };
}

