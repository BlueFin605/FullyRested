import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import {
  CreateEmptyAuthenticationDetailsAwsSig,
  isRawCredential,
} from '@fullyrested/core';
import { AuthenticationDetailsAWSSig } from '@fullyrested/core';

@Component({
  selector: 'app-settings-manage-authentication-awssig',
  templateUrl: './settings-manage-authentication-awssig.component.html',
  styleUrls: ['./settings-manage-authentication-awssig.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SettingsManageAuthenticationAWSSigComponent implements OnInit {
  @Input()
  awssig: AuthenticationDetailsAWSSig =
    CreateEmptyAuthenticationDetailsAwsSig();

  @Output()
  awssigChange = new EventEmitter<AuthenticationDetailsAWSSig>();

  readonly rawCredentialHint =
    'Saved in plain text — use a {{$secret}} reference';

  constructor() {}

  ngOnInit(): void {}

  raw(value: string | undefined): boolean {
    return isRawCredential(value);
  }

  onChange($event: any) {
    this.awssigChange.emit(this.awssig);
  }
}
