import { CaseRecord, RunListing, RunRecord, listingOf } from '@fullyrested/core';

function oneCase(index: number, name: string, requestFile: string, status: number, outcome: CaseRecord['outcome'], ms: number): CaseRecord {
  const ok = outcome == 'pass';
  return {
    index, name, requestFile, outcome, ms,
    request: { method: 'GET', url: 'https://example.test/items', headers: { accept: 'application/json' } },
    response: {
      status, statusText: ok ? 'OK' : 'Internal Server Error', headers: { 'content-type': 'application/json' },
      body: { contentType: 'application/json', bytes: 11, text: ok ? '{"ok":true}' : '{"ok":false}' }
    },
    validation: {
      valid: ok,
      checks: [{ check: 'status', passed: ok, errors: ok ? [] : [`expected 200 but got ${status}`] }]
    }
  };
}

// Newest id first, like the real store lists them. Under ng serve this is all the History pane has to show.
const records: RunRecord[] = [
  {
    runId: '20261015-100300-aaaa-app', startedAt: '2026-10-15T10:03:00.000Z', collection: 'Mock.frcol',
    environment: 'Development', selection: 'request:items/get-items.frreq', redacted: true,
    cases: [oneCase(1, 'get items', 'items/get-items.frreq', 200, 'pass', 120)]
  },
  {
    runId: '20261015-100200-bbbb-app', startedAt: '2026-10-15T10:02:00.000Z', collection: 'Mock.frcol',
    environment: 'Development', selection: 'request:items/get-items.frreq', redacted: true,
    cases: [oneCase(1, 'get items', 'items/get-items.frreq', 500, 'fail', 340)]
  },
  {
    runId: '20261015-100000-cli0', startedAt: '2026-10-15T10:00:00.000Z', collection: 'Mock.frcol',
    environment: 'Development', selection: 'collection', redacted: true,
    cases: [
      oneCase(1, 'get items', 'items/get-items.frreq', 200, 'pass', 100),
      oneCase(2, 'get item', 'items/get-item.frreq', 200, 'pass', 90),
      oneCase(3, 'delete item', 'items/delete-item.frreq', 500, 'fail', 210)
    ]
  }
];

export function mockRunListings(): RunListing[] {
  return records.map(listingOf);
}

export function mockRunRecord(runId: string): RunRecord | undefined {
  return records.find(r => r.runId == runId);
}
