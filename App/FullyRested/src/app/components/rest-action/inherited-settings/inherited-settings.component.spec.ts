import { TestBed } from '@angular/core/testing';
import {
  CollectionConfig, CollectionNode, CreateEmptyAction, CreateEmptyAuthenticationDetails, CreateEmptyFolderConfig, FolderNode,
  normaliseCollectionConfig,
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
  describe('variables, secrets, auth and environments', () => {
    function renderFull(environmentId?: string) {
      const config = normaliseCollectionConfig({
        collectionGuid: 'c1', selectedEnvironmentId: 'dev',
        collectionEnvironment: {
          name: 'system.settings', id: '', headers: [], variables: [{ variable: 'host', value: 'collection.example', active: true, id: 'v1' }],
          secrets: [{ $secret: 'apikey', $value: 'top-secret', active: true, id: 's1' }],
          auth: { ...CreateEmptyAuthenticationDetails('bearertoken') },
        },
        environments: [
          { name: 'Dev', id: 'dev', headers: [], secrets: [], variables: [{ variable: 'host', value: 'dev.example', active: true, id: 'v2' }], auth: CreateEmptyAuthenticationDetails('inherit') },
          { name: 'Prod', id: 'prod', headers: [], secrets: [], variables: [{ variable: 'host', value: 'prod.example', active: true, id: 'v3' }], auth: CreateEmptyAuthenticationDetails('inherit') },
        ],
      } as unknown as CollectionConfig);
      const root = new CollectionNode(config, 'api.frcol');

      TestBed.configureTestingModule({ imports: [AppModule] });
      const fixture = TestBed.createComponent(InheritedSettingsComponent);
      fixture.componentInstance.node = root.attach(CreateEmptyAction(), 'a.frreq');
      fixture.componentInstance.environmentId = environmentId;
      fixture.componentInstance.expanded = true;
      fixture.detectChanges();
      return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tr.setting')).map((r) =>
        Array.from(r.querySelectorAll('td')).map((td) => td.textContent!.trim()).concat(r.classList.contains('overridden') ? ['overridden'] : []));
    }

    it('lists variables with the environment label, the selected environment first', () => {
      const rows = renderFull().filter((r) => r[0] == 'Variable');
      expect(rows).toEqual([
        ['Variable', 'host', 'dev.example', 'environment Dev'],
        ['Variable', 'host', 'collection.example', 'collection', 'overridden'],
      ]);
    });

    it('follows the environment it is given', () => {
      expect(renderFull('prod').find((r) => r[0] == 'Variable')).toEqual(['Variable', 'host', 'prod.example', 'environment Prod']);
    });

    it('masks secret values', () => {
      const secret = renderFull().find((r) => r[0] == 'Secret')!;
      expect(secret).toEqual(['Secret', 'apikey', '••••••', 'collection']);
      expect(secret.join(' ')).not.toContain('top-secret');
    });

    it('shows the auth that applies and where it is set', () => {
      expect(renderFull().find((r) => r[0] == 'Auth')).toEqual(['Auth', 'bearertoken', '', 'collection']);
    });
  });
});
