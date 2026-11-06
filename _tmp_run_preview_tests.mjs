import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { run } from 'node:test';
import path from 'node:path';

register(pathToFileURL('./test/_alias-loader.mjs').href, pathToFileURL(import.meta.url));
await new Promise(r => setTimeout(r, 100));

const files = process.argv.slice(2).map(f => path.resolve(process.cwd(), f));
const stream = run({ files });
let failed = 0, passed = 0;
stream.on('test:pass', () => passed++);
stream.on('test:fail', (e) => { failed++; console.log('FAIL:', e?.data?.name || e?.name); });
stream.on('end', () => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
