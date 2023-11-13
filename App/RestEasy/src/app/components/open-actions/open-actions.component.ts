import { Component, OnInit, ViewChild, ElementRef, ApplicationRef } from '@angular/core';
import { LocalRestSession, ActionRepositoryService, CurrentState, CreateEmptyLocalAction, Solution } from 'src/app/services/action-repository/action-repository.service'
import { MatTabGroup } from '@angular/material/tabs';

@Component({
  selector: 'app-open-actions',
  templateUrl: './open-actions.component.html',
  styleUrls: ['./open-actions.component.css']
})
export class OpenActionsComponent implements OnInit {
  state: CurrentState = { currentSolution: '', sessions: [] };
  public solution: Solution | undefined;

  @ViewChild('tabs') tabs!: MatTabGroup;
  @ViewChild('FileSelectInputDialog') FileSelectInputDialog!: ElementRef;

  constructor(private repo: ActionRepositoryService, private appRef: ApplicationRef) {
    this.repo.solutions.subscribe(s => {
      console.log(`this.repo.solutions.subscribe => [${s}]`);
      this.solution = s;
      this.appRef.tick();
      console.log(`this.repo.solutions.subscribe, sent`)
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
    // console.log(`addAction`);
    // console.log(event);
    if (event.index < this.currentSession().actions.length)
      return;

    var count = Math.max(...this.currentSession().actions.filter(f => f.action.name.startsWith('new request'))
      .map(s => s.action.name.substring(12))
      .map(m => m.length == 0 ? 1 : parseInt(m))
      .filter(num => !isNaN(num)));

    this.currentSession().actions.push(this.repo.createNewAction(count + 1));
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
}
