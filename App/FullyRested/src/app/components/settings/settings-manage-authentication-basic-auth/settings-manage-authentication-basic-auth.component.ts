import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import {
  CreateEmptyAuthenticationDetailsBasicAuth,
  isRawCredential,
} from '@fullyrested/core';
import { AuthenticationDetailsBasicAuth } from '@fullyrested/core';

@Component({
  selector: 'app-settings-manage-authentication-basic-auth',
  templateUrl: './settings-manage-authentication-basic-auth.component.html',
  styleUrls: ['./settings-manage-authentication-basic-auth.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SettingsManageAuthenticationBasicAuthComponent implements OnInit {
  @Input()
  basicauth: AuthenticationDetailsBasicAuth =
    CreateEmptyAuthenticationDetailsBasicAuth();

  @Output()
  basicauthChange = new EventEmitter<AuthenticationDetailsBasicAuth>();

  readonly rawCredentialHint =
    'Saved in plain text — use a {{$secret}} reference';

  constructor() {}

  ngOnInit(): void {}

  raw(value: string | undefined): boolean {
    return isRawCredential(value);
  }

  onChange($event: any) {
    this.basicauthChange.emit(this.basicauth);
  }
}
