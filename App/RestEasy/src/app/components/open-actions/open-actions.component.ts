import { Component, OnInit, ViewChild, ElementRef, ApplicationRef } from '@angular/core';
import { LocalRestSession, LocalRestAction, ActionRepositoryService, CurrentState, RecentFile, Solution, Environment, CreateEmptyEnvironment, AuthenticationDetails, CreateEmptyAuthenticationDetails } from 'src/app/services/action-repository/action-repository.service'
import { MatTabGroup } from '@angular/material/tabs';
import { SelectedTreeItem, SolutionExplorerComponent } from '../solution-explorer/solution-explorer.component';
import { SystemSupportService } from 'src/app/services/system-support/system-support.service';

@Component({
  selector: 'app-open-actions',
  templateUrl: './open-actions.component.html',
  styleUrls: ['./open-actions.component.css']
})
export class OpenActionsComponent implements OnInit {
  state: CurrentState = { currentSolution: '', sessions: [], recentSolutions: [] };
  public solution: Solution | undefined;
  enabledMenuOptions: string[] = [];
  selectedType: string = "";
  selectedSubType: string = "";
  selectedEnvironment: Environment = CreateEmptyEnvironment();

  @ViewChild('tabs') tabs!: MatTabGroup;
  @ViewChild('FileSelectInputDialog') FileSelectInputDialog!: ElementRef;
  @ViewChild('explorer') collectionExplorer: SolutionExplorerComponent | undefined;

  constructor(private repo: ActionRepositoryService, private appRef: ApplicationRef, private systemSupport: SystemSupportService) {
    this.repo.solutions.subscribe(s => {
      console.log(`this.repo.solutions.subscribe => [${JSON.stringify(s)}]`);
      console.log(this.state);
      this.solution = s;
      // this.appRef.tick();
      if (s != undefined && s.filename.length > 0) {
        this.state.recentSolutions = this.state.recentSolutions.filter(f => f.fullFileName != s.filename).slice(0, 4);
        this.state.recentSolutions.unshift({ fullFileName: s.filename, name: s.name, path: s.path });  //push to front
        this.state.currentSolution = s.filename;
        this.repo.saveCurrentState(this.state);
      };

      console.log(`this.repo.solutions.subscribe, sent`)
    });

    this.repo.savedAs.subscribe(a => {
      console.log(`this.repo.savedAs.subscribe => [${JSON.stringify(a)}]`);

      if (a == undefined)
        return;

      var action = this.currentSession().actions.find(f => f.action.id == a.id);
      if (action != undefined) {
        action.dirty = false;
        action.fullFilename = a.fullFilename;
        action.action.name = a.name;
      }

      setTimeout(() => {
        if (this.solution) {
          this.collectionExplorer?.rebuildTree(this.solution);
        }
      });

      // this.appRef.tick();
      this.repo.saveCurrentState(this.state);
    });
  }

  ngOnInit(): void {
    this.repo.getCurrentState().then(s => {
      this.state = s;
      // console.log(`tabs:[${this.tabs}]`)
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

  public currentSession(): LocalRestSession {
    // console.log(`currentSession:[${this.solution?.config?.solutionGuid}]`);

    if (this.solution?.config?.solutionGuid == undefined)
      return this.locateSession("nosolution");

    return this.locateSession(this.solution.config.solutionGuid);
  }

  private locateSession(sessionGuid: string): LocalRestSession {
    var session = this.state.sessions.find(f => f.solutionGuid == sessionGuid);
    if (session != undefined)
      return session;

    var newSession: LocalRestSession = { solutionGuid: sessionGuid, actions: [] };
    this.state.sessions.push(newSession);
    return newSession;
  }

  addAction(event: any) {
    if (event.index < this.currentSession().actions.length)
      return;

    this.newRequest();
  }

  removeAction(event: any) {
    var index = this.currentSession().actions.findIndex(i => i.action.id == event);
    this.currentSession().actions.splice(index, 1);
  }

  onActionChange(event: LocalRestAction) {
    console.log(event);
    // console.log('set dirty');
    this.repo.saveCurrentState(this.state);
  }

  onDirtyChange(event: LocalRestAction, dirty: boolean) {
    console.log(`onDirtyChange(${dirty})`);
    event.dirty = dirty;
  }

  openSolution() {
    console.log('openSolution');
    this.repo.loadSolution();
  }

  newSolution() {
    console.log('newSolution');
    this.repo.newSolution();
  }

  saveSolution() {
    if (this.solution == undefined)
      return;
    console.log('saveSolution');
    this.repo.saveSolution(this.solution);
  }

  saveSolutionAs() {
    if (this.solution == undefined)
      return;
    console.log('saveSolution');
    this.repo.saveSolutionAs(this.solution);
  }

  closeSolution() {
    console.log('closeSolution');
    this.solution = undefined;
  }

  newRequest() {
    console.log('newRequest');
    var count = Math.max(...this.currentSession().actions.filter(f => f.action.name.startsWith('new request'))
      .map(s => s.action.name.substring(12))
      .map(m => m.length == 0 ? 1 : parseInt(m))
      .filter(num => !isNaN(num)));

    this.currentSession().actions.push(this.repo.createNewAction(count + 1));

    setTimeout(() => {
      this.tabs.selectedIndex = (this.currentSession().actions.length ?? 0) - 1;
    });
  }

  saveAsRequest() {
    if (this.tabs?.selectedIndex == null)
      return;

    var action = this.currentSession().actions[this.tabs.selectedIndex];
    this.repo.saveAsRequest(action);
  }

  saveRequest() {
    console.log(`save[${this.tabs?.selectedIndex}]`)

    if (this.tabs?.selectedIndex == null)
      return;

    var action = this.currentSession().actions[this.tabs.selectedIndex];
    this.repo.saveRequest(action);
  }

  openSoution(file: RecentFile) {
    console.log(`openSolution:[${JSON.stringify(file)}]`);
    this.repo.loadSolutionFromFile(file);
  }

  loadAction(selected: SelectedTreeItem) {
    console.log(`loadAction:[${selected.key}] activeTab[${selected.activeTab}]`);

    this.enabledMenuOptions = selected?.enabledMenuOptions ?? [];
    this.selectedType = selected?.type;
    this.selectedSubType = selected?.subtype;

    var existingTab = this.currentSession().actions.findIndex(a => a.fullFilename == selected.key);
    if (existingTab != -1) {
      console.log(`updating existing tab[${existingTab}] with activeTab[${selected.activeTab}] this.currentSession().actions[existingTab].activeTab}] [${this.currentSession().actions[existingTab].activeTab}]`);
      this.currentSession().actions[existingTab].activeTab = selected.activeTab && this.currentSession().actions[existingTab].activeTab;
      console.log(this.currentSession().actions[existingTab]);
      this.tabs.selectedIndex = existingTab;
      return;
    }

    this.repo.loadRequest(selected.key).then(a => {
      var activeTab = this.currentSession().actions.findIndex(a => a.activeTab);
      console.log(`selected.activeTab[${selected.activeTab}] activeTab[${activeTab}] selected.key[${selected.key}]`)
      if (selected.activeTab && activeTab != -1) {
        console.log(`overwriting existing active tab`);
        var newAction: LocalRestAction = { action: a, dirty: false, activeTab: selected.activeTab, fullFilename: selected.key };
        this.currentSession().actions[activeTab] = newAction;
        setTimeout(() => {
          this.tabs.selectedIndex = activeTab;
        });
      } else {
        console.log(`opening to new tab`);
        this.currentSession().actions.forEach(a => a.activeTab = false);
        var newAction: LocalRestAction = { action: a, dirty: false, activeTab: selected.activeTab, fullFilename: selected.key };
        this.currentSession().actions.push(newAction);
        setTimeout(() => {
          this.tabs.selectedIndex = (this.currentSession().actions.length ?? 0) - 1;
        });
      }
    });
  }

  openSystem(selected: SelectedTreeItem) {
    console.log(selected);
    console.log(this.solution?.config?.environments);
    this.enabledMenuOptions = selected?.enabledMenuOptions ?? [];
    this.selectedType = selected?.type;
    this.selectedSubType = selected?.subtype;
    if (selected.type == 'system' && selected.subtype == 'variables') {
      if (selected.key == 'system.settings.variables') {
        this.selectedEnvironment = this.solution?.config?.solutionEnvironment ?? CreateEmptyEnvironment();
      } else {
        this.selectedEnvironment = this.solution?.config?.environments?.find(e => selected.key.endsWith(`${e.id}.variables`)) ?? CreateEmptyEnvironment();
      }
    } else
      if (selected.type == 'system' && selected.subtype == 'secrets') {
        if (selected.key == 'system.settings.secrets') {
          this.selectedEnvironment = this.solution?.config?.solutionEnvironment ?? CreateEmptyEnvironment();
        } else {
          this.selectedEnvironment = this.solution?.config?.environments?.find(e => selected.key.endsWith(`${e.id}.secrets`)) ?? CreateEmptyEnvironment();
        }
      } else
        if (selected.type == 'system' && selected.subtype == 'authentication') {
          if (selected.key == 'system.settings.authentication') {
            this.selectedEnvironment = this.solution?.config?.solutionEnvironment ?? CreateEmptyEnvironment();
          } else {
            this.selectedEnvironment = this.solution?.config?.environments?.find(e => selected.key.endsWith(`${e.id}.authentication`)) ?? CreateEmptyEnvironment();
          }
        } else
          if (selected.type == 'dir' && selected.subtype == 'system.settings.environments') {
            this.selectedEnvironment = this.solution?.config?.environments?.find(e => selected.key.endsWith(e.id)) ?? CreateEmptyEnvironment();
          } else
            if (selected.type == 'dir' && selected.subtype == 'system.settings.secrets') {
              this.selectedEnvironment = this.solution?.config?.environments?.find(e => selected.key.endsWith(e.id)) ?? CreateEmptyEnvironment();
            } else
              if (selected.type == 'dir' && selected.subtype == 'system.settings.authentication') {
                this.selectedEnvironment = this.solution?.config?.environments?.find(e => selected.key.endsWith(e.id)) ?? CreateEmptyEnvironment();
              } else {
                this.selectedEnvironment = CreateEmptyEnvironment();
              }

    console.log(this.selectedEnvironment);
  }

  createEnvironment() {
    if (this.solution == undefined)
      return;

    console.log('createEnvironment');
    var env: Environment = {
      name: 'unnamed',
      id: this.systemSupport.generateGUID(),
      variables: [{ variable: '', value: '', active: true, id: 1 }],
      secrets: [{ $secret: '', $value: '', active: true, id: this.systemSupport.generateGUID() }],
      auth: CreateEmptyAuthenticationDetails('inherit')
    };
    this.solution.config.environments.push(env);
    console.log(this.solution);
    this.repo.storeSolution(this.solution);
  }

  deleteEnvironment() {
    console.log('deleteEnvironment');
    if (this.solution == undefined)
      return;

    console.log(this.solution.config);
    console.log(this.selectedEnvironment);
    this.solution.config.environments = this.solution.config.environments.filter(f => f.name != this.selectedEnvironment.name);
    console.log(this.solution);
    this.repo.storeSolution(this.solution);
  }

  actionDisabled(menuOption: string): boolean {
    return !this.enabledMenuOptions.some(e => e == menuOption);
  }

  actionsVisible(): boolean {
    // console.log(`actionVisible[${this.selectedType}][${this.selectedSubType}]`);
    if (this.selectedType == 'dir' && this.selectedSubType == 'system.settings.environments')
      return false;

    if (this.selectedType != 'system')
      return true;

    return false;
  }

  variablesVisible(): boolean {
    // console.log(`variablesVisible[${this.selectedType}][${this.selectedSubType}]`);
    if (this.selectedType == 'system' && this.selectedSubType == "variables")
      return true;

    return false;
  }

  authenticationVisible(): boolean {
    // console.log(`authenticationVisible[${this.selectedType}][${this.selectedSubType}]`);
    if (this.selectedType == 'system' && this.selectedSubType == "authentication")
      return true;

    return false;
  }

  environmentVisible(): boolean {
    if (this.selectedType == 'dir' && this.selectedSubType == 'system.settings.environments')
      return true;

    return false;
  }

  secretsVisible(): boolean {
    if (this.selectedType == 'system' && this.selectedSubType == 'secrets')
      return true;

    return false;
  }

  environmentChange(env: Environment) {
    if (this.solution == undefined)
      return;

    var solenv = this.solution.config.environments.findIndex(e => e.id == env.id);
    this.solution.config.environments[solenv] = env;
    console.log(this.solution);
    console.log(env);
    console.log(this.selectedEnvironment);
    this.repo.storeSolution(this.solution);
  }
}
