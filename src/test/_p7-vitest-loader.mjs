// Resolves the bare `vitest` specifier to the local stub so the focused suites run
// here. Every other specifier is left to the next loader (the '@/...' + JSX loader).
import { pathToFileURL } from 'node:url';

const stubUrl = new URL('./_p7-vitest-stub.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'vitest') return { url: stubUrl, shortCircuit: true };
  return nextResolve(specifier, context);
}