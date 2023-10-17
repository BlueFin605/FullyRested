import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import {MatSelectModule} from '@angular/material/select';
import {MatFormFieldModule, } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {MatTabsModule} from '@angular/material/tabs';
import {MatTableModule} from '@angular/material/table';
import { FormsModule } from '@angular/forms';

import { NgxJsonViewerModule } from 'ngx-json-viewer';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserComponent } from './components/browser/browser.component';
import { RestActionComponent } from './components/rest-action/rest-action.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { DisplayResponseComponent } from './components/display-response/display-response.component';
import { DisplayResponseBodyComponent } from './components/display-response-body/display-response-body.component';
import { DisplayResponseHeadersComponent } from './components/display-response-headers/display-response-headers.component';

@NgModule({
  declarations: [
    AppComponent,
    BrowserComponent,
    RestActionComponent,
    DisplayResponseComponent,
    DisplayResponseBodyComponent,
    DisplayResponseHeadersComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    NgxJsonViewerModule,
    MatFormFieldModule, 
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatTabsModule,
    MatTableModule,
    FormsModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
