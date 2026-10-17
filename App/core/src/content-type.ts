export interface ContentType {
  part1: string;
  part2: string;
  encoding: string;
}

// 'application/json; charset=utf-8' -> { part1: 'application', part2: 'json', encoding: 'utf-8' }
export function decodeContentType(contentType: string): ContentType {
  const split = contentType.split(/[\s;/]+/);
  const part1 = split[0] ?? '';
  const part2 = split.length > 1 ? split[1] : '';
  let encoding = 'utf-8';

  if (split.length > 2 && split[2].startsWith('charset='))
    encoding = split[2].substring(8);

  return { part1, part2, encoding };
}

// Decodes a response body with the charset from its content type, falling back to utf-8
export function bodyToString(contentType: string | undefined, body: ArrayBuffer | ArrayBufferView | undefined): string {
  if (body == undefined)
    return '';

  const { encoding } = decodeContentType(contentType ?? '');
  try {
    return new TextDecoder(encoding).decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}

const CONTENT_TYPE_SHORTHANDS: { [name: string]: string } = {
  json: 'application/json',
  xml: 'application/xml',
  text: 'text/plain',
  txt: 'text/plain',
  html: 'text/html',
  form: 'application/x-www-form-urlencoded',
  urlencoded: 'application/x-www-form-urlencoded',
  multipart: 'multipart/form-data'
};

// A bare shorthand ('json', 'xml', 'text', 'html', 'form', 'multipart', any case) becomes the real media
// type; anything else (including 'none' and 'inherit', which are not media types) is returned as it is.
export function normaliseContentType(contentType: string): string {
  return CONTENT_TYPE_SHORTHANDS[contentType.trim().toLowerCase()] ?? contentType;
}
