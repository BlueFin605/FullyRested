import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CollectionExplorerComponent } from './collection-explorer.component';

describe('CollectionExplorerComponent', () => {
  let component: CollectionExplorerComponent;
  let fixture: ComponentFixture<CollectionExplorerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ CollectionExplorerComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CollectionExplorerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
