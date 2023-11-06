import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SolutionExplorerComponent } from './solution-explorer.component';

describe('SolutionExplorerComponent', () => {
  let component: SolutionExplorerComponent;
  let fixture: ComponentFixture<SolutionExplorerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SolutionExplorerComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SolutionExplorerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
