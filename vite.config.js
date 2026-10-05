import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Expose only these two pure contracts as browser modules. Backend files remain
// denied by the Base44 dev server; browser and server execute the same source.
const pureEvidenceNames = ['reportEvidenceCompleteness', 'reportEvidenceSeating'];
const pureEvidencePlugin = {
  name: 'soundproof-shared-evidence-contract',
  enforce: 'pre',
  resolveId(id) {
    return pureEvidenceNames.some(name => id === 'virtual:soundproof-' + name)
      ? '\\0' + id : null;
  },
  load(id) {
    const name = pureEvidenceNames.find(name => id === '\\0virtual:soundproof-' + name);
    if (!name) return null;
    const filename = path.resolve('base44/shared', name + '.js');
    this.addWatchFile(filename);
    return readFileSync(filename, 'utf8');
  },
};


// https://vite.dev/config/
export default defineConfig({
  plugins: [
    pureEvidencePlugin,
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true'
    }),
    react(),
  ]
});