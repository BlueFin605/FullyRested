// JSON Schema (draft 2020-12) inference from one observed JSON value.
//
// Pure function, no I/O: this is the core of schema inference used by validation_from_case to
// turn a recorded run's response body into a validation check. The governing rule throughout is
// that the inferred schema should fail on regressions, not on growth:
//   - object: every observed key is required, but `additionalProperties` is left unset so a field
//     the API adds later does not fail the test.
//   - array: every element's schema is merged - `properties` unioned, `required` intersected - so
//     a key missing from only some elements is not required of all of them.
//   - string/boolean: type only. No `enum`, `format`, `pattern` or length: one sample is not
//     evidence of a constraint.
//   - number: `integer` when every observed value is integral, else `number`. The one deliberate
//     over-fit, called out in the design doc: a one-word hand-edit when wrong, and the check most
//     likely to catch a real change in an API.
//   - null: unioned into the type, e.g. `['string', 'null']`.
//
// $schema is never emitted: validate.ts strips the keyword, and its Ajv instance is fixed to
// 2020-12 anyway.

// Draft is the internal, mergeable representation that both a single value and a merge of several
// values collapse into before being rendered to a JSON Schema object. The two "presence" fields -
// properties/requiredKeys and items - are treated as a monoid whose identity is "absent": merging
// a draft that was never an object with one that was leaves the object's properties and required
// keys untouched, rather than diluting them. That is what keeps required precise for a mixed array
// like `[{a: 1}, 'x']` - `required` only applies to an object instance in JSON Schema, so a
// non-object element contributes no information about it either way. An object with genuinely no
// keys (`{}`) is a real data point and does intersect required down, same as any other object.
interface Draft {
  // Unique type names, in first-observed order. A plain `number` becomes `integer` here only once
  // every contributing value was integral; mixing an integer with a fractional number collapses
  // both to `number` rather than producing a union, since integer is the more specific of the two.
  types: string[];
  properties?: Map<string, Draft>;
  requiredKeys?: Set<string>;
  items?: Draft;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function draftOfArray(value: unknown[]): Draft {
  if (value.length === 0)
    return { types: ['array'] };

  let items = draftOf(value[0]);
  for (let i = 1; i < value.length; i++)
    items = mergeDrafts(items, draftOf(value[i]));

  return { types: ['array'], items };
}

function draftOfObject(value: Record<string, unknown>): Draft {
  const properties = new Map<string, Draft>();
  const requiredKeys = new Set<string>();
  for (const key of Object.keys(value)) {
    properties.set(key, draftOf(value[key]));
    requiredKeys.add(key);
  }
  return { types: ['object'], properties, requiredKeys };
}

function draftOf(value: unknown): Draft {
  if (value === null) return { types: ['null'] };
  if (Array.isArray(value)) return draftOfArray(value);
  if (isPlainObject(value)) return draftOfObject(value);
  if (typeof value === 'string') return { types: ['string'] };
  if (typeof value === 'boolean') return { types: ['boolean'] };
  if (typeof value === 'number') return { types: [Number.isInteger(value) ? 'integer' : 'number'] };

  // Not a JSON value (undefined, function, symbol, bigint, ...) - inferSchema is documented to
  // take a JSON value observed from a recorded run, so this is a caller error, not a shape to
  // infer around.
  throw new Error(`inferSchema: cannot infer a schema for a ${typeof value} value`);
}

// Combines the type lists of two drafts into one ordered, de-duplicated list, in the order each
// type name was first observed. `integer` and `number` are a special case: once either side has
// seen a non-integral number, every `integer` in the union - on either side - collapses into
// `number`, because `integer` is simply the more specific case of `number`, not a separate type
// to union against it.
function mergeTypes(a: string[], b: string[]): string[] {
  const combined = [...a, ...b];
  const hasNumber = combined.includes('number');

  const order: string[] = [];
  const seen = new Set<string>();
  for (const raw of combined) {
    const type = raw === 'integer' && hasNumber ? 'number' : raw;
    if (!seen.has(type)) {
      seen.add(type);
      order.push(type);
    }
  }
  return order;
}

function mergeProperties(a: Draft, b: Draft): { properties?: Map<string, Draft>; requiredKeys?: Set<string> } {
  if (a.properties === undefined) return { properties: b.properties, requiredKeys: b.requiredKeys };
  if (b.properties === undefined) return { properties: a.properties, requiredKeys: a.requiredKeys };

  const properties = new Map<string, Draft>(a.properties);
  for (const [key, draft] of b.properties)
    properties.set(key, properties.has(key) ? mergeDrafts(properties.get(key)!, draft) : draft);

  const requiredKeys = new Set<string>();
  for (const key of a.requiredKeys!)
    if (b.requiredKeys!.has(key)) requiredKeys.add(key);

  return { properties, requiredKeys };
}

function mergeDrafts(a: Draft, b: Draft): Draft {
  const { properties, requiredKeys } = mergeProperties(a, b);
  const items = a.items !== undefined && b.items !== undefined ? mergeDrafts(a.items, b.items) : a.items ?? b.items;

  return { types: mergeTypes(a.types, b.types), properties, requiredKeys, items };
}

function toSchema(draft: Draft): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: draft.types.length === 1 ? draft.types[0] : draft.types };

  if (draft.properties !== undefined) {
    const properties: Record<string, unknown> = {};
    for (const [key, sub] of draft.properties) properties[key] = toSchema(sub);
    schema['properties'] = properties;
    schema['required'] = [...draft.properties.keys()].filter(key => draft.requiredKeys!.has(key));
  }

  if (draft.items !== undefined) schema['items'] = toSchema(draft.items);

  return schema;
}

// A JSON Schema (draft 2020-12) for the shape of one observed JSON value
export function inferSchema(value: unknown): object {
  return toSchema(draftOf(value));
}
