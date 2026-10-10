import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SystemSupportService } from '../system-support/system-support.service';
import { mockCollection } from '../mocks/mock-collection';
import { mockCurrentState } from '../mocks/mock-current-state';
import { mockRequest } from '../mocks/mock-request';
import { normaliseAction, normaliseCollectionConfig, normaliseCurrentState, CreateEmptyLocalAction, CreateEmptyAction, CreateEmptyCollection } from '@fullyrested/core';
import { mockCollectionSource } from '../mocks/mock-collection-source';
import { CollectionSource, FolderConfig, SecretStore } from '@fullyrested/core';
import { Collection, SavedAsCompleted, CurrentState, RestAction, LocalRestAction, RecentFile } from '@fullyrested/core';


@Injectable({
  providedIn: 'root'
})

export class ActionRepositoryService {
  // collections = new BehaviorSubject<Collection>({config: { collectionGuid: 'abcd' }, filename: '<filename>', path: '<path>'});
  collections = new BehaviorSubject<Collection | undefined>(undefined);
  savedAs = new BehaviorSubject<SavedAsCompleted | undefined>(undefined);

  constructor(private systemSupport: SystemSupportService) {

    if (this.getIpcRenderer() == undefined)
      return;

    this.getIpcRenderer().receive('loadCollectionResponse', (collection: Collection) => {
      normaliseCollectionConfig(collection.config);
      this.collections.next(collection);
    });

    this.getIpcRenderer().receive('savedAsCompleted', (savedAs: SavedAsCompleted) => {
      this.savedAs.next(savedAs);
    });
  }

  private getIpcRenderer() {
    return (<any>window).ipc;
  }

  // The collection folder, read through the main process (or the built-in mock in a plain browser)
  public collectionSource(root: string): CollectionSource {
    const ipc = this.getIpcRenderer();
    if (ipc == undefined) return mockCollectionSource;

    return {
      listDir: (path: string) => ipc.invoke('listDir', { root, path }),
      readText: (path: string) => ipc.invoke('readText', { root, path }),
    };
  }

  // Reads secret values from the OS keychain; saving them is the main process's job
  public secretStore(): SecretStore {
    const ipc = this.getIpcRenderer();
    return {
      get: async (service: string, account: string) =>
        ipc == undefined ? null : ipc.invoke('getSecret', { service, account }),
      set: async () => {
        throw new Error('Secrets are saved by the main process');
      },
    };
  }

  public async saveFolder(folderPath: string, config: FolderConfig): Promise<void> {
    const ipc = this.getIpcRenderer();
    if (ipc == undefined) return;

    await ipc.invoke('saveFolder', { folderPath, config });
  }

  public createNewAction(max: number): LocalRestAction {
    var action: LocalRestAction = CreateEmptyLocalAction();
    action.action.id = this.systemSupport.generateGUID();
    if (isFinite(max) == false)
      action.action.name = "new request";
    else
      action.action.name = "new request " + max;

    action.action.headers.push({ key: 'user-agent', value: 'fullyrested', active: true, id: 'aaa' });
    action.action.headers.push({ key: 'accept', value: '*', active: true, id: new SystemSupportService().generateGUID() });
    action.action.headers.push({ key: 'accept-encoding', value: 'gzip, deflate, br', active: true, id: new SystemSupportService().generateGUID() });
    return action;
  }

  public async getCurrentState(): Promise<CurrentState> {
    if (this.getIpcRenderer() == undefined)
      return mockCurrentState;

    var state: CurrentState = await this.getIpcRenderer().invoke('readState', '');

    normaliseCurrentState(state);
    //  if (state.actions.length == 0)
    //     state.actions.push(CreateEmptyLocalAction());

    return state;
  }

  public async saveCurrentState(state: CurrentState) {
    if (this.getIpcRenderer() == undefined)
      return;

    await this.getIpcRenderer().send('saveState', state);
  }

  public async saveAsRequest(request: LocalRestAction) {
    if (this.getIpcRenderer() == undefined)
      return;

    await this.getIpcRenderer().send('saveAsRequest', request.action);
  }

  public async saveRequest(request: LocalRestAction) {
    if (this.getIpcRenderer() == undefined)
      return;

    await this.getIpcRenderer().send('saveRequest', { fullFilename: request.fullFilename, action: request.action });
  }

  public async loadRequest(fullFilename: string): Promise<RestAction> {
    if (fullFilename == undefined || fullFilename == "")
      return CreateEmptyAction();

    if (this.getIpcRenderer() == undefined) {
      return mockRequest(fullFilename);
    }

    var request: RestAction = await this.getIpcRenderer().invoke('loadRequest', fullFilename);
    return normaliseAction(request);
  }

  public async loadCollection() {
    if (this.getIpcRenderer() == undefined) {
      this.collections.next(mockCollection);
      return;
    }

    this.getIpcRenderer().send("loadCollection");
  }

  public async newCollection() {
    var collection: Collection = CreateEmptyCollection(this.systemSupport);
    collection.config.collectionEnvironment.auth.authentication = 'none';
    this.collections.next(collection);
  }

  public async loadCollectionFromFile(file: RecentFile) {
    if (this.getIpcRenderer() == undefined) {
      this.collections.next(mockCollection);
      return;
    }

    this.getIpcRenderer().send("loadCollectionFromFile", file);
  }

  public async saveCollection(collection: Collection) {
    if (this.getIpcRenderer() == undefined) {
      setTimeout(() => this.collections.next(JSON.parse(JSON.stringify(collection))));
      return;
    }

    await this.getIpcRenderer().send('saveCollection', collection);
  }


  public async saveCollectionAs(collection: Collection) {
    if (this.getIpcRenderer() == undefined) {
      setTimeout(() => this.collections.next(JSON.parse(JSON.stringify(collection))));
      return;
    }

    await this.getIpcRenderer().send('saveCollectionAs', collection);
  }

  public async storeCollection(collection: Collection) {
    setTimeout(() => this.collections.next(JSON.parse(JSON.stringify(collection))));
  }
}
