import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import {MatSelectModule} from '@angular/material/select';
import {MatFormFieldModule, } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import { FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserComponent } from './components/browser/browser.component';
import { RestActionComponent } from './components/rest-action/rest-action.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { DisplayResponseComponent } from './components/display-response/display-response.component';

@NgModule({
  declarations: [
    AppComponent,
    BrowserComponent,
    RestActionComponent,
    DisplayResponseComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    MatFormFieldModule, 
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    FormsModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
