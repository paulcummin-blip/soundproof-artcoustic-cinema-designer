// Custom ESM loader that maps @/ aliases to /app/src/ for Node.js execution.
// Also appends .js/.jsx extensions when missing (Vite resolves these automatically),
// and handles .jsx files by treating them as plain JS modules.
import { pathToFileURL } from 'node:url';
import { existsSync, statSync, readFileSync } from 'node:fs';

const SRC_BASE = pathToFileURL('/app/src/').href;

function tryResolveFile(path) {
  const candidates = [path, path + '.js', path + '.jsx', path + '/index.js', path + '/index.jsx'];
  for (const c of candidates) {
    try {
      const fsPath = new URL(c).pathname;
      if (existsSync(fsPath) && statSync(fsPath).isFile()) return c;
    } catch { /* ignore */ }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // Handle @/ aliases
  if (specifier.startsWith('@/')) {
    const base = SRC_BASE + specifier.slice(2);
    const found = tryResolveFile(base);
    if (found) return nextResolve(found, context);
  }

  // Handle relative imports — try adding extensions if needed
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const parentDir = new URL('.', context.parentURL).href;
    const base = new URL(specifier, parentDir).href;
    const found = tryResolveFile(base);
    if (found) return nextResolve(found, context);
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.jsx')) {
    const fsPath = new URL(url).pathname;
    const source = readFileSync(fsPath, 'utf8');
    return { format: 'module', source, shortCircuit: true };
  }
  return nextLoad(url, context);
}