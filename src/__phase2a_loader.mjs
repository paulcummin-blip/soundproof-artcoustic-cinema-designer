// Temporary ESM loader to resolve @/ alias and ?raw imports for fixture execution in Node.
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  // Handle ?raw imports (Vite-specific) — strip the query, resolve the file
  let raw = false;
  let cleanSpecifier = specifier;
  if (specifier.endsWith('?raw')) {
    raw = true;
    cleanSpecifier = specifier.slice(0, -4);
  }

  if (cleanSpecifier.startsWith('@/')) {
    const basePath = join('/app/src', cleanSpecifier.slice(2));
    const candidates = [
      basePath,
      basePath + '.js',
      basePath + '.jsx',
      basePath + '.mjs',
      join(basePath, 'index.js'),
      join(basePath, 'index.jsx'),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        const url = pathToFileURL(candidate).href + (raw ? '?raw' : '');
        return { url, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  // Handle ?raw imports — return the file source as a string export
  if (url.endsWith('?raw')) {
    const filePath = url.slice(0, -4).replace('file://', '');
    const source = readFileSync(filePath, 'utf8');
    return {
      format: 'module',
      source: `export default ${JSON.stringify(source)};`,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}