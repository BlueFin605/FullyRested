import { Injectable } from '@angular/core';
import { Solution, VariableTable, SecretTable } from '../action-repository/action-repository.service';

const regexp = /\{\{(\$?[0-9a-zA-Z]*?)\}\}/g;

@Injectable({
  providedIn: 'root'
})
export class VariableSubstitutionService {

  constructor() { }

  public replaceVariables(text: string, solution: Solution | undefined, overrideVariables: VariableTable[] | undefined, overrideSecrets: SecretTable[] | undefined): string {
    console.log(`replaceVariables[${text}]`);
    var matches = [...text.matchAll(regexp)];

    var combinedSecrets = this.combineAllSecrets(
      overrideSecrets ?? [],
      solution?.config.solutionEnvironment.secrets ?? [],
      solution?.config?.environments?.find(e => e.id == solution.config.selectedEnvironmentId)?.secrets ?? []
    );
    var secrets = this.convertSecretArraysAsValues(combinedSecrets ?? []);


    var combinedVariables = this.combineAllVariables(
      overrideVariables ?? [],
      solution?.config.solutionEnvironment.variables ?? [],
      solution?.config?.environments?.find(e => e.id == solution.config.selectedEnvironmentId)?.variables ?? []
    );
    var variables = this.convertVariableArraysAsValues(combinedVariables ?? []);

    console.log(secrets);
    console.log(variables);

    console.log(matches);
    matches.forEach(m => {
      text = this.substituteValue(text, m[0], m[1], solution, variables, secrets);
    });

    return text;
  }

  private substituteValue(text: string, search: string, valueKey: string, solution: Solution | undefined, overrideVariables: VariableTable[] | undefined, overrideSecrets: SecretTable[] | undefined): string {
    var replaced = text.replace(search, this.findVariable(valueKey, solution, overrideVariables, overrideSecrets));
    return replaced;
  }

  private combineAllSecrets(override: SecretTable[], environment: SecretTable[], solution: SecretTable[]): SecretTable[] {
    return solution.concat(environment, override);
  }

  private convertSecretArraysAsValues(headers: SecretTable[]): SecretTable[] {
    var reverse = headers.reverse();
    headers = reverse.filter((item, index) => reverse.findIndex(i => i.$secret == item.$secret) === index).reverse();
    var converted: SecretTable[] = [];
    return headers.filter(f => f.active == true && f.$secret != '' && f.$value != '');
  }

  private combineAllVariables(override: VariableTable[], environment: VariableTable[], solution: VariableTable[]): VariableTable[] {
    return environment.concat(solution, override);
  }

  private convertVariableArraysAsValues(headers: VariableTable[]): VariableTable[] {
    var reverse = headers.reverse();
    headers = reverse.filter((item, index) => reverse.findIndex(i => i.variable == item.variable) === index).reverse();
    var converted: { [variable: string]: string } = {};
    return headers.filter(f => f.active == true && f.variable != '' && f.variable != '');
  }

  private findVariable(value: string, solution: Solution | undefined, overrideVariables: VariableTable[] | undefined, secrets: SecretTable[] | undefined): string {
    console.log(`findVariable(${value})`)
    console.log(solution?.config.solutionEnvironment.variables)
    console.log(solution?.config.solutionEnvironment.secrets)
    if (solution == undefined)
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
