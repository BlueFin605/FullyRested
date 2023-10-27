import { Injectable } from '@angular/core';

export interface ContentType {
  part1: string;
  part2: string;
  encoding: string;

}
@Injectable({
  providedIn: 'root'
})
export class ContentTypeHelperService {

  constructor() { }

  convertArrayBufferToString(contentType: string | undefined, buffer: ArrayBuffer | undefined): string {
    if (contentType == undefined)
      return '';

    var type = this.decode(contentType);
    var enc = new TextDecoder(type.encoding);
    return enc.decode(buffer);
  }

  decode(contentType: string): ContentType {
    var split = contentType.split(/[\s;/]+/);
    var part1 = split[0];
    var part2 = "";
    var encoding = "utf-8"

    if (split.length > 1)
      part2 = split[1];

    if (split.length > 2) {
      if (split[2].startsWith('charset='))
         encoding = split[2].substring(8);
    }

    return { part1: part1, part2: part2, encoding: encoding };
  }
}
