// Focused-suite runner: `node src/test/_p7-run.mjs <suite> [<suite> ...]`
// Loads the app's alias/JSX loader plus the vitest stub, runs each suite file and
// prints one line per test.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

register('../../test/_alias-loader.mjs', import.meta.url);
register('./_p7-vitest-loader.mjs', import.meta.url);

const files = process.argv.slice(2);
const { results } = await import('./_p7-vitest-stub.mjs');

let failed = 0;
let passed = 0;
for (const file of files) {
  results.length = 0;
  try {
    await import(pathToFileURL(path.resolve(process.cwd(), file)).href);
  } catch (error) {
    failed += 1;
    console.log(`ERROR ${file}: ${error?.message || error}`);
    continue;
  }
  for (const result of results) {
    if (result.error) {
      failed += 1;
      console.log(`FAIL  ${result.name}\n      ${result.error}`);
    } else {
      passed += 1;
      console.log(`PASS  ${result.name}`);
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);