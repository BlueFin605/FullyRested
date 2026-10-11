// A small collection as raw files, for MemoryCollectionSink: one folder with settings
// (users, holding a request with one run), one without (orders).
export const files = {
  'api.frcol': JSON.stringify({ collectionGuid: 'c1', environments: [{ name: 'Production', id: 'e1' }], selectedEnvironmentId: 'e1' }),
  'users/folder.frfolder': JSON.stringify({ folderId: 'f1' }),
  'users/get.frreq': JSON.stringify({ id: 'r1', name: 'Get user', verb: 'get', url: 'https://x/u', runs: [{ id: 'n1', name: 'not found' }] }),
  'orders/list.frreq': JSON.stringify({ id: 'r2', name: 'List orders', verb: 'get', url: 'https://x/o' })
};
