import * as fs from 'fs';
import * as path from 'path';
import { BodyField, QueryError } from '@fullyrested/core';
import { UsageError } from './run';

// A multipart file part given on the command line: name=path[;type=mime][;filename=name], or for
// --generate name=bytes[;type=mime][;filename=name]. Splits on the first '=' (a path may hold more),
// then peels the ';key=value' options off the end.
function split(flag: string, spec: string): { name: string; rest: string; type?: string; filename?: string } {
  const eq = spec.indexOf('=');
  if (eq <= 0)
    throw new UsageError(`${flag} needs name=value (got '${spec}')`);
  let rest = spec.slice(eq + 1);
  const found: { type?: string; filename?: string } = {};
  for (;;) {
    const m = /;(type|filename)=([^;]*)$/.exec(rest);
    if (!m) break;
    found[m[1] as 'type' | 'filename'] = m[2]!;
    rest = rest.slice(0, m.index);
  }
  return { name: spec.slice(0, eq), rest, ...found };
}

// Reads a local file into a base64 part (the request keeps its own copy, so the collection is self-contained)
export function filePart(flag: string, spec: string): BodyField {
  const { name, rest, type, filename } = split(flag, spec);
  let data: Buffer;
  try {
    data = fs.readFileSync(rest);
  } catch (error) {
    throw new UsageError(`${flag}: cannot read '${rest}': ${(error as Error).message}`);
  }
  return withOptions({ name, value: '', filename: filename ?? path.basename(rest), base64: data.toString('base64') }, type);
}

export function generatedPart(flag: string, spec: string): BodyField {
  const { name, rest, type, filename } = split(flag, spec);
  if (!/^\d+$/.test(rest))
    throw new UsageError(`${flag} needs a whole number of bytes (got '${rest}')`);
  return withOptions({ name, value: '', filename: filename ?? 'file', size: Number(rest) }, type);
}

function withOptions(field: BodyField, type: string | undefined): BodyField {
  if (type) field.contentType = type;
  return field;
}

// An MCP field may name a local file instead of carrying its bytes
export function readFileField(field: BodyField & { path?: string }): BodyField {
  if (field.path == undefined) return field;
  const { path: file, ...rest } = field;
  let data: Buffer;
  try {
    data = fs.readFileSync(file);
  } catch (error) {
    throw new QueryError(`Part '${field.name}': cannot read '${file}': ${(error as Error).message}`);
  }
  return { ...rest, filename: rest.filename ?? path.basename(file), base64: data.toString('base64') };
}

