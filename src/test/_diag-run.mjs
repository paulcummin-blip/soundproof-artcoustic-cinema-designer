// Temporary diagnostic runner: prints the full stack for a suite that throws at
// import time. Delete after use.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

register('../../test/_alias-loader.mjs', import.meta.url);
register('./_p7-vitest-loader.mjs', import.meta.url);

try {
  await import(pathToFileURL(path.resolve(process.cwd(), process.argv[2])).href);
  console.log('suite loaded without a module-level error');
} catch (error) {
  console.log(error?.stack || error);
}