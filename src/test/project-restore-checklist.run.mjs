// Runner for the restore-checklist acceptance tests.
//
// Registers the repository's '@/' alias loader first, then imports the test so
// the app's real modules are exercised — no preload flag required.
//
// Run: node src/test/project-restore-checklist.run.mjs

import { register } from 'node:module';

register('./_alias-loader.mjs', import.meta.url);

await import('./project-restore-checklist.test.mjs');