import { Injectable } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';
import { guidGenerator } from '../../../../../shared/src';

@Injectable({
  providedIn: 'root'
})
export class SystemSupportService implements guidGenerator {

  constructor() { }

  generateGUID(): string {
    return uuidv4();
  }
}
