import { RestTypeVerb } from '@fullyrested/core';

// Short labels shown in sub-tab titles so you can see what's set without opening each tab

export const VERBS: RestTypeVerb[] = [
  RestTypeVerb.get,
  RestTypeVerb.post,
  RestTypeVerb.put,
  RestTypeVerb.patch,
  RestTypeVerb.delete,
  RestTypeVerb.option,
];

const AUTH_LABELS: { [type: string]: string } = {
  inherit: 'Inherit',
  none: 'None',
  awssig: 'AWS',
  basicauth: 'Basic',
  bearertoken: 'Bearer',
};

export function authLabel(type: string | undefined): string {
  return AUTH_LABELS[type ?? ''] ?? '';
}

export function bodyLabel(contentType: string | undefined): string {
  switch (contentType) {
    case 'application/json':
      return 'JSON';
    case 'application/x-www-form-urlencoded':
      return 'Form';
    default:
      return '';
  }
}

export function activeCount(rows: { active: boolean }[] | undefined): number {
  return (rows ?? []).filter((r) => r.active).length;
}
