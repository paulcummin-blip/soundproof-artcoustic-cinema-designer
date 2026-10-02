// Runner for the project opening readiness tests.
//
// Registers the repository's '@/' + JSX loader (test/_alias-loader.mjs) first,
// then imports the test so the app's real modules are exercised — no preload
// flag required.
//
// Run: node src/test/project-opening-readiness.run.mjs

import { register } from 'node:module';

register('../../test/_alias-loader.mjs', import.meta.url);

await import('./project-opening-readiness.test.mjs');