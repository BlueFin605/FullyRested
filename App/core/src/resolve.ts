import { ParamTable } from './model';

// Builds the URL the request is sent to: the action's url plus its active query parameters
// (later entries win for a repeated key). Encodes like the app's Angular serializer always
// did, but leaves {{variables}} and URL punctuation readable: spaces become '+'.
export function buildRequestUrl(url: string, params: ParamTable[]): string {
    const values = paramsAsValues(params);
    const query = Object.keys(values).map(k => `${encodeQuery(k)}=${encodeQuery(values[k]!)}`).join('&');
    const path = readable(encodeUriString(url).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/%26/gi, '&'));
    return query.length > 0 ? `${path}?${query}` : path;
}

function paramsAsValues(params: ParamTable[]): { [key: string]: string } {
    const converted: { [key: string]: string } = {};
    params.filter(f => f.active == true && f.key != '' && f.value != '').forEach(v => converted[v.key] = v.value);
    return converted;
}

function encodeUriString(s: string): string {
    return encodeURIComponent(s)
        .replace(/%40/g, '@')
        .replace(/%3A/gi, ':')
        .replace(/%24/g, '$')
        .replace(/%2C/gi, ',');
}

// How buildRequestUrl encodes a query key or value
export function encodeQuery(s: string): string {
    return readable(encodeUriString(s).replace(/%3B/gi, ';'));
}

function readable(s: string): string {
    return s
        .replace(/%40/gi, '@')
        .replace(/%3A/gi, ':')
        .replace(/%24/gi, '$')
        .replace(/%2C/gi, ',')
        .replace(/%3B/gi, ';')
        .replace(/%20/gi, '+')
        .replace(/%3D/gi, '=')
        .replace(/%3F/gi, '?')
        .replace(/%2F/gi, '/')
        .replace(/%5B/gi, '[')
        .replace(/%5D/gi, ']')
        .replace(/%7B/gi, '{')
        .replace(/%7D/gi, '}');
}
