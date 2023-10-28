import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RestActionComponent } from './components/rest-action/rest-action/rest-action.component';
import { OpenActionsComponent } from './open-actions/open-actions.component';

const routes: Routes = [
  { path: '', component: OpenActionsComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
