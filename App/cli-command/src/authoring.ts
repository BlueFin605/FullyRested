import { randomUUID } from 'crypto';
import * as path from 'path';
import { AuthoringContext, EditResult, SecretStore, guidGenerator } from '@fullyrested/core';
import { FsCollectionSink, FsCollectionSource } from './files';
import { setup } from './run';

// crypto.randomUUID, host-side. Core cannot import 'crypto' itself because the Angular build
// bundles core's source into the renderer, so every host that drives an authoring verb injects
// its own guid generator.
export function newGuid(): guidGenerator {
  return { generateGUID: () => randomUUID() };
}

// Every path an authoring verb sees is relative to the collection folder, so collectionFile is
// just the collection's base name; source and sink are both rooted at its folder. For
// new_collection the file need not exist yet: path.dirname/path.basename work on the name alone,
// and the verb never reads through source.
export function authoringContext(collectionFile: string, secrets: SecretStore): AuthoringContext {
  const full = path.resolve(collectionFile);
  const folder = path.dirname(full);
  return {
    collectionFile: path.basename(full),
    source: new FsCollectionSource(folder),
    sink: new FsCollectionSink(folder),
    secrets,
    guid: newGuid()
  };
}

// The one write path every authoring verb goes through. `run` is a closure over the actual verb
// (setHeader, newRequest, rename, ...), so index.ts and mcp.ts each wire up their own call without
// needing a wrapper per verb. Building the context never touches disk, so wrapping the whole call
// in setup() gives a collection that will not load -- or any other failure, a QueryError from the
// verb included -- the same "setup failure" handling and exit code as `run` and the inspect
// commands, in this one place rather than in 21 near-identical copies.
export async function edit(
  collection: string,
  secrets: SecretStore,
  run: (ctx: AuthoringContext) => Promise<EditResult>
): Promise<EditResult> {
  return setup(() => run(authoringContext(collection, secrets)));
}
