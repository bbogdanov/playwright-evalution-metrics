import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { isRichSearch } from './app/core/ui';

// The Material shell is loaded only for ?ui=rich, so the benchmark's default
// page neither renders it nor parses its code.
const root = isRichSearch(location.search)
  ? import('./app/rich/rich-shell.component').then((m) => m.RichShellComponent)
  : Promise.resolve(App);

root
  .then((component) => bootstrapApplication(component, appConfig))
  .catch((err) => console.error(err));
