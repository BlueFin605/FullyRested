import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RestActionComponent } from './components/rest-action/rest-action.component';

const routes: Routes = [
  { path: '', component: RestActionComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
