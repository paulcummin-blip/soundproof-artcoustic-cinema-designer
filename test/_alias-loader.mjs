import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { transformSync } from 'esbuild';
const srcDir = new URL('../src/', import.meta.url).pathname;
function tryResolve(basePath) {
  const candidates = [basePath, basePath + '.js', basePath + '.jsx', basePath + '.json', basePath + '/index.js', basePath + '/index.jsx'];
  // Only a FILE is a valid resolution — returning a bare directory made Node
  // throw ERR_UNSUPPORTED_DIR_IMPORT for directory specifiers such as
  // "@/components/proposal/engineeringAuthority" instead of falling through to
  // that directory's index.js.
  for (const c of candidates) {
    try { if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; } catch (e) {}
  }
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
    let code = result.code;
    // Vite's import.meta.glob (build-time file discovery) is not available in the
    // node test runtime. Polyfill it to an empty object so modules that discover
    // measured polar datasets at import time still load (with no datasets found).
    if (code.includes('import.meta.glob')) {
      code = code.replace(/import\.meta\.glob\(/g, '((import.meta.glob)||(()=>({})))(');
    }
    return { format: 'module', source: code, shortCircuit: true };
  }
  if (url.endsWith('.js') && url.includes('/src/')) {
    const source = fs.readFileSync(new URL(url).pathname, 'utf8');
    let patched = source;
    let needsPolyfill = false;
    if (patched.includes('import.meta.glob')) {
      patched = patched.replace(/import\.meta\.glob\(/g, '((import.meta.glob)||(()=>({})))(');
      needsPolyfill = true;
    }
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