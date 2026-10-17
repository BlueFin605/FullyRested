import { CreateEmptyActionBody, FORM_CONTENT_TYPE, FormField, RestActionBody, RestActionRun, RestTypeVerb } from '../model';
import { QueryError } from '../query-error';
import { AuthoringContext, EditResult, editScope, requestAction, upsertNamed, splitScheme } from './edit-scope';

// --- request field verbs ------------------------------------------------------------------------

// set_url and set_method take request: only. A run overrides a request's variables, secrets,
// headers, parameters, auth, validation, capture rules and body (see RestActionRun in model.ts) — it
// has no url or method of its own — so each verb says exactly that rather than leaving the caller
// to guess where the field it asked for actually lives.
const runOverrideHint = (field: string): string =>
    `a run overrides variables, secrets, headers, parameters, auth, validation, capture rules and the body, not the ${field}`;

// Sets the url of a request. Stored verbatim (it may hold `{{var}}` placeholders); a leading
// http:// or https:// is split off into protocol instead, matching newRequest (see splitScheme).
// A scheme-less url keeps whatever protocol the request already had.
export async function setUrl(ctx: AuthoringContext, scope: string, url: string): Promise<EditResult> {
    return editScope(ctx, 'set_url', scope, ['request'], target => {
        const action = requestAction(target);
        const split = splitScheme(url);

        const protocolChanged = split.protocol != undefined && action.protocol != split.protocol;
        if (action.url == split.url && !protocolChanged)
            return '';

        if (split.protocol != undefined)
            action.protocol = split.protocol;
        action.url = split.url;
        return `Set url '${split.url}' on ${scope}`;
    }, runOverrideHint('url'));
}

// Sets the method of a request. Matched case-insensitively against RestTypeVerb, same as
// newRequest, and rejected the same way when it does not match one of the six values.
export async function setMethod(ctx: AuthoringContext, scope: string, method: string): Promise<EditResult> {
    return editScope(ctx, 'set_method', scope, ['request'], target => {
        const action = requestAction(target);

        const verbs = Object.values(RestTypeVerb);
        const verb = verbs.find(v => v.toLowerCase() == method.toLowerCase());
        if (verb == undefined)
            throw new QueryError(`Unknown method '${method}' (have ${verbs.join(', ')})`);

        if (action.verb == verb)
            return '';

        action.verb = verb;
        return `Set method '${verb}' on ${scope}`;
    }, runOverrideHint('method'));
}

// Sets the body of a request, or of a run (which then overrides its request's; 'inherit' removes
// the override). 'none' clears it and ignores any content given; the form content
// type (FORM_CONTENT_TYPE) takes content.fields and stores them as FormField[], keeping the id of
// any field whose name matches one already there (same idea as upsertNamed, but over the whole
// table at once since a body replaces its fields wholesale rather than upserting one at a time);
// every other content type takes content.text and stores it verbatim. Giving fields to a type that
// takes text, or text to the form type, is a QueryError naming what that content type actually wants.
export async function setBody(
    ctx: AuthoringContext, scope: string, contentType: string, content?: { text?: string; fields?: { name: string; value: string }[] }
): Promise<EditResult> {
    if (typeof contentType != 'string' || contentType == '')
        throw new QueryError('set_body needs a content type');

    return editScope(ctx, 'set_body', scope, ['request', 'run'], target => {
        // A request always has a body (maybe 'none'); a run's is an override that may be absent,
        // which means it inherits the request's. A run set to 'none' therefore sends nothing even
        // when its request has a body, and 'inherit' removes the override again.
        const action = requestAction(target);
        const run = 'run' in target ? target.run : undefined;
        const current: RestActionBody | undefined = run ? run.body : action.body;
        const store = (body: RestActionBody | undefined): void => {
            if (run) run.body = body; else action.body = body!;
        };

        if (contentType == 'inherit') {
            if (!run)
                throw new QueryError("content type 'inherit' is for a run: it removes the run's body so the request's is used");
            if (current == undefined)
                return '';
            store(undefined);
            return `Removed the body override on ${scope}`;
        }

        if (contentType == 'none') {
            if (current?.contentType == 'none')
                return '';
            store(CreateEmptyActionBody());
            return run ? `Set ${scope} to send no body` : `Cleared the body on ${scope}`;
        }

        const existing = Array.isArray(current?.body) ? current!.body as FormField[] : [];

        if (contentType == FORM_CONTENT_TYPE) {
            if (content?.text != undefined)
                throw new QueryError(`Content type '${contentType}' takes fields, not text`);

            const fields: FormField[] = (content?.fields ?? []).map(field => {
                const match = existing.find(e => e.key == field.name);
                return { key: field.name, value: field.value, active: true, id: match?.id ?? ctx.guid.generateGUID() };
            });

            if (current?.contentType == contentType && JSON.stringify(existing) == JSON.stringify(fields))
                return '';

            store({ contentType, body: fields });
            return `Set form body on ${scope}`;
        }

        if (content?.fields != undefined)
            throw new QueryError(`Content type '${contentType}' takes text, not fields`);

        const text = content?.text ?? '';
        if (current?.contentType == contentType && current.body == text)
            return '';

        store({ contentType, body: text });
        return `Set body on ${scope}`;
    });
}

