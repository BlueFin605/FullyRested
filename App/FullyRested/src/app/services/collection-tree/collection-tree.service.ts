import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  Collection, CollectionConfig, CollectionNode, RequestNode, RestAction, RunNode,
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

    this.reload();
  }

  async reload(): Promise<void> {
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
      console.error(`[FullyRested] Cannot load ${collection.filename}: ${(error as Error).message}`);
      root = new CollectionNode(collection.config, collection.name);
    }

    // the settings panes edit the collection's own config object
    root.config = collection.config;
    if (this.collection === collection) this.tree.next(root);
  }

  // The node an open tab sends: wraps the tab's live action, under the folder its file is in
  nodeFor(action: RestAction, fullFilename: string | undefined, runId?: string): RequestNode | RunNode {
    const root = this.tree.value ?? new CollectionNode(this.collection?.config ?? normaliseCollectionConfig({} as CollectionConfig), '');
    const path = this.collection?.path;
    const relative = fullFilename && path ? relativePath(path, fullFilename) : undefined;
    const request = root.attach(action, relative);
    return runId ? request.run(runId) : request;
  }
}
