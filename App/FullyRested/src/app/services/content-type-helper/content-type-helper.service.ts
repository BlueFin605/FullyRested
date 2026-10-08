import { Injectable } from '@angular/core';
import { ContentType, bodyToString, decodeContentType } from '@fullyrested/core';

@Injectable({
  providedIn: 'root'
})
export class ContentTypeHelperService {
  convertArrayBufferToString(contentType: string | undefined, buffer: ArrayBuffer | undefined): string {
    if (contentType == undefined)
      return '';

    return bodyToString(contentType, buffer);
  }

  decode(contentType: string): ContentType {
    return decodeContentType(contentType);
  }
}
