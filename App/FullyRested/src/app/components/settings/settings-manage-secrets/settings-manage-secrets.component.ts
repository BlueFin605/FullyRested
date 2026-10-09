import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { SecretTable } from '@fullyrested/core';

@Component({
  selector: 'app-settings-manage-secrets',
  templateUrl: './settings-manage-secrets.component.html',
  styleUrls: ['./settings-manage-secrets.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SettingsManageSecretsComponent {
  @Input()
  secrets: SecretTable[] = [];

  @Output()
  secretsChange = new EventEmitter<SecretTable[]>();

  onRowsChange(rows: SecretTable[]) {
    this.secrets = rows;
    this.secretsChange.emit(this.secrets);
  }
}
