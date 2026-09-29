import { SecretTable, VariableTable } from './model';

// {{name}} is a variable, {{$name}} is a secret
const PLACEHOLDER = /\{\{(\$?[0-9a-zA-Z]*?)\}\}/g;

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

// Kept for the Angular ValidateResponseService until validation moves into core
export class VariableSubstitution {
  public replaceVariables(text: string, variables: VariableTable[] | undefined, secrets: SecretTable[] | undefined): string {
    return substituteText(text, variables, secrets);
  }
}
