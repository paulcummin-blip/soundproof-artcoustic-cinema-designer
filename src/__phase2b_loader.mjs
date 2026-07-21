// Custom Node ESM loader to resolve @/ imports to src/ paths for fixture execution.
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as pathResolve, dirname, normalize } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { transformSync } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = pathResolve(__dirname, "..");

// Read jsconfig.json paths to resolve @/* → src/*
let pathAliases = {};
try {
  const jsconfig = JSON.parse(readFileSync(pathResolve(appRoot, "jsconfig.json"), "utf8"));
  pathAliases = jsconfig.compilerOptions?.paths || {};
} catch (e) {
  // Fallback: assume @/* → src/*
  pathAliases = { "@/*": ["src/*"] };
}

function resolveAlias(specifier) {
  for (const [alias, targets] of Object.entries(pathAliases)) {
    const aliasPrefix = alias.replace(/\*$/, "");
    if (specifier.startsWith(aliasPrefix)) {
      const suffix = specifier.slice(aliasPrefix.length);
      for (const target of targets) {
        const targetPrefix = target.replace(/\*$/, "");
        let candidate = normalize(pathResolve(appRoot, targetPrefix + suffix));
        // Add file extension if missing (Node ESM requires exact extensions)
        if (!candidate.match(/\.(js|jsx|mjs|json)$/)) {
          if (existsSync(candidate + ".js")) candidate += ".js";
          else if (existsSync(candidate + ".jsx")) candidate += ".jsx";
          else if (existsSync(candidate + ".mjs")) candidate += ".mjs";
          else if (existsSync(candidate + ".json")) candidate += ".json";
        }
        return candidate;
      }
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // Resolve @/ imports
  if (specifier.startsWith("@/")) {
    const resolved = resolveAlias(specifier);
    if (resolved) {
      return nextResolve(pathToFileURL(resolved).href, context);
    }
  }

  // Resolve bare imports that might be in node_modules
  if (!specifier.startsWith(".") && !specifier.startsWith("/") && !specifier.startsWith("node:")) {
    try {
      return await nextResolve(specifier, context);
    } catch (e) {
      // If it's a local module without extension, try adding .js or .jsx
      const candidate = pathResolve(appRoot, "node_modules", specifier);
      try {
        return await nextResolve(pathToFileURL(candidate).href, context);
      } catch (e2) {
        // Fall through to default
      }
    }
  }

  // Handle ?raw imports (Vite-specific) — strip the query and load as text
  if (specifier.includes("?raw")) {
    const cleanPath = specifier.split("?raw")[0];
    if (cleanPath.startsWith("@/")) {
      const resolved = resolveAlias(cleanPath);
      if (resolved) {
        return {
          url: pathToFileURL(resolved + "?raw").href,
          shortCircuit: true,
        };
      }
    }
  }

  return nextResolve(specifier, context);
}

// Load ?raw imports as text modules; transform .jsx files using esbuild.
export async function load(url, context, nextLoad) {
  if (url.includes("?raw")) {
    const cleanUrl = url.replace("?raw", "");
    const filePath = fileURLToPath(cleanUrl);
    const source = readFileSync(filePath, "utf8");
    return {
      format: "module",
      source: `export default ${JSON.stringify(source)};`,
      shortCircuit: true,
    };
  }
  // Transform .jsx files to ESM JS using esbuild
  if (url.endsWith(".jsx")) {
    const filePath = fileURLToPath(url);
    const source = readFileSync(filePath, "utf8");
    const result = transformSync(source, {
      loader: "jsx",
      format: "esm",
      jsx: "automatic",
    });
    return {
      format: "module",
      source: result.code,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}