import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon'
import { MatCheckboxModule } from '@angular/material/checkbox';

import { NgxJsonViewerModule } from 'ngx-json-viewer';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { RestActionComponent } from './components/rest-action/rest-action/rest-action.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { DisplayResponseComponent } from './components/rest-action/response/display-response/display-response.component';
import { DisplayResponseBodyComponent } from './components/rest-action/response/display-response-body/display-response-body.component';
import { DisplayResponseHeadersComponent } from './components/rest-action/response/display-response-headers/display-response-headers.component';
import { EditRequestComponent } from './components/rest-action/request/edit-request/edit-request.component';
import { EditRequestHeadersComponent } from './components/rest-action/request/edit-request-headers/edit-request-headers.component';
import { EditRequestParamatersComponent } from './components/rest-action/request/edit-request-paramaters/edit-request-paramaters.component';
import { EditRequestBodyComponent } from './components/rest-action/request/edit-request-body/edit-request-body.component';

@NgModule({
  declarations: [
    AppComponent,
    RestActionComponent,
    DisplayResponseComponent,
    DisplayResponseBodyComponent,
    DisplayResponseHeadersComponent,
    EditRequestComponent,
    EditRequestHeadersComponent,
    EditRequestParamatersComponent,
    EditRequestBodyComponent
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
    FormsModule,
    MatCheckboxModule,
    MatIconModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
