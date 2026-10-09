import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  Collection, CollectionConfig, CollectionNode, FolderNode, RequestNode, RestAction, RunNode,
  loadCollectionTree, normaliseCollectionConfig, relativePath,
} from '@fullyrested/core';
import { ActionRepositoryService } from '../action-repository/action-repository.service';

// The open collection as core's scope tree: its folders, their settings and the requests below them.
// The CLI builds the same tree, so a request sends the same thing from either.
@Injectable({
  providedIn: 'root',
})
export class CollectionTreeService {
  tree = new BehaviorSubject<CollectionNode | undefined>(undefined);
  private collection: Collection | undefined;
  // a newer load supersedes an older one still in flight
  private loadToken = 0;

  constructor(private repo: ActionRepositoryService) {
    repo.collections.subscribe((c) => this.onCollection(c));
    repo.savedAs.subscribe((s) => {
      if (s != undefined) this.reload();
    });
  }

  private onCollection(collection: Collection | undefined) {
    const sameFile = collection != undefined && this.collection != undefined && collection.filename == this.collection.filename;
    this.collection = collection;
    const root = this.tree.value;

    // settings edits re-emit the collection: keep the loaded folders, take the new config
    if (sameFile && root != undefined) {
      root.config = collection!.config;
      this.tree.next(root);
      return;
    }

    // a different collection: drop the old tree so nothing sends against the wrong folders while this one loads
    this.tree.next(undefined);
    this.reload();
  }

  // `refreshed` is the collection-relative folder just saved: it takes what is on disk, not the pane's edits
  async reload(options?: { refreshed?: string }): Promise<void> {
    const token = ++this.loadToken;
    const collection = this.collection;
    if (collection == undefined) {
      this.tree.next(undefined);
      return;
    }

    // never saved: there is no folder to read yet
    if (!collection.path) {
      this.tree.next(new CollectionNode(collection.config, collection.name));
      return;
    }

    let root: CollectionNode;
    try {
      root = await loadCollectionTree(collection.name, this.repo.collectionSource(collection.path), this.repo.secretStore());
      root.warnings.forEach((w) => console.warn(`[FullyRested] ${w}`));
    } catch (error) {
      const message = (error as Error).message;
      console.error(`[FullyRested] Cannot load ${collection.filename}: ${message}`);
      // requests below must not send without their folder settings: resolve() throws on a broken ancestor
      root = new CollectionNode(collection.config, collection.name);
      root.loadError = { file: collection.name, message };
    }

    if (token !== this.loadToken) return;

    // unsaved folder edits live on the old nodes: an unrelated reload (saving a request) must not drop them.
    // tree.value is cleared when the collection file changes, so this only ever carries within one collection.
    const previous = this.tree.value;
    if (previous != undefined)
      for (const folder of root.folderNodes()) {
        const old = previous.find(folder.path);
        if (old instanceof FolderNode && old.loadError == undefined && folder.path !== options?.refreshed) folder.config = old.config;
      }

    // the settings panes edit the collection's own config object; settings edits may have swapped it mid-load
    root.config = this.collection!.config;
    this.tree.next(root);
  }

  // The node an open tab sends: wraps the tab's live action, under the folder its file is in
  nodeFor(action: RestAction, fullFilename: string | undefined, runId?: string): RequestNode | RunNode {
    if (this.tree.value == undefined && this.collection?.path) throw new Error('Collection is still loading');
    const root = this.tree.value ?? new CollectionNode(this.collection?.config ?? normaliseCollectionConfig({} as CollectionConfig), '');
    const path = this.collection?.path;
    const relative = fullFilename && path ? relativePath(path, fullFilename) : undefined;
    const request = root.attach(action, relative);
    return runId ? request.run(runId) : request;
  }
}
