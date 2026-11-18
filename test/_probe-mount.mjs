// Probe: can we import useProjectLoader through the mount loader?
import { register } from 'node:module';
register('./_mount-loader.mjs', import.meta.url);
try {
  const mod = await import('@/components/hooks/useProjectLoader');
  console.log('IMPORT OK', typeof mod.useProjectLoader);
} catch (e) {
  console.log('IMPORT FAILED:', e.message);
  console.log(e.stack?.split('\n').slice(0, 8).join('\n'));
}