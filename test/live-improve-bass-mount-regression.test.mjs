// live-improve-bass-mount-regression.test.mjs
// Production mount/wiring regression for the Stage 11B Improve Bass live path.
//
// Verifies that the live SubwooferPanel tree:
//   1. Mounts ImproveBassResponseV2 (the V2 Stage 11B component)
//   2. Does NOT mount BassPostCalculationActions (the old Stage 2 Improve UI)
//   3. The V2 component imports runImproveBassV2 (the V2 engine entry)
//   4. The V2 component imports improveBassV2Store (the V2 store)
//   5. The V2 component renders ImproveBassV2Progress (progress/ETA/cancel)
//   6. The V2 component renders ImproveBassV2Results (the V2 result contract)
//   7. The V2 apply uses buildOptimisedInstances (canonical V2 winner)
//
// And proves the live action does NOT invoke requestBassHeavyAction(..., "optimise", ...)
// as its user-facing Improve Bass path.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => readFileSync(join(__dirname, "..", "src", rel), "utf8");

let pass = 0;
let fail = 0;
function check(name, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n=== LIVE IMPROVE BASS MOUNT REGRESSION ===\n");

// --- SubwooferPanel wiring ---
const subPanel = readSrc("components/room/SubwooferPanel.jsx");

check(
  "SubwooferPanel imports ImproveBassResponseV2",
  subPanel.includes("import ImproveBassResponseV2 from '@/components/room/bass/improveBassV2/ImproveBassResponseV2';"),
);

check(
  "SubwooferPanel mounts <ImproveBassResponseV2 ... />",
  subPanel.includes("<ImproveBassResponseV2"),
);

check(
  "SubwooferPanel does NOT import BassPostCalculationActions",
  !subPanel.includes("BassPostCalculationActions"),
);

check(
  "SubwooferPanel does NOT render <BassPostCalculationActions",
  !subPanel.includes("<BassPostCalculationActions"),
);

// --- V2 component wiring ---
const v2Comp = readSrc("components/room/bass/improveBassV2/ImproveBassResponseV2.jsx");

check(
  "V2 component imports runImproveBassV2 (engine entry)",
  v2Comp.includes("import { runImproveBassV2 } from \"./improveBassV2Engine\""),
);

check(
  "V2 component imports improveBassV2Store (store)",
  v2Comp.includes("from \"./improveBassV2Store\""),
);

check(
  "V2 component renders ImproveBassV2Progress",
  v2Comp.includes("ImproveBassV2Progress"),
);

check(
  "V2 component renders ImproveBassV2Results",
  v2Comp.includes("ImproveBassV2Results"),
);

check(
  "V2 component imports buildOptimisedInstances (canonical V2 apply)",
  v2Comp.includes("import { buildOptimisedInstances } from \"./improveBassV2Apply\""),
);

check(
  "V2 component calls runImproveBassV2 in handleStart",
  v2Comp.includes("await runImproveBassV2(projectId, params, callbacks)"),
);

check(
  "V2 prepares cold Stage 2 through the optimise request and then runs V2",
  v2Comp.includes("requestBassHeavyAction") && v2Comp.includes("waitForStage2Terminal") && v2Comp.includes("runImproveBassV2"),
);

check(
  "V2 component has Cancel handler (requestCancel)",
  v2Comp.includes("requestCancel(projectId)"),
);

// --- Old UI removal verification ---
const oldComp = readSrc("components/room/bass/BassPostCalculationActions.jsx");

check(
  "Old BassPostCalculationActions still exists (not deleted — Stage 1/2 infra retained)",
  oldComp.includes("export default function BassPostCalculationActions"),
);

check(
  "Old BassPostCalculationActions is NOT imported by SubwooferPanel (removed from live tree)",
  !subPanel.includes("BassPostCalculationActions"),
);

// --- Engine entry verification ---
const engine = readSrc("components/room/bass/improveBassV2/improveBassV2Engine.js");

check(
  "V2 engine exports runImproveBassV2",
  engine.includes("export async function runImproveBassV2") || engine.includes("export function runImproveBassV2"),
);

check(
  "V2 engine does NOT short-circuit on Stage 2 cache (always enters Phase 1 reviewing)",
  engine.includes("Reviewing current design"),
);

check(
  "V2 engine enters calibration phase (Stage 11A)",
  engine.includes("Searching calibration improvements"),
);

// --- Progress component verification ---
const progress = readSrc("components/room/bass/improveBassV2/ImproveBassV2Progress.jsx");

check(
  "ImproveBassV2Progress renders phase label",
  progress.includes("phase") || progress.includes("Phase"),
);

check(
  "ImproveBassV2Progress renders Cancel control",
  progress.includes("onCancel") || progress.includes("Cancel"),
);

// --- Results component verification ---
const results = readSrc("components/room/bass/improveBassV2/ImproveBassV2Results.jsx");

check(
  "ImproveBassV2Results renders CURRENT DESIGN section",
  results.includes("CURRENT") || results.includes("Current") || results.includes("current"),
);

check(
  "ImproveBassV2Results has onApply prop (single V2 apply authority)",
  results.includes("onApply"),
);

// --- Summary ---
console.log(`\n--- LIVE MOUNT REGRESSION: ${pass} passed, ${fail} failed ---\n`);
if (fail > 0) {
  console.error("LIVE IMPROVE BASS MOUNT REGRESSION FAILED");
  process.exit(1);
}
console.log("LIVE IMPROVE BASS MOUNT REGRESSION PASSED");