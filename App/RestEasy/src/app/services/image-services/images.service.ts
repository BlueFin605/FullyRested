import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
//const electron = (<any>window).require('electron');

@Injectable({
  providedIn: 'root'
})
export class ImagesService {
  images = new BehaviorSubject<string[]>([]);
  directory = new BehaviorSubject<string[]>([]);

  constructor() {
    if (this.getIpcRenderer() == undefined)
       return;

    this.getIpcRenderer().receive('getImagesResponse', (images: string[]) => {
      this.images.next(images);
    });

    this.getIpcRenderer().receive('getDirectoryResponse', (directory: string[]) => {
     console.log(`getDirectoryResponse[${directory}]`);
      this.directory.next(directory);
    });
  }

  getIpcRenderer(){
    return (<any>window).ipc;
  }

  navigateDirectory(path: string) {
    if (this.getIpcRenderer() == undefined)
       return;
      
    this.getIpcRenderer().send('navigateDirectory', path);
  }
}