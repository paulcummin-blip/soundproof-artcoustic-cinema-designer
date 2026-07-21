// Temporary loader — resolves @/ alias to src/ for Node.js ESM execution.
// Adds .js/.jsx extension resolution. Deleted after verification.
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, statSync } from "node:fs";
import { dirname, join, extname } from "node:path";

function tryResolveFile(resolvedPath) {
  // Already has extension
  if (extname(resolvedPath)) {
    if (existsSync(resolvedPath) && statSync(resolvedPath).isFile()) return resolvedPath;
    return null;
  }
  // Try .js, .jsx, .mjs, /index.js
  for (const ext of [".js", ".jsx", ".mjs"]) {
    const candidate = resolvedPath + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  const indexCandidate = join(resolvedPath, "index.js");
  if (existsSync(indexCandidate) && statSync(indexCandidate).isFile()) return indexCandidate;
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const baseResolved = fileURLToPath(new URL("./src/" + specifier.slice(2), pathToFileURL(process.cwd() + "/")));
    const resolved = tryResolveFile(baseResolved);
    if (resolved) {
      return nextResolve(pathToFileURL(resolved).href, context);
    }
  }
  return nextResolve(specifier, context);
}