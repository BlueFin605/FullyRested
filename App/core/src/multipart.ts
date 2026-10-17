import { MultipartPart } from './model';

export interface MultipartBody {
  boundary: string;
  bytes: Uint8Array;   // exactly what is sent
  text: string;        // the same body for records: binary and generated content shown as <N bytes>
}

const BOUNDARY = '----FullyRestedBoundary';
const encoder = new TextEncoder();

// Builds a multipart/form-data body with CRLF framing. Inactive and unnamed parts are left out.
export function buildMultipart(parts: unknown): MultipartBody {
  const active = (Array.isArray(parts) ? parts as MultipartPart[] : []).filter(p => p.active && p.key);
  const contents = active.map(content);
  const boundary = pickBoundary(contents.map(c => c.bytes));

  const sent: Uint8Array[] = [];
  const shown: string[] = [];
  const text = (chunk: string) => { sent.push(encoder.encode(chunk)); shown.push(chunk); };

  active.forEach((part, i) => {
    text(`--${boundary}\r\n${headers(part)}\r\n\r\n`);
    sent.push(contents[i]!.bytes);
    shown.push(contents[i]!.shown);
    text('\r\n');
  });
  text(`--${boundary}--\r\n`);

  return { boundary, bytes: concat(sent), text: shown.join('') };
}

function content(part: MultipartPart): { bytes: Uint8Array; shown: string } {
  if (typeof part.size == 'number' && part.size >= 0)
    return { bytes: new Uint8Array(part.size).fill(0x61), shown: `<${part.size} bytes>` };
  if (part.base64) {
    const bytes = fromBase64(part.base64);
    return { bytes, shown: `<${bytes.length} bytes>` };
  }
  const value = part.value ?? '';
  return { bytes: encoder.encode(value), shown: value };
}

function headers(part: MultipartPart): string {
  const file = part.filename != undefined || part.base64 || typeof part.size == 'number';
  let disposition = `Content-Disposition: form-data; name="${quote(part.key)}"`;
  if (file) disposition += `; filename="${quote(part.filename ?? 'file')}"`;
  if (!file) return disposition;
  const binary = part.base64 || typeof part.size == 'number';
  return `${disposition}\r\nContent-Type: ${part.contentType || (binary ? 'application/octet-stream' : 'text/plain')}`;
}

const quote = (name: string): string => name.replace(/"/g, '%22').replace(/[\r\n]/g, ' ');

// A boundary that does not occur in any part's content
function pickBoundary(contents: Uint8Array[]): string {
  let boundary = BOUNDARY;
  const occurs = (b: string) => contents.some(c => contains(c, encoder.encode(b)));
  for (let i = 0; occurs(boundary); i++) boundary = `${BOUNDARY}${i}`;
  return boundary;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function contains(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}
