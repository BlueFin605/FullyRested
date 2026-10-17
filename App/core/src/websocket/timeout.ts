import { QueryError } from '../query-error';

/**
 * The one rule for a websocket test's timeout, shared by the authoring verb set_expect and every run
 * override (CLI --timeout, MCP timeoutMs): a positive whole number of milliseconds. Returns the value
 * or throws a QueryError naming `label`.
 */
export function validateTimeoutMs(value: unknown, label = 'timeout'): number {
    if (typeof value != 'number' || !Number.isInteger(value) || value < 1)
        throw new QueryError(`${label} must be a positive whole number of milliseconds, not '${String(value)}'`);
    return value;
}
