import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CreateEmptyAuthenticationDetails } from '@fullyrested/core';
import { AuthenticationDetails } from '@fullyrested/core';

@Component({
  selector: 'app-settings-manage-authentication',
  templateUrl: './settings-manage-authentication.component.html',
  styleUrls: ['./settings-manage-authentication.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SettingsManageAuthenticationComponent implements OnInit {
  @Input()
  auth: AuthenticationDetails = CreateEmptyAuthenticationDetails('inherit');

  @Output()
  authChange = new EventEmitter<AuthenticationDetails>();

  //selected: string = 'awssig';

  constructor() {}

  ngOnInit(): void {}

  onChange($event: any) {
    this.authChange.emit(this.auth);
  }
}
