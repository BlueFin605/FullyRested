import { Pipe, PipeTransform } from '@angular/core';

const LABELS: { [verb: string]: string } = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DEL',
  option: 'OPT',
};

// Short, fixed-width-ish method label for tabs and the tree: "delete" -> "DEL"
@Pipe({
  name: 'verbLabel',
  standalone: false,
})
export class VerbLabelPipe implements PipeTransform {
  transform(verb: string | undefined | null): string {
    if (verb == undefined) return '';
    return LABELS[verb] ?? verb.toUpperCase();
  }
}
