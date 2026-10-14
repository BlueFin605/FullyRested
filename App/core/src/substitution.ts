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

// Replaces every placeholder in a single pass. Unknown or inactive names become ''.
// Values are inserted verbatim: quotes are not escaped and '$&'-style patterns are not interpreted.
export function substituteText(text: string, variables: VariableTable[] | undefined, secrets: SecretTable[] | undefined): string {
  return text.replace(PLACEHOLDER, (_placeholder: string, name: string) => lookup(name, variables, secrets));
}

// Returns a copy of value with substituteText applied to every string and every object key.
// Only plain objects and arrays are walked; anything else (numbers, ArrayBuffers, ...) is returned as-is.
export function substituteDeep<T>(value: T, variables: VariableTable[] | undefined, secrets: SecretTable[] | undefined): T {
  if (typeof value === 'string')
    return substituteText(value, variables, secrets) as unknown as T;

  if (Array.isArray(value))
    return value.map(item => substituteDeep(item, variables, secrets)) as unknown as T;

  if (isPlainObject(value)) {
    const result: { [key: string]: unknown } = {};
    for (const [key, item] of Object.entries(value))
      result[substituteText(key, variables, secrets)] = substituteDeep(item, variables, secrets);
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

function lookup(name: string, variables: VariableTable[] | undefined, secrets: SecretTable[] | undefined): string {
  if (name.startsWith('$')) {
    const secretName = name.substring(1);
    return secrets?.find(s => s.active == true && s.$secret == secretName)?.$value ?? '';
  }

  return variables?.find(v => v.active == true && v.variable == name)?.value ?? '';
}


const SECRET_REFERENCE = new RegExp(`\\{\\{\\$${NAME}*?\\}\\}`, 'g');

// True when a credential field holds a literal value rather than only {{$secret}} references.
// Literal values (and {{variables}}) end up in plain text in collection and request files.
export function isRawCredential(value: string | undefined): boolean {
  return (value ?? '').replace(SECRET_REFERENCE, '').trim() != '';
}
