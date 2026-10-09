import { APP_BASE_HREF } from '@angular/common';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppModule } from './app.module';
import { AppComponent } from './app.component';
import { OpenActionsComponent } from './components/open-actions/open-actions.component';
import { CollectionExplorerComponent } from './components/collection-explorer/collection-explorer.component';
import { RestActionComponent } from './components/rest-action/rest-action/rest-action.component';
import { RestActionRunComponent } from './components/rest-action/rest-action-run/rest-action-run.component';
import { EditRequestComponent } from './components/rest-action/request/edit-request/edit-request.component';
import { EditRequestHeadersComponent } from './components/rest-action/request/edit-request-headers/edit-request-headers.component';
import { EditRequestParametersComponent } from './components/rest-action/request/edit-request-parameters/edit-request-parameters.component';
import { EditRequestBodyComponent } from './components/rest-action/request/edit-request-body/edit-request-body.component';
import { EditRequestAuthenticationComponent } from './components/rest-action/request/edit-request-authentication/edit-request-authentication.component';
import { EditRequestRunComponent } from './components/rest-action/request/edit-request-run/edit-request-run.component';
import { EditRequestValidationComponent } from './components/rest-action/request/edit-request-validation/edit-request-validation.component';
import { DisplayResponseComponent } from './components/rest-action/response/display-response/display-response.component';
import { DisplayResponseBodyComponent } from './components/rest-action/response/display-response-body/display-response-body.component';
import { DisplayResponseHeadersComponent } from './components/rest-action/response/display-response-headers/display-response-headers.component';
import { DisplayResponseBodyImageComponent } from './components/rest-action/response/display-response-body-image/display-response-body-image.component';
import { CodeEditorComponent } from './components/code-editor/code-editor.component';
import { KeyValueTableComponent } from './components/key-value-table/key-value-table.component';
import { SplitPaneComponent } from './components/split-pane/split-pane.component';
import { SettingsManageVariablesComponent } from './components/settings/settings-manage-variables/settings-manage-variables.component';
import { SettingsManageSecretsComponent } from './components/settings/settings-manage-secrets/settings-manage-secrets.component';
import { SettingsManageEnvironmentComponent } from './components/settings/settings-manage-environment/settings-manage-environment.component';
import { SettingsManageAuthenticationComponent } from './components/settings/settings-manage-authentication/settings-manage-authentication.component';
import { SettingsManageAuthenticationAWSSigComponent } from './components/settings/settings-manage-authentication-awssig/settings-manage-authentication-awssig.component';
import { SettingsManageAuthenticationBasicAuthComponent } from './components/settings/settings-manage-authentication-basic-auth/settings-manage-authentication-basic-auth.component';
import { SettingsManageAuthenticationBearerTokenComponent } from './components/settings/settings-manage-authentication-bearer-token/settings-manage-authentication-bearer-token.component';
import { SettingsManageAuthenticationNoneComponent } from './components/settings/settings-manage-authentication-none/settings-manage-authentication-none.component';
import { SettingsManageAuthenticationInheritComponent } from './components/settings/settings-manage-authentication-inherit/settings-manage-authentication-inherit.component';

// Replaces the per-component "should create" boilerplate: every component the app declares has to
// compile against the real AppModule (so a missing Material/forms import fails here) and render
// with its default inputs, in browser mode (no Electron ipc).
const components: Type<unknown>[] = [
  AppComponent, OpenActionsComponent, CollectionExplorerComponent, KeyValueTableComponent,
  RestActionComponent, RestActionRunComponent,
  EditRequestComponent, EditRequestHeadersComponent, EditRequestParametersComponent, EditRequestBodyComponent,
  EditRequestAuthenticationComponent, EditRequestRunComponent, EditRequestValidationComponent,
  DisplayResponseComponent, DisplayResponseBodyComponent, DisplayResponseHeadersComponent,
  DisplayResponseBodyImageComponent, CodeEditorComponent, SplitPaneComponent,
  SettingsManageVariablesComponent, SettingsManageSecretsComponent, SettingsManageEnvironmentComponent,
  SettingsManageAuthenticationComponent, SettingsManageAuthenticationAWSSigComponent,
  SettingsManageAuthenticationBasicAuthComponent, SettingsManageAuthenticationBearerTokenComponent,
  SettingsManageAuthenticationNoneComponent, SettingsManageAuthenticationInheritComponent,
];

describe('AppModule components', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppModule],
      providers: [{ provide: APP_BASE_HREF, useValue: '/' }],
    }).compileComponents();
  });

  for (const component of components) {
    it(`renders ${component.name}`, () => {
      const fixture = TestBed.createComponent(component);
      fixture.detectChanges();
      expect(fixture.componentInstance).toBeTruthy();
      fixture.destroy();
    });
  }
});
