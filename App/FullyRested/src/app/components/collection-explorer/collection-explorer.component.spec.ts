import { TestBed } from '@angular/core/testing';
import { AppModule } from 'src/app/app.module';
import {
  CollectionNode,
  CreateEmptyAction,
  CreateEmptyFolderConfig,
  FolderNode,
  RequestNode,
} from '@fullyrested/core';
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

  it('marks the collection row when the collection failed to load', () => {
    const { top } = create({ file: 'x.frcol', message: 'cannot read' });
    expect(top.value.error).toBe('cannot read');
  });
});
