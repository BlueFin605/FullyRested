import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { EffectiveSettings, EffectiveValue, RequestNode, RunNode, SettingSource } from '@fullyrested/core';

export interface InheritedSettingRow {
  kind: string;
  name: string;
  value: string;
  from: string;
  overridden: boolean;
}

// What a request or run gets from the levels above it, and where each value comes from
@Component({
  selector: 'app-inherited-settings',
  templateUrl: './inherited-settings.component.html',
  styleUrls: ['./inherited-settings.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class InheritedSettingsComponent {
  @Input() node: RequestNode | RunNode | undefined;
  @Input() environmentId: string | undefined;
  expanded = false;

  // Recomputed while expanded so edits anywhere show straight away; the lists are small
  get view(): { rows: InheritedSettingRow[]; error: string } {
    if (!this.expanded || this.node == undefined) return { rows: [], error: '' };

    let settings: EffectiveSettings;
    try {
      settings = this.node.effectiveSettings({ environmentId: this.environmentId });
    } catch (error) {
      return { rows: [], error: (error as Error).message };
    }

    const own = this.node.kind;
    const above = <T>(values: EffectiveValue<T>[]) => values.filter((v) => v.source.kind != own);
    const rows: InheritedSettingRow[] = [
      ...above(settings.headers).map((v) => this.row('Header', v.value.key, v.value.value, v)),
      ...above(settings.variables).map((v) => this.row('Variable', v.value.variable, v.value.value, v)),
      ...above(settings.secrets).map((v) => this.row('Secret', v.value.$secret, '••••••', v)),
    ];
    if (settings.auth != undefined && settings.auth.source.kind != own)
      rows.push(this.row('Auth', settings.auth.value.authentication, '', settings.auth));
    return { rows, error: '' };
  }

  private row(kind: string, name: string, value: string, v: EffectiveValue<unknown>): InheritedSettingRow {
    return { kind, name, value, from: this.sourceLabel(v.source), overridden: v.overridden };
  }

  sourceLabel(source: SettingSource): string {
    switch (source.kind) {
      case 'folder':
        return `folder ${source.name}`;
      case 'environment':
        return `environment ${source.name}`;
      default:
        return source.kind;
    }
  }

  toggle() {
    this.expanded = !this.expanded;
  }
}
