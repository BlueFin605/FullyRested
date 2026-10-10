import { CollectionSource, DirEntry } from '@fullyrested/core';
import { mockCollection } from './mock-collection';
import { mockRequest } from './mock-request';

// Browser mode (ng serve, no Electron): a small collection folder held in memory
const files: { [path: string]: string } = {
  [mockCollection.name]: JSON.stringify(mockCollection.config),
  'google/folder.frfolder': JSON.stringify({
    folderId: 'mock-folder',
    variables: [{ variable: 'site', value: 'www.google.com', active: true, id: 'v' }],
    secrets: [],
    auth: { authentication: 'inherit' },
    headers: [{ key: 'accept-language', value: 'en-NZ', active: true, id: 'h' }],
  }),
  'google/google search.frreq': JSON.stringify({ ...mockRequest('google search'), name: 'google search' }),
  'json/JSON Result.frreq': JSON.stringify({ ...mockRequest('JSON Result'), name: 'JSON Result' }),
  'Hulu.frreq': JSON.stringify({ ...mockRequest('Hulu'), name: 'Hulu' }),
};

export const mockCollectionSource: CollectionSource = {
  async listDir(dir: string): Promise<DirEntry[]> {
    const prefix = dir == '' ? '' : dir + '/';
    const names = new Map<string, boolean>();
    for (const file of Object.keys(files)) {
      if (!file.startsWith(prefix)) continue;
      const [first, ...rest] = file.substring(prefix.length).split('/');
      names.set(first, rest.length > 0 || names.get(first) == true);
    }
    return [...names].map(([name, isDirectory]) => ({ name, isDirectory }));
  },
  async readText(file: string): Promise<string> {
    const text = files[file];
    if (text == undefined) throw new Error(`No mock file ${file}`);
    return text;
  },
};
