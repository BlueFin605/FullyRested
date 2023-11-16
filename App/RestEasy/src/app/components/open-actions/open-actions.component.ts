import { Component, OnInit, ViewChild, ElementRef, ApplicationRef } from '@angular/core';
import { LocalRestSession, ActionRepositoryService, CurrentState, RecentFile, Solution } from 'src/app/services/action-repository/action-repository.service'
import { MatTabGroup } from '@angular/material/tabs';

@Component({
  selector: 'app-open-actions',
  templateUrl: './open-actions.component.html',
  styleUrls: ['./open-actions.component.css']
})
export class OpenActionsComponent implements OnInit {
  state: CurrentState = { currentSolution: '', sessions: [], recentSolutions: [] };
  public solution: Solution | undefined;

  @ViewChild('tabs') tabs!: MatTabGroup;
  @ViewChild('FileSelectInputDialog') FileSelectInputDialog!: ElementRef;

  constructor(private repo: ActionRepositoryService, private appRef: ApplicationRef) {
    this.repo.solutions.subscribe(s => {
      console.log(`this.repo.solutions.subscribe => [${JSON.stringify(s)}]`);
      console.log(this.state);
      this.solution = s;
      // this.appRef.tick();
      if (s != undefined) {
        this.state.recentSolutions = this.state.recentSolutions.filter(f => f.fullFileName != s.filename).slice(0,4);
        this.state.recentSolutions.unshift({fullFileName: s.filename, name: s.name, path: s.path});  //push to front
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
      if (action != undefined)
      {
        action.dirty = false;
        action.fullFilename = a.fullFilename;
        action.action.name = a.name;
      }

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
  
  onActionChange(event: any) {
    // console.log(this.state);
    this.repo.saveCurrentState(this.state);
  }
  
  openSolution() {
    console.log('openSolution');
    this.repo.loadSolution();
  }
  
  closeSolution() {
    console.log('closeSolution');
    this.solution = undefined;
  }
  
  newRequest() {
    console.log('closeSolution');
    var count = Math.max(...this.currentSession().actions.filter(f => f.action.name.startsWith('new request'))
      .map(s => s.action.name.substring(12))
      .map(m => m.length == 0 ? 1 : parseInt(m))
      .filter(num => !isNaN(num)));
    
    this.currentSession().actions.push(this.repo.createNewAction(count + 1));    
  }

  saveAsRequest() {
    if (this.tabs?.selectedIndex == null)
       return;

    var action = this.currentSession().actions[this.tabs.selectedIndex];
    this.repo.saveAsRequest(action);
  }

  saveRequest() {

  }

  openSoution(file: RecentFile) {
    console.log(`openSolution:[${JSON.stringify(file)}]`);
    this.repo.loadSolutionFromFile(file);
  }
}
