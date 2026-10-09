import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  ApplicationRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import {
  LocalRestSession,
  LocalRestAction,
  CurrentState,
  RecentFile,
  Collection,
  Environment,
  AuthenticationDetails,
  ValidationType,
} from '@fullyrested/core';
import {
  CreateEmptyEnvironment,
  CreateEmptyAuthenticationDetails,
  CreateEmptyRestActionRun,
} from '@fullyrested/core';
import { MatTabChangeEvent, MatTabGroup } from '@angular/material/tabs';
import {
  SelectedTreeItem,
  CollectionExplorerComponent,
} from '../collection-explorer/collection-explorer.component';
import { SystemSupportService } from 'src/app/services/system-support/system-support.service';
import { ActionRepositoryService } from 'src/app/services/action-repository/action-repository.service';

interface SelectedTab {
  readonly selectedType: string;
  readonly selectedSubType: string;
  readonly selectedKey: string;
  readonly runkey: string | undefined;
}

@Component({
  selector: 'app-open-actions',
  templateUrl: './open-actions.component.html',
  styleUrls: ['./open-actions.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class OpenActionsComponent implements OnInit {
  state: CurrentState = {
    currentCollection: '',
    sessions: [],
    recentCollections: [],
  };
  public collection: Collection | undefined;
  enabledMenuOptions: string[] = [];
  selectedEnvironment: Environment = CreateEmptyEnvironment();
  selectedTab: SelectedTab = {
    selectedType: '',
    selectedSubType: '',
    selectedKey: '',
    runkey: undefined,
  };

  explorerSelected: string = '';

  @ViewChild('tabs') tabs!: MatTabGroup;
  @ViewChild('FileSelectInputDialog') FileSelectInputDialog!: ElementRef;
  @ViewChild('explorer') collectionExplorer:
    CollectionExplorerComponent | undefined;

  constructor(
    private repo: ActionRepositoryService,
    private appRef: ApplicationRef,
    private systemSupport: SystemSupportService,
  ) {
    this.repo.collections.subscribe((s) => {
      this.collection = s;
      // this.appRef.tick();
      if (s != undefined && s.filename.length > 0) {
        this.state.recentCollections = this.state.recentCollections
          .filter((f) => f.fullFileName != s.filename)
          .slice(0, 4);
        this.state.recentCollections.unshift({
          fullFileName: s.filename,
          name: s.name,
          path: s.path,
        }); //push to front
        this.state.currentCollection = s.filename;
        this.repo.saveCurrentState(this.state);
      }

      setTimeout(() => {
        this.tabs.selectedIndex = 0;
        this.tabs.realignInkBar(); // re-align the bottom border of the tab
      });
    });

    this.repo.savedAs.subscribe((a) => {
      if (a == undefined) return;

      var action = this.currentSession().actions.find(
        (f) => f.action.id == a.id,
      );
      if (action != undefined) {
        action.dirty = false;
        action.fullFilename = a.fullFilename;
        action.action.name = a.name;
      }

      this.rebuildTree();

      // this.appRef.tick();
      this.repo.saveCurrentState(this.state);
    });
  }

  ngOnInit(): void {
    this.repo.getCurrentState().then((s) => {
      this.state = s;
      this.tabs.selectedIndex = 0;
    });
  }

  ngAfterViewInit() {
    // doesn't work if outside setTimeOut()
    setTimeout(() => {
      this.tabs.selectedIndex = 0;
      this.tabs.realignInkBar(); // re-align the bottom border of the tab
    });
  }

  private rebuildTree() {
    setTimeout(async () => {
      if (this.collection) {
        await this.collectionExplorer?.rebuildTree(this.collection, this.state);
      }
    });
  }

  public currentSession(): LocalRestSession {
    if (this.collection?.config?.collectionGuid == undefined)
      return this.locateSession('nocollection');

    return this.locateSession(this.collection.config.collectionGuid);
  }

  private locateSession(sessionGuid: string): LocalRestSession {
    var session = this.state.sessions.find(
      (f) => f.collectionGuid == sessionGuid,
    );
    if (session != undefined) return session;

    var newSession: LocalRestSession = {
      collectionGuid: sessionGuid,
      actions: [],
    };
    this.state.sessions.push(newSession);
    return newSession;
  }

  addAction(event: any) {
    if (event.index < this.currentSession().actions.length) return;

    this.newRequest();
  }

  removeAction(event: any) {
    var index = this.currentSession().actions.findIndex(
      (i) => i.action.id == event,
    );
    this.currentSession().actions.splice(index, 1);
    this.repo.saveCurrentState(this.state);
    this.rebuildTree();
  }

  onActionChange(event: LocalRestAction) {
    this.repo.saveCurrentState(this.state);
  }

  onDirtyChange(event: LocalRestAction, dirty: boolean) {
    event.dirty = dirty;
  }

  onNameChange(event: LocalRestAction, name: string) {
    this.rebuildTree();
  }

  openCollection() {
    this.repo.loadCollection();
  }

  newCollection() {
    this.repo.newCollection();
  }

  saveCollection() {
    if (this.collection == undefined) return;
    this.repo.saveCollection(this.collection);
  }

  saveCollectionAs() {
    if (this.collection == undefined) return;
    this.repo.saveCollectionAs(this.collection);
  }

  closeCollection() {
    this.collection = undefined;
  }

  newRequest() {
    var count = Math.max(
      ...this.currentSession()
        .actions.filter((f) => f.action.name.startsWith('new request'))
        .map((s) => s.action.name.substring(12))
        .map((m) => (m.length == 0 ? 1 : parseInt(m)))
        .filter((num) => !isNaN(num)),
    );

    this.currentSession().actions.push(this.repo.createNewAction(count + 1));
    this.repo.saveCurrentState(this.state);

    setTimeout(() => {
      this.tabs.selectedIndex = (this.currentSession().actions.length ?? 0) - 1;
    });
  }

  saveAsRequest() {
    if (this.tabs?.selectedIndex == null) return;

    var action = this.currentSession().actions[this.tabs.selectedIndex];
    this.repo.saveAsRequest(action);
  }

  saveRequest() {
    if (this.tabs?.selectedIndex == null) return;

    var action = this.currentSession().actions[this.tabs.selectedIndex];
    this.repo.saveRequest(action);
  }

  openSoution(file: RecentFile) {
    this.repo.loadCollectionFromFile(file);
  }

  openAction(selected: SelectedTreeItem) {
    this.enabledMenuOptions = selected?.enabledMenuOptions ?? [];
    this.selectedTab = {
      selectedType: selected?.type,
      selectedSubType: selected?.subtype,
      selectedKey: selected?.key,
      runkey: selected?.runkey,
    };

    var existingTab = this.currentSession().actions.findIndex(
      (a) => a.fullFilename == selected.key,
    );
    if (existingTab != -1) {
      this.currentSession().actions[existingTab].activeTab =
        selected.activeTab &&
        this.currentSession().actions[existingTab].activeTab;
      this.tabs.selectedIndex = existingTab;
      this.repo.saveCurrentState(this.state);
      return;
    }

    this.repo.loadRequest(selected.key).then((a) => {
      var activeTab = this.currentSession().actions.findIndex(
        (a) => a.activeTab,
      );

      if (activeTab != -1) {
        this.currentSession().actions[activeTab].activeTab = false;
      }

      if (
        selected.activeTab &&
        activeTab != -1 &&
        this.currentSession().actions[activeTab].dirty == false
      ) {
        var newAction: LocalRestAction = {
          action: a,
          dirty: false,
          activeTab: selected.activeTab,
          fullFilename: selected.key,
        };
        this.currentSession().actions[activeTab] = newAction;
        setTimeout(() => {
          this.tabs.selectedIndex = activeTab;
        });
      } else {
        this.currentSession().actions.forEach((a) => (a.activeTab = false));
        var newAction: LocalRestAction = {
          action: a,
          dirty: false,
          activeTab: selected.activeTab,
          fullFilename: selected.key,
        };
        this.currentSession().actions.push(newAction);
        setTimeout(() => {
          this.tabs.selectedIndex =
            (this.currentSession().actions.length ?? 0) - 1;
        });
      }
      this.repo.saveCurrentState(this.state);
    });
  }

  openSystem(selected: SelectedTreeItem) {
    this.enabledMenuOptions = selected?.enabledMenuOptions ?? [];
    this.selectedTab = {
      selectedType: selected?.type,
      selectedSubType: selected?.subtype,
      selectedKey: selected?.key,
      runkey: undefined,
    };

    if (selected.type == 'system' && selected.subtype == 'variables') {
      if (selected.key == 'system.settings.variables') {
        this.selectedEnvironment =
          this.collection?.config?.collectionEnvironment ??
          CreateEmptyEnvironment();
      } else {
        this.selectedEnvironment =
          this.collection?.config?.environments?.find((e) =>
            selected.key.endsWith(`${e.id}.variables`),
          ) ?? CreateEmptyEnvironment();
      }
    } else if (selected.type == 'system' && selected.subtype == 'secrets') {
      if (selected.key == 'system.settings.secrets') {
        this.selectedEnvironment =
          this.collection?.config?.collectionEnvironment ??
          CreateEmptyEnvironment();
      } else {
        this.selectedEnvironment =
          this.collection?.config?.environments?.find((e) =>
            selected.key.endsWith(`${e.id}.secrets`),
          ) ?? CreateEmptyEnvironment();
      }
    } else if (
      selected.type == 'system' &&
      selected.subtype == 'authentication'
    ) {
      if (selected.key == 'system.settings.authentication') {
        this.selectedEnvironment =
          this.collection?.config?.collectionEnvironment ??
          CreateEmptyEnvironment();
      } else {
        this.selectedEnvironment =
          this.collection?.config?.environments?.find((e) =>
            selected.key.endsWith(`${e.id}.authentication`),
          ) ?? CreateEmptyEnvironment();
      }
    } else if (
      selected.type == 'dir' &&
      selected.subtype == 'system.settings.environments'
    ) {
      this.selectedEnvironment =
        this.collection?.config?.environments?.find((e) =>
          selected.key.endsWith(e.id),
        ) ?? CreateEmptyEnvironment();
    } else if (
      selected.type == 'dir' &&
      selected.subtype == 'system.settings.secrets'
    ) {
      this.selectedEnvironment =
        this.collection?.config?.environments?.find((e) =>
          selected.key.endsWith(e.id),
        ) ?? CreateEmptyEnvironment();
    } else if (
      selected.type == 'dir' &&
      selected.subtype == 'system.settings.authentication'
    ) {
      this.selectedEnvironment =
        this.collection?.config?.environments?.find((e) =>
          selected.key.endsWith(e.id),
        ) ?? CreateEmptyEnvironment();
    } else {
      this.selectedEnvironment = CreateEmptyEnvironment();
    }
  }

  createEnvironment() {
    if (this.collection == undefined) return;

    var env: Environment = {
      name: 'unnamed',
      id: this.systemSupport.generateGUID(),
      variables: [{ variable: '', value: '', active: true, id: 'a' }],
      secrets: [
        {
          $secret: '',
          $value: '',
          active: true,
          id: this.systemSupport.generateGUID(),
        },
      ],
      auth: CreateEmptyAuthenticationDetails('inherit'),
    };
    this.collection.config.environments.push(env);
    this.repo.storeCollection(this.collection);
  }

  deleteEnvironment() {
    if (this.collection == undefined) return;

    this.collection.config.environments =
      this.collection.config.environments.filter(
        (f) => f.name != this.selectedEnvironment.name,
      );
    this.repo.storeCollection(this.collection);
  }

  createRun() {
    var existingTab = this.currentSession().actions.find(
      (a) => a.fullFilename == this.selectedTab.selectedKey,
    );
    if (existingTab == undefined) {
      return;
    }

    existingTab.action.runs.push(
      CreateEmptyRestActionRun(this.systemSupport, ValidationType.Inherit),
    );
    existingTab.dirty = true;
    // this.currentSession().actions[existingTab].activeTab = selected.activeTab && this.currentSession().actions[existingTab].activeTab;
    this.repo.saveCurrentState(this.state);
    this.rebuildTree();
  }

  deleteRun() {
    var existingTab = this.currentSession().actions.find(
      (a) => a.fullFilename == this.selectedTab.selectedKey,
    );
    if (existingTab == undefined) {
      return;
    }
    existingTab.action.runs = existingTab.action.runs.filter(
      (r) => r.id != this.selectedTab.runkey,
    );
    this.selectedTab = { ...this.selectedTab, runkey: undefined };
    existingTab.dirty = true;
    // this.currentSession().actions[existingTab].activeTab = selected.activeTab && this.currentSession().actions[existingTab].activeTab;
    this.repo.saveCurrentState(this.state);
    this.rebuildTree();
  }

  actionDisabled(menuOption: string): boolean {
    return !this.enabledMenuOptions.some((e) => e == menuOption);
  }

  actionsVisible(): boolean {
    if (
      this.selectedTab.selectedType == 'dir' &&
      this.selectedTab.selectedSubType == 'system.settings.environments'
    )
      return false;

    if (this.selectedTab.selectedType == 'system') return false;

    return true;
  }

  variablesVisible(): boolean {
    if (
      this.selectedTab.selectedType == 'system' &&
      this.selectedTab.selectedSubType == 'variables'
    )
      return true;

    return false;
  }

  authenticationVisible(): boolean {
    if (
      this.selectedTab.selectedType == 'system' &&
      this.selectedTab.selectedSubType == 'authentication'
    )
      return true;

    return false;
  }

  environmentVisible(): boolean {
    if (
      this.selectedTab.selectedType == 'dir' &&
      this.selectedTab.selectedSubType == 'system.settings.environments'
    )
      return true;

    return false;
  }

  secretsVisible(): boolean {
    if (
      this.selectedTab.selectedType == 'system' &&
      this.selectedTab.selectedSubType == 'secrets'
    )
      return true;

    return false;
  }

  environmentChange(env: Environment) {
    if (this.collection == undefined) return;

    var solenv = this.collection.config.environments.findIndex(
      (e) => e.id == env.id,
    );
    this.collection.config.environments[solenv] = env;
    this.repo.storeCollection(this.collection);
  }

  tabChange($event: MatTabChangeEvent) {
    if (this.tabs?.selectedIndex == null) return;

    var action = this.currentSession().actions[this.tabs.selectedIndex];
    this.explorerSelected = action.fullFilename;
  }
}
