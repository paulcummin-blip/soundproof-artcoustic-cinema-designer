// Runner: registers the app alias/JSX loader and runs the cover-slot suite.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

register('./_alias-loader.mjs', import.meta.url);

const file = process.argv[2] || 'test/project-library-cover-slots.test.mjs';
await import(pathToFileURL(path.resolve(process.cwd(), file)).href);
// node:test suites run on import; give the process a tick to flush.
await new Promise((r) => setTimeout(r, 50));
