// _p14-cache-loader.mjs — Custom loader for P14 target cache durability tests.
//
// Extends the alias loader (_alias-loader.mjs) with a mock @/api/base44Client
// so tests can exercise the REAL p14TargetCache.js module (including its
// persistence path) without the @base44/sdk browser dependency.
//
// The mock stores records in globalThis.__P14_CACHE_MOCK_DB__ (a Map keyed by
// project_id). Tests can configure write failures via
// globalThis.__P14_CACHE_MOCK_FAIL__ = true.

import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { transformSync } from 'esbuild';

const srcDir = new URL('../src/', import.meta.url).pathname;

function tryResolve(basePath) {
  const candidates = [basePath, basePath + '.js', basePath + '.jsx', basePath + '.json', basePath + '/index.js', basePath + '/index.jsx'];
  for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  return null;
}

// Initialise the mock DB on first load.
if (!globalThis.__P14_CACHE_MOCK_DB__) {
  globalThis.__P14_CACHE_MOCK_DB__ = new Map();
}
if (globalThis.__P14_CACHE_MOCK_FAIL__ === undefined) {
  globalThis.__P14_CACHE_MOCK_FAIL__ = false;
}

const MOCK_BASE44_SOURCE = `
// Initialise the mock DB in the MAIN thread (not the loader thread).
// The loader runs in a separate worker; globalThis there is NOT shared.
if (!globalThis.__P14_CACHE_MOCK_DB__) {
  globalThis.__P14_CACHE_MOCK_DB__ = new Map();
}
if (globalThis.__P14_CACHE_MOCK_FAIL__ === undefined) {
  globalThis.__P14_CACHE_MOCK_FAIL__ = false;
}
const __db = globalThis.__P14_CACHE_MOCK_DB__;
const __shouldFail = () => globalThis.__P14_CACHE_MOCK_FAIL__ === true;

function genId() { return 'rec-' + Math.random().toString(36).slice(2, 10); }

export const base44 = {
  entities: {
    ProjectAnalysisCache: {
      async filter(query) {
        const projectId = query?.project_id;
        if (projectId == null) return [];
        const records = [];
        for (const [pid, rec] of __db.entries()) {
          if (String(pid) === String(projectId)) records.push(rec);
        }
        records.sort((a, b) => (b.updated_date || '').localeCompare(a.updated_date || ''));
        return records;
      },
      async update(id, patch) {
        if (__shouldFail()) throw new Error('Mock persistence failure (configured)');
        for (const [pid, rec] of __db.entries()) {
          if (rec.id === id) {
            __db.set(pid, { ...rec, ...patch, updated_date: new Date().toISOString() });
            return __db.get(pid);
          }
        }
        throw new Error('Record not found: ' + id);
      },
      async create(data) {
        if (__shouldFail()) throw new Error('Mock persistence failure (configured)');
        const id = genId();
        const rec = { id, ...data, created_date: new Date().toISOString(), updated_date: new Date().toISOString() };
        __db.set(String(data.project_id), rec);
        return rec;
      },
    },
  },
};
`;

export async function resolve(specifier, context, nextResolve) {
  // Intercept @/api/base44Client — return a synthetic module URL
  if (specifier === '@/api/base44Client') {
    return nextResolve('mock:base44Client', context);
  }
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
  // Serve the mock base44Client module
  if (url === 'mock:base44Client' || url.endsWith('mock:base44Client')) {
    return { format: 'module', source: MOCK_BASE44_SOURCE, shortCircuit: true };
  }
  if (url.endsWith('.jsx') || url.endsWith('.tsx')) {
    const source = fs.readFileSync(new URL(url).pathname, 'utf8');
    const result = transformSync(source, { loader: 'jsx', format: 'esm', jsx: 'automatic' });
    return { format: 'module', source: result.code, shortCircuit: true };
  }
  if (url.endsWith('.js') && url.includes('/src/')) {
    const source = fs.readFileSync(new URL(url).pathname, 'utf8');
    let patched = source;
    let needsPolyfill = false;
    if (patched.includes('import.meta.env')) {
      patched = patched.replace(/import\.meta\.env/g, '({VITE_BASE44_APP_ID:"",VITE_BASE44_BACKEND_URL:""})');
      needsPolyfill = true;
    }
    if (patched.includes('window.') && !patched.includes('typeof window')) {
      needsPolyfill = true;
    }
    if (needsPolyfill) {
      const polyfill = 'const globalWindow = typeof window !== "undefined" ? window : { localStorage: new Map(), location: { href: "http://localhost/", search: "", pathname: "/", hash: "" }, history: { replaceState: () => {} } };\n';
      patched = patched.replace(/(?<![a-zA-Z_.])window\./g, 'globalWindow.');
      return { format: 'module', source: polyfill + patched, shortCircuit: true };
    }
  }
  return nextLoad(url, context);
}