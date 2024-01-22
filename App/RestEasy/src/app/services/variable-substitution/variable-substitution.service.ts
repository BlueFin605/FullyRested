import { Injectable } from '@angular/core';
import { Collection, VariableTable, SecretTable } from '../../../../../shared/runner';
import { IExecuteRestAction } from '../../../../../shared/builder/src';

const regexp = /\{\{(\$?[0-9a-zA-Z]*?)\}\}/g;

@Injectable({
  providedIn: 'root'
})
export class VariableSubstitutionService {

  constructor() { }
  public replaceVariables(text: string, variables: VariableTable[] | undefined, secrets: SecretTable[] | undefined): string {
    console.log(`replaceVariables[${text}]`);
    var matches = [...text.matchAll(regexp)];

    console.log(matches);
    matches.forEach(m => {
      text = this.substituteValue(text, m[0], m[1], variables, secrets);
    });

    return text;
  }

  private substituteValue(text: string, search: string, valueKey: string, overrideVariables: VariableTable[] | undefined, overrideSecrets: SecretTable[] | undefined): string {
    var variables = overrideVariables?.filter(f => f.active == true);
    var secrets = overrideSecrets?.filter(f => f.active == true);
    var replaced = text.replace(search, this.findVariable(valueKey, variables, secrets));
    return replaced;
  }

  private findVariable(value: string, variables: VariableTable[] | undefined, secrets: SecretTable[] | undefined): string {
    console.log(`findVariable(${value})`)
    if (value.startsWith('$')) {
      value = value.substring(1);
      return secrets?.find(v => v.$secret == value)?.$value ?? "";
    } else {
      return variables?.find(v => v.variable == value)?.value ?? "";
    }
  }
}
