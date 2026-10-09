import { Injectable } from '@angular/core';
import { guidGenerator } from '@fullyrested/core';

@Injectable({
  providedIn: 'root'
})
export class SystemSupportService implements guidGenerator {

  constructor() { }

  generateGUID(): string {
    return crypto.randomUUID();
  }
}
