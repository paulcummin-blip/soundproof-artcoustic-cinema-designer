import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Prebundle the existing public frontend shared entries in development.
  // Backend file serving stays blocked by the Base44 plugin.
  optimizeDeps: { include: [
    "./shared/briefRelevance.js", "./shared/narrativePriorityAuthority.js",
    "./shared/canonicalParameterWeights.js", "./shared/reportEvidenceFingerprint.js",
    "./shared/pinnedReportEvidenceParity.js", "./shared/seatingBoundaryPrinciple.js",
    "./shared/strengthImportance.js", "./shared/strengthStories.js", "./shared/strengthStoryEvidence.js",
    "./shared/reportDesignIntent/reportGeometryContext.js", "./shared/reportDesignIntent/reportVisualContext.js",
  ] },
  plugins: [
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true'
    }),
    react(),
  ]
});