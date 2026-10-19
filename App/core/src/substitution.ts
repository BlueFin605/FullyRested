import { SecretTable, VariableTable } from './model';

// {{name}} is a variable, {{$name}} is a secret.
// '-' and '_' are accepted because nothing stops a name being declared with them -- addSecretRef and the
// desktop editor both take any string -- and a name the placeholder cannot match resolves to '' instead,
// sending an empty credential with no warning anywhere. A name holding anything else still cannot
// substitute, so declaring one is reported by warnUnsubstitutableNames() when the collection loads.
const NAME = '[0-9a-zA-Z_-]';
const PLACEHOLDER = new RegExp(`\\{\\{(\\$?${NAME}*?)\\}\\}`, 'g');

// True when a declared variable or secret name can actually be matched inside {{...}}
export function canSubstitute(name: string): boolean {
  return new RegExp(`^${NAME}*$`).test(name);
}

// Built-in values, written {{$guid}} like a secret. A secret of the same name wins, so declaring one
// named 'guid' keeps working. The value is generated once per BuiltIns, so a request sees the same
// guid in its url, body and validation; a new BuiltIns (one per request sent) gives a new value.
export type BuiltIns = Map<string, string>;

const BUILT_INS: { [name: string]: () => string } = {
  guid: () => globalThis.crypto.randomUUID(),
  timestamp: () => String(Date.now())
};

export const BUILT_IN_NAMES = Object.keys(BUILT_INS);

export function newBuiltIns(): BuiltIns {
  return new Map();
}

function builtIn(name: string, builtins: BuiltIns): string | undefined {
  const make = Object.prototype.hasOwnProperty.call(BUILT_INS, name) ? BUILT_INS[name] : undefined;
  if (make == undefined)
    return undefined;
  if (!builtins.has(name))
    builtins.set(name, make());
  return builtins.get(name);
}

// Expands only built-ins; used on a variable's value, which is otherwise inserted verbatim
function expandBuiltIns(text: string, builtins: BuiltIns): string {
  return text.replace(PLACEHOLDER, (placeholder: string, name: string) =>
    name.startsWith('$') ? builtIn(name.substring(1), builtins) ?? placeholder : placeholder);
}

// Replaces every placeholder in a single pass. Unknown or inactive names become ''.
// Values are inserted verbatim: quotes are not escaped and '$&'-style patterns are not interpreted.
// A variable's value may hold built-ins ({{$guid}}); nothing else in it is expanded.
export function substituteText(text: string, variables: VariableTable[] | undefined, secrets: SecretTable[] | undefined, builtins: BuiltIns = newBuiltIns()): string {
  return text.replace(PLACEHOLDER, (_placeholder: string, name: string) => lookup(name, variables, secrets, builtins));
}

// Returns a copy of value with substituteText applied to every string and every object key.
// Only plain objects and arrays are walked; anything else (numbers, ArrayBuffers, ...) is returned as-is.
export function substituteDeep<T>(value: T, variables: VariableTable[] | undefined, secrets: SecretTable[] | undefined, builtins: BuiltIns = newBuiltIns()): T {
  if (typeof value === 'string')
    return substituteText(value, variables, secrets, builtins) as unknown as T;

  if (Array.isArray(value))
    return value.map(item => substituteDeep(item, variables, secrets, builtins)) as unknown as T;

  if (isPlainObject(value)) {
    const result: { [key: string]: unknown } = {};
    for (const [key, item] of Object.entries(value))
      result[substituteText(key, variables, secrets, builtins)] = substituteDeep(item, variables, secrets, builtins);
    return result as unknown as T;
  }

  return value;
}

function isPlainObject(value: unknown): value is { [key: string]: unknown } {
  if (value === null || typeof value !== 'object')
    return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function lookup(name: string, variables: VariableTable[] | undefined, secrets: SecretTable[] | undefined, builtins: BuiltIns): string {
  if (name.startsWith('$')) {
    const secretName = name.substring(1);
    const secret = secrets?.find(s => s.active == true && s.$secret == secretName);
    return secret != undefined ? secret.$value : builtIn(secretName, builtins) ?? '';
  }

  return expandBuiltIns(variables?.find(v => v.active == true && v.variable == name)?.value ?? '', builtins);
}


const SECRET_REFERENCE = new RegExp(`\\{\\{\\$${NAME}*?\\}\\}`, 'g');

// True when a credential field holds a literal value rather than only {{$secret}} references.
// Literal values (and {{variables}}) end up in plain text in collection and request files.
export function isRawCredential(value: string | undefined): boolean {
  return (value ?? '').replace(SECRET_REFERENCE, '').trim() != '';
}
