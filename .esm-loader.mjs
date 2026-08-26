
import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { resolve as pathResolve, dirname, join } from 'node:path';
import { transformSync } from 'esbuild';

function tryFile(p) {
  try { if (existsSync(p) && statSync(p).isFile()) return p; } catch {}
  return null;
}

function resolveCandidate(spec, fromDir) {
  if (spec.startsWith('@/')) {
    const rest = spec.slice(2);
    return tryFile('/app/src/' + rest)
      || tryFile('/app/src/' + rest + '.js')
      || tryFile('/app/src/' + rest + '.jsx');
  }
  if (spec.startsWith('.')) {
    const base = join(fromDir, spec);
    return tryFile(base)
      || tryFile(base + '.js')
      || tryFile(base + '.jsx')
      || tryFile(base + '.mjs')
      || tryFile(join(base, 'index.js'));
  }
  if (spec.startsWith('/')) {
    return tryFile(spec) || tryFile(spec + '.js') || tryFile(spec + '.jsx');
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  const fromDir = context.parentURL ? dirname(fileURLToPath(context.parentURL)) : '/app';
  const resolved = resolveCandidate(specifier, fromDir);
  if (resolved) return nextResolve(pathToFileURL(resolved).href, context);
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.jsx') || url.endsWith('.js') || url.endsWith('.mjs')) {
    const filePath = fileURLToPath(url);
    if (!filePath.includes('/node_modules/')) {
      let source;
      try { source = readFileSync(filePath, 'utf8'); } catch { return nextLoad(url, context); }
      const result = transformSync(source, {
        loader: url.endsWith('.jsx') ? 'jsx' : 'js',
        format: 'esm',
        target: 'es2020',
        jsx: 'automatic'
      });
      return { format: 'module', source: result.code, shortCircuit: true };
    }
  }
  return nextLoad(url, context);
}
