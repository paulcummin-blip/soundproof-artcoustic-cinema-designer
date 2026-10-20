import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { build } from 'esbuild'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    publicSharedEntries(),
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true'
    }),
    react(),
  ]
});

// Bundle only the shared modules already imported by the frontend. Their
// canonical source stays in base44/shared; the backend serving deny list
// remains intact. This is the same browser bundling used by production.
function publicSharedEntries() {
  const entries = new Set([
    "briefRelevance", "narrativePriorityAuthority", "canonicalParameterWeights",
    "reportEvidenceFingerprint", "pinnedReportEvidenceParity", "seatingBoundaryPrinciple",
    "strengthImportance", "strengthStories", "strengthStoryEvidence",
    "reportDesignIntent/reportGeometryContext", "reportDesignIntent/reportVisualContext",
  ].map(name => path.resolve("shared", name + ".js")));
  return {
    name: "soundproof-public-shared-entries", enforce: "pre", apply: "serve",
    async load(id) {
      if (!entries.has(id)) return null;
      const result = await build({ entryPoints: [id], bundle: true, write: false,
        format: "esm", platform: "browser", metafile: true });
      for (const dependency of Object.keys(result.metafile.inputs)) this.addWatchFile(path.resolve(dependency));
      return result.outputFiles[0].text;
    },
  };
}
