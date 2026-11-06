import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { run } from 'node:test';

register('./test/_alias-loader.mjs', import.meta.url);

const files = [
  'test/preview-all-seats-overlay.test.mjs',
  'test/preview-seat-curve-authority.test.mjs',
].map(f => pathToFileURL(f).href);

let failed = 0, passed = 0;
const stream = run({ files });
stream.on('test:pass', (t) => { passed++; console.log('PASS', t.name); });
stream.on('test:fail', (t) => {
  failed++;
  console.error('FAIL:', t.name);
  if (t.details?.error) console.error(t.details.error?.stack || t.details.error?.message || t.details.error);
});
stream.on('end', () => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
