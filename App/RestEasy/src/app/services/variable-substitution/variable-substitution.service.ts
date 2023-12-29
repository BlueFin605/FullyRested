import { Injectable } from '@angular/core';
import { Collection, VariableTable, SecretTable } from '../../../../../shared';

const regexp = /\{\{(\$?[0-9a-zA-Z]*?)\}\}/g;

@Injectable({
  providedIn: 'root'
})
export class VariableSubstitutionService {

  constructor() { }

  public replaceVariables(text: string, collection: Collection | undefined, overrideVariables: VariableTable[] | undefined, overrideSecrets: SecretTable[] | undefined): string {
    console.log(`replaceVariables[${text}]`);
    var matches = [...text.matchAll(regexp)];

    var combinedSecrets = this.combineAllSecrets(
      overrideSecrets ?? [],
      collection?.config.collectionEnvironment.secrets ?? [],
      collection?.config?.environments?.find(e => e.id == collection.config.selectedEnvironmentId)?.secrets ?? []
    );
    var secrets = this.convertSecretArraysAsValues(combinedSecrets ?? []);


    var combinedVariables = this.combineAllVariables(
      overrideVariables ?? [],
      collection?.config.collectionEnvironment.variables ?? [],
      collection?.config?.environments?.find(e => e.id == collection.config.selectedEnvironmentId)?.variables ?? []
    );
    var variables = this.convertVariableArraysAsValues(combinedVariables ?? []);

    console.log(secrets);
    console.log(variables);

    console.log(matches);
    matches.forEach(m => {
      text = this.substituteValue(text, m[0], m[1], collection, variables, secrets);
    });

    return text;
  }

  private substituteValue(text: string, search: string, valueKey: string, collection: Collection | undefined, overrideVariables: VariableTable[] | undefined, overrideSecrets: SecretTable[] | undefined): string {
    var replaced = text.replace(search, this.findVariable(valueKey, collection, overrideVariables, overrideSecrets));
    return replaced;
  }

  private combineAllSecrets(override: SecretTable[], environment: SecretTable[], collection: SecretTable[]): SecretTable[] {
    return collection.concat(environment, override);
  }

  private convertSecretArraysAsValues(headers: SecretTable[]): SecretTable[] {
    var reverse = headers.reverse();
    headers = reverse.filter((item, index) => reverse.findIndex(i => i.$secret == item.$secret) === index).reverse();
    var converted: SecretTable[] = [];
    return headers.filter(f => f.active == true && f.$secret != '' && f.$value != '');
  }

  private combineAllVariables(override: VariableTable[], environment: VariableTable[], collection: VariableTable[]): VariableTable[] {
    return environment.concat(collection, override);
  }

  private convertVariableArraysAsValues(headers: VariableTable[]): VariableTable[] {
    var reverse = headers.reverse();
    headers = reverse.filter((item, index) => reverse.findIndex(i => i.variable == item.variable) === index).reverse();
    var converted: { [variable: string]: string } = {};
    return headers.filter(f => f.active == true && f.variable != '' && f.variable != '');
  }

  private findVariable(value: string, collection: Collection | undefined, overrideVariables: VariableTable[] | undefined, secrets: SecretTable[] | undefined): string {
    console.log(`findVariable(${value})`)
    console.log(collection?.config.collectionEnvironment.variables)
    console.log(collection?.config.collectionEnvironment.secrets)
    if (collection == undefined)
      return "";

    var overrideVar: string | undefined;
    var solVar: string | undefined;
    var envVar: string | undefined;
    if (value.startsWith('$')) {
      value = value.substring(1);
      return secrets?.find(v => v.$secret == value)?.$value ?? "";
    } else {
      return overrideVariables?.find(v => v.variable == value)?.value ?? "";
    }

    return overrideVar ?? envVar ?? solVar ?? "";
  }
}
