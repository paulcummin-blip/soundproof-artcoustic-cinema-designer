// Test-specific module loader for mounting useProjectLoader in Node.
// Resolves @/entities/Project, @/api/base44Client and
// @/components/state/projectReadCache to controllable mocks, resolves
// every other @/ path to src/, and transforms .jsx/.tsx to JS.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { extname, resolve as pathResolve } from 'node:path';

const SRC = pathResolve(process.cwd(), 'src');
const MOCKS = pathResolve(process.cwd(), 'src/test/mocks');

const MOCK_MAP = {
  '@/entities/Project': pathResolve(MOCKS, 'projectEntityMock.mjs'),
  '@/api/base44Client': pathResolve(MOCKS, 'base44ClientMock.mjs'),
  '@/components/state/projectReadCache': pathResolve(MOCKS, 'projectReadCacheMock.mjs'),
};

function tryResolveFile(basePath) {
  const hasExt = /\.(jsx|js|tsx|ts|mjs)$/.test(basePath);
  const candidates = hasExt
    ? [basePath, basePath + 'x']
    : [
        basePath + '.jsx',
        basePath + '.js',
        basePath + '.tsx',
        basePath + '.ts',
        basePath + '/index.jsx',
        basePath + '/index.js',
      ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

export function resolve(specifier, context, nextResolve) {
  // Mocked modules
  if (MOCK_MAP[specifier]) {
    return nextResolve(pathToFileURL(MOCK_MAP[specifier]).href, context);
  }
  // @/ alias → src/
  if (specifier.startsWith('@/')) {
    const resolved = tryResolveFile(pathResolve(SRC, specifier.slice(2)));
    if (resolved) return nextResolve(pathToFileURL(resolved).href, context);
    return nextResolve(specifier, context);
  }
  // Relative extensionless imports (./ or ../) — resolve with extension probing.
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const importer = context.parentURL;
    if (importer) {
      const importerDir = pathResolve(new URL(importer).pathname, '..');
      const basePath = pathResolve(importerDir, specifier);
      const resolved = tryResolveFile(basePath);
      if (resolved) return nextResolve(pathToFileURL(resolved).href, context);
    }
  }
  return nextResolve(specifier, context);
}

// esbuild transforms JSX/TSX synchronously; it is already a Vite dependency.
import { transformSync } from 'esbuild';

export async function load(url, context, nextLoad) {
  const ext = extname(url);
  if (ext === '.jsx' || ext === '.tsx') {
    const source = readFileSync(new URL(url), 'utf8');
    const loader = ext === '.tsx' ? 'tsx' : 'jsx';
    const result = transformSync(source, {
      loader,
      jsx: 'transform',
      format: 'esm',
      sourcefile: url,
    });
    return {
      format: 'module',
      source: result.code,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}

register('./_mount-loader.mjs', import.meta.url);