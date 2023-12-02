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
import { MatRadioModule } from '@angular/material/radio';
import { MatMenuModule } from '@angular/material/menu';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatToolbarModule } from '@angular/material/toolbar';

import { NgxJsonViewerModule } from 'ngx-json-viewer';
import { AngJsoneditorModule } from '@maaxgr/ang-jsoneditor' 
import { TreeviewModule } from '@treeview/ngx-treeview';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { RestActionComponent } from './components/rest-action/rest-action/rest-action.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { DisplayResponseComponent } from './components/rest-action/response/display-response/display-response.component';
import { DisplayResponseBodyComponent } from './components/rest-action/response/display-response-body/display-response-body.component';
import { DisplayResponseHeadersComponent } from './components/rest-action/response/display-response-headers/display-response-headers.component';
import { EditRequestComponent } from './components/rest-action/request/edit-request/edit-request.component';
import { EditRequestHeadersComponent } from './components/rest-action/request/edit-request-headers/edit-request-headers.component';
import { EditRequestParametersComponent } from './components/rest-action/request/edit-request-parameters/edit-request-parameters.component';
import { EditRequestBodyComponent } from './components/rest-action/request/edit-request-body/edit-request-body.component';
import { DisplayResponseBodyJsonComponent } from './components/rest-action/response/display-response-body-json/display-response-body-json.component';
import { DisplayResponseBodyDefaultComponent } from './components/rest-action/response/display-response-body-default/display-response-body-default.component';
import { DisplayResponseBodyImageComponent } from './components/rest-action/response/display-response-body-image/display-response-body-image.component';
import { DisplayResponseBodyHtmlComponent } from './components/rest-action/response/display-response-body-html/display-response-body-html.component';
import { DisplayResponseBodyXmlComponent } from './components/rest-action/response/display-response-body-xml/display-response-body-xml.component';
import { OpenActionsComponent } from './components/open-actions/open-actions.component';
import { SolutionExplorerComponent } from './components/solution-explorer/solution-explorer.component';
import { EditRequestAuthenticationComponent } from './components/rest-action/request/edit-request-authentication/edit-request-authentication.component';
import { SettingsManageVariablesComponent } from './components/settings/settings-manage-variables/settings-manage-variables.component';
import { SettingsManageAuthenticationComponent } from './components/settings/settings-manage-authentication/settings-manage-authentication.component';
import { SettingsManageEnvironmentComponent } from './components/settings/settings-manage-environment/settings-manage-environment.component';
import { SettingsManageSecretsComponent } from './components/settings/settings-manage-secrets/settings-manage-secrets.component';
import { SettingsManageAuthenticationAWSSigComponent } from './components/settings/settings-manage-authentication-awssig/settings-manage-authentication-awssig.component';
import { SettingsManageAuthenticationNoneComponent } from './components/settings/settings-manage-authentication-none/settings-manage-authentication-none.component';
import { SettingsManageAuthenticationInheritComponent } from './components/settings/settings-manage-authentication-inherit/settings-manage-authentication-inherit.component';
import { SettingsManageAuthenticationBasicAuthComponent } from './components/settings/settings-manage-authentication-basic-auth/settings-manage-authentication-basic-auth.component';
import { SettingsManageAuthenticationBearerTokenComponent } from './components/settings/settings-manage-authentication-bearer-token/settings-manage-authentication-bearer-token.component';

@NgModule({
  declarations: [
    AppComponent,
    RestActionComponent,
    DisplayResponseComponent,
    DisplayResponseBodyComponent,
    DisplayResponseHeadersComponent,
    EditRequestComponent,
    EditRequestHeadersComponent,
    EditRequestParametersComponent,
    EditRequestBodyComponent,
    DisplayResponseBodyJsonComponent,
    DisplayResponseBodyDefaultComponent,
    DisplayResponseBodyImageComponent,
    DisplayResponseBodyHtmlComponent,
    DisplayResponseBodyXmlComponent,
    OpenActionsComponent,
    SolutionExplorerComponent,
    EditRequestAuthenticationComponent,
    SettingsManageVariablesComponent,
    SettingsManageAuthenticationComponent,
    SettingsManageEnvironmentComponent,
    SettingsManageSecretsComponent,
    SettingsManageAuthenticationAWSSigComponent,
    SettingsManageAuthenticationNoneComponent,
    SettingsManageAuthenticationInheritComponent,
    SettingsManageAuthenticationBasicAuthComponent,
    SettingsManageAuthenticationBearerTokenComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    NgxJsonViewerModule,
    AngJsoneditorModule,
    TreeviewModule.forRoot(),
    MatFormFieldModule, 
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatTabsModule,
    MatTableModule,
    MatMenuModule,
    FormsModule,
    MatCheckboxModule,
    MatIconModule,
    MatRadioModule,
    MatListModule,
    MatTooltipModule,
    MatToolbarModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
