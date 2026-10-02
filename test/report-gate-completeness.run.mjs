// Runner for the report gate completeness tests.
//
// Registers the repository's '@/' alias loader first, then imports the test so
// the app's real modules are exercised — no preload flag required.
//
// Run: node test/report-gate-completeness.run.mjs

import { register } from 'node:module';

register('./_alias-loader.mjs', import.meta.url);

await import('./report-gate-completeness.test.mjs');