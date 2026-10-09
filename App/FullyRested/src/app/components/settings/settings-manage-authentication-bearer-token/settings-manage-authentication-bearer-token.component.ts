import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import {
  CreateEmptyAuthenticationDetailsBearerToken,
  isRawCredential,
} from '@fullyrested/core';
import { AuthenticationDetailsBearerToken } from '@fullyrested/core';

@Component({
  selector: 'app-settings-manage-authentication-bearer-token',
  templateUrl: './settings-manage-authentication-bearer-token.component.html',
  styleUrls: ['./settings-manage-authentication-bearer-token.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SettingsManageAuthenticationBearerTokenComponent implements OnInit {
  @Input()
  bearertoken: AuthenticationDetailsBearerToken =
    CreateEmptyAuthenticationDetailsBearerToken();

  @Output()
  bearertokenChange = new EventEmitter<AuthenticationDetailsBearerToken>();

  readonly rawCredentialHint =
    'Saved in plain text — use a {{$secret}} reference';

  constructor() {}

  ngOnInit(): void {}

  raw(value: string | undefined): boolean {
    return isRawCredential(value);
  }

  onChange($event: any) {
    this.bearertokenChange.emit(this.bearertoken);
  }
}
