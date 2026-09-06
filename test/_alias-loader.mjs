
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { transformSync } from 'esbuild';
const srcDir = new URL('../src/', import.meta.url).pathname;
function tryResolve(basePath) {
  const candidates = [basePath, basePath + '.js', basePath + '.jsx', basePath + '.json', basePath + '/index.js', basePath + '/index.jsx'];
  for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  return null;
}
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const resolved = tryResolve(srcDir + specifier.slice(2));
    if (resolved) return nextResolve(pathToFileURL(resolved).href, context);
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const lastSegment = specifier.split('/').pop();
    if (!lastSegment.includes('.') && context.parentURL) {
      const basePath = new URL(specifier, context.parentURL).pathname;
      const resolved = tryResolve(basePath);
      if (resolved) return nextResolve(pathToFileURL(resolved).href, context);
    }
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url.endsWith('.jsx') || url.endsWith('.tsx')) {
    const source = fs.readFileSync(new URL(url).pathname, 'utf8');
    const result = transformSync(source, { loader: 'jsx', format: 'esm', jsx: 'automatic' });
    return { format: 'module', source: result.code, shortCircuit: true };
  }
  return nextLoad(url, context);
}
