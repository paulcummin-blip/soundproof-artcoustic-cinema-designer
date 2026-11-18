import { register } from 'node:module';
register('./_alias-loader.mjs', import.meta.url);

try {
  const m = await import('@/components/hooks/useProjectLoader.jsx');
  console.log('useProjectLoader imported OK, export:', typeof m.useProjectLoader);
} catch (e) {
  console.error('IMPORT FAILED:', e.message.split('\n')[0]);
  let cause = e;
  while (cause?.cause) { cause = cause.cause; console.error('  ->', cause.message.split('\n')[0].slice(0,150)); }
}