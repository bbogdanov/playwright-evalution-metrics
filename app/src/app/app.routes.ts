import { Routes } from '@angular/router';

/**
 * Every route is lazily loaded. That keeps the initial bundle small so that
 * navigation cost in a scenario is dominated by rendering the DOM under test
 * rather than by parsing JavaScript for routes the scenario never visits.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./routes/home/home.component').then((m) => m.HomeComponent) },
  { path: 'grid', loadComponent: () => import('./routes/grid/grid.component').then((m) => m.GridComponent) },
  { path: 'deep', loadComponent: () => import('./routes/deep/deep.component').then((m) => m.DeepComponent) },
  { path: 'churn', loadComponent: () => import('./routes/churn/churn.component').then((m) => m.ChurnComponent) },
  { path: 'late', loadComponent: () => import('./routes/late/late.component').then((m) => m.LateComponent) },
  { path: 'ambiguous', loadComponent: () => import('./routes/ambiguous/ambiguous.component').then((m) => m.AmbiguousComponent) },
  { path: 'forms', loadComponent: () => import('./routes/forms/forms.component').then((m) => m.FormsComponent) },
  { path: 'shadow', loadComponent: () => import('./routes/shadow/shadow.component').then((m) => m.ShadowComponent) },
  { path: 'virtual', loadComponent: () => import('./routes/virtual/virtual.component').then((m) => m.VirtualComponent) },
  { path: 'material', loadComponent: () => import('./routes/material/material.component').then((m) => m.MaterialComponent) },
  { path: 'a11y', loadComponent: () => import('./routes/a11y/a11y.component').then((m) => m.A11yComponent) },
  { path: '**', redirectTo: '' },
];
