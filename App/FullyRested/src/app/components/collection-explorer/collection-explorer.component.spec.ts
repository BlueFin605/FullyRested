import { TestBed } from '@angular/core/testing';
import { AppModule } from 'src/app/app.module';
import {
  CollectionNode,
  CreateEmptyAction,
  CreateEmptyFolderConfig,
  FolderNode,
  RequestNode,
} from '@fullyrested/core';
import { BehaviorSubject } from 'rxjs';
import { ExecuteRestCallsService } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';
import { CollectionTreeService } from 'src/app/services/collection-tree/collection-tree.service';
import { mockCollection } from 'src/app/services/mocks/mock-collection';
import { mockCurrentState } from 'src/app/services/mocks/mock-current-state';
import { CollectionExplorerComponent } from './collection-explorer.component';

describe('CollectionExplorerComponent', () => {
  function create(loadError?: { file: string; message: string }) {
    TestBed.configureTestingModule({ imports: [AppModule] });
    const root = new CollectionNode(mockCollection.config, mockCollection.name);
    root.loadError = loadError;
    const withSettings = new FolderNode(root, 'google', CreateEmptyFolderConfig('f1'), true);
    const broken = new FolderNode(root, 'broken', CreateEmptyFolderConfig('f2'), true);
    broken.loadError = { file: 'broken/folder.frfolder', message: 'bad json' };
    root.children.push(withSettings, broken, new RequestNode(root, 'Hulu.frreq', CreateEmptyAction()));

    const fixture = TestBed.createComponent(CollectionExplorerComponent);
    TestBed.inject(CollectionTreeService).tree.next(root);
    fixture.componentInstance.collection = mockCollection;
    fixture.componentInstance.state = mockCurrentState;
    fixture.detectChanges();
    // the collection row, then its children
    const top = fixture.componentInstance.items[0];
    return { top, children: top.children! };
  }

  it('puts folder contents directly under the collection row', () => {
    const { top, children } = create();
    expect(top.text).toBe(mockCollection.name);
    expect(children.map((c) => c.text)).toEqual(['Collection Settings', 'google', 'broken', 'Hulu.frreq']);
  });

  it('marks folders with settings and folders that failed to load', () => {
    const { children } = create();
    const google = children.find((c) => c.text == 'google')!;
    const broken = children.find((c) => c.text == 'broken')!;
    expect(google.value.hasSettings).toBeTrue();
    expect(google.value.error).toBeUndefined();
    expect(broken.value.error).toBe('bad json');
  });

  it('offers a History row in the collection settings', () => {
    const { children } = create();
    const settings = children.find((c) => c.text == 'Collection Settings')!;
    const history = settings.children!.find((c) => c.text == 'History')!;
    expect(history.value).toEqual({ type: 'system', subtype: 'history', key: 'system.history' });
  });

  it('offers a Headers row for the collection and for each environment', () => {
    const { children } = create();
    const settings = children.find((c) => c.text == 'Collection Settings')!;
    const headers = settings.children!.find((c) => c.text == 'Headers')!;
    expect(headers.value).toEqual({ type: 'system', subtype: 'headers', key: 'system.settings.headers' });

    const envs = settings.children!.find((c) => c.text == 'Environments')!;
    for (const env of envs.children!) {
      const row = env.children!.find((c) => c.text == 'Headers')!;
      expect(row.value.subtype).toBe('headers');
      expect(row.value.key).toBe(`${env.value.key}.headers`);
    }
    expect(envs.children!.length).toBeGreaterThan(0);
  });

  it('offers Run on the collection row and on folders', () => {
    const { top, children } = create();
    expect(top.value.actions).toEqual(['runScope']);
    expect(children.find((c) => c.text == 'google')!.value.actions).toEqual(['runScope', 'folderSettings']);
  });

  it('disables Run in the context menu while a batch is running', () => {
    create();
    const era = TestBed.inject(ExecuteRestCallsService) as any;
    const progress = (era as any).progress as BehaviorSubject<unknown>;
    const fixture = TestBed.createComponent(CollectionExplorerComponent);
    expect(fixture.componentInstance.scopeRunning).toBeFalse();
    progress.next({ done: 0, total: 2, passed: 0, failed: 0 });
    expect(fixture.componentInstance.scopeRunning).toBeTrue();
    progress.next(undefined);
    expect(fixture.componentInstance.scopeRunning).toBeFalse();
  });

  it('marks the collection row when the collection failed to load', () => {
    const { top } = create({ file: 'x.frcol', message: 'cannot read' });
    expect(top.value.error).toBe('cannot read');
  });
});
