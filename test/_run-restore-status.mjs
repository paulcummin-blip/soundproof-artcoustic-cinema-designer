// Temporary runner: registers @/ alias then runs the restore-status test file.
import { register } from 'node:module';
register('./_alias-loader.mjs', import.meta.url);
await import('./restore-status-authority.test.mjs');