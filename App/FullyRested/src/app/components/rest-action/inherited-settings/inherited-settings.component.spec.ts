import { TestBed } from '@angular/core/testing';
import {
  CollectionConfig, CollectionNode, CreateEmptyAction, CreateEmptyFolderConfig, FolderNode, normaliseCollectionConfig,
} from '@fullyrested/core';
import { AppModule } from 'src/app/app.module';
import { InheritedSettingsComponent } from './inherited-settings.component';

describe('InheritedSettingsComponent', () => {
  function render(folderBroken = false) {
    const config = normaliseCollectionConfig({} as CollectionConfig);
    config.collectionEnvironment.headers = [{ key: 'x-level', value: 'collection', active: true, id: 'c' }];
    const root = new CollectionNode(config, 'api.frcol');
    const folder = new FolderNode(root, 'api', { ...CreateEmptyFolderConfig('f'), headers: [{ key: 'x-level', value: 'folder', active: true, id: 'f' }] }, true);
    if (folderBroken) folder.loadError = { file: 'api/folder.frfolder', message: 'bad json' };
    root.children.push(folder);

    TestBed.configureTestingModule({ imports: [AppModule] });
    const fixture = TestBed.createComponent(InheritedSettingsComponent);
    fixture.componentInstance.node = root.attach(CreateEmptyAction(), 'api/a.frreq');
    fixture.componentInstance.expanded = true;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('lists inherited headers with their source, nearer first', () => {
    const rows = Array.from(render().querySelectorAll('tr.setting')).map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows[0]).toContain('x-level');
    expect(rows[0]).toContain('folder api');
    expect(rows[1]).toContain('collection');
  });

  it('marks overridden values', () => {
    expect(render().querySelectorAll('tr.setting.overridden').length).toBe(1);
  });

  it('shows the error when a parent file is broken', () => {
    expect(render(true).textContent).toContain('api/folder.frfolder is invalid');
  });
});
