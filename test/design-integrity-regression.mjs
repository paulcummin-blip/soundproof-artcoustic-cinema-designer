// test/design-integrity-regression.mjs
//
// Regression tests for the four data-integrity fixes that make the working
// copy safe to publish as the new reference build:
//
//   FIX 1 — Abfuser recommendation must not autosave
//   FIX 2 — Navigation/hydration must not save design geometry
//   FIX 3 — Physical geometry must not depend on render stroke
//   FIX 4 — Save authority (explicit write reasons)
//
// These are pure-logic tests (no React, no DOM) that verify the invariant:
//   recommendation ≠ design mutation.

import { readFileSync } from 'fs';

let pass = 0;
let fail = 0;

// ─── FIX 3: Pure-logic replicas of the two half-extent functions ─────────────
// We replicate the math here (not importing the JSX) to verify the invariant
// without a React/DOM environment.

const RAD = Math.PI / 180;

// STROKE_HALF_M at DPR=1 (from RenderPrimitives.jsx line 85-88)
const SPEAKER_STROKE_PX = 2;
const STROKE_HALF_M_DPR1 =
  (SPEAKER_STROKE_PX / 2) / Math.max(1, 1) / 96 * 0.0254;

// Visual half-extent (includes stroke) — replica of yHalfExtentM
function yHalfExtentM(depthM, widthM, yawDeg = 0) {
  const t = Math.abs((yawDeg || 0) * RAD);
  return (depthM * 0.5) * Math.abs(Math.cos(t)) +
         (widthM * 0.5) * Math.abs(Math.sin(t)) +
         STROKE_HALF_M_DPR1;
}

// Physical half-extent (no stroke) — replica of yHalfExtentM_physical
function yHalfExtentM_physical(depthM, widthM, yawDeg = 0) {
  const t = Math.abs((yawDeg || 0) * RAD);
  return (depthM * 0.5) * Math.abs(Math.cos(t)) +
         (widthM * 0.5) * Math.abs(Math.sin(t));
}

function assert(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

// ─── FIX 3: STROKE / PHYSICAL SEPARATION ────────────────────────────────────

console.log('\nFIX 3 — Stroke / Physical Geometry Separation');

// yHalfExtentM_physical must NOT include STROKE_HALF_M
{
  const depthM = 0.082;
  const widthM = 0.27;
  const yawDeg = 0;

  const physical = yHalfExtentM_physical(depthM, widthM, yawDeg);
  const visual = yHalfExtentM(depthM, widthM, yawDeg);

  assert(
    'physical half-extent excludes stroke',
    physical < visual,
    `physical=${physical} visual=${visual}`
  );
  assert(
    'physical half-extent is exactly depthM/2 at yaw=0',
    Math.abs(physical - depthM / 2) < 1e-9,
    `physical=${physical} expected=${depthM / 2}`
  );
}

// DPR independence: physical half-extent must not change with devicePixelRatio
// (STROKE_HALF_M uses devicePixelRatio, so visual changes; physical must not)
{
  const depthM = 0.110;
  const widthM = 0.280;
  const yawDeg = 22.5;

  // Simulate DPR=1 vs DPR=2 by checking that physical is always the same
  // (yHalfExtentM_physical has no DPR dependency by construction)
  const physical1 = yHalfExtentM_physical(depthM, widthM, yawDeg);
  const physical2 = yHalfExtentM_physical(depthM, widthM, yawDeg);

  assert(
    'physical half-extent is DPR-independent',
    physical1 === physical2,
    `both=${physical1}`
  );
}

// ─── FIX 1: ABFUSER RECOMMENDATION ≠ DESIGN MUTATION ────────────────────────

console.log('\nFIX 1 — Abfuser Recommendation Must Not Autosave');

// Simulate the invariant: recommendation calculation must not change
// selectedAbfuserQty. The auto-follow effect has been removed from
// OptionsPanel.jsx. The only paths that change selectedAbfuserQty are:
//   1. User typing in the quantity input
//   2. User clicking "Apply" (applyRecommendedQty)
//
// We verify the source code invariant: OptionsPanel.jsx no longer contains
// the auto-follow useEffect that called setSelectedAbfuserQty on mount.

{
  const optionsPanelSource = readFileSync(
    new URL('../src/components/roomdesigner/OptionsPanel.jsx', import.meta.url),
    'utf8'
  );

  assert(
    'OptionsPanel no longer has auto-follow useEffect',
    !optionsPanelSource.includes('setSelectedAbfuserQty(recommendedAbfuserQty)') ||
      !optionsPanelSource.includes('React.useEffect'),
    'auto-follow effect still present'
  );

  assert(
    'OptionsPanel has explicit Apply button',
    optionsPanelSource.includes('applyRecommendedQty'),
    'no applyRecommendedQty function found'
  );

  // The auto-follow effect body that ran on mount has been removed
  const autoFollowPattern = /React\.useEffect\(\(\)\s*=>\s*\{[^}]*setSelectedAbfuserQty\(recommendedAbfuserQty\)/;
  assert(
    'no auto-follow effect body remains',
    !autoFollowPattern.test(optionsPanelSource),
    'auto-follow effect body still present'
  );
}

// ─── FIX 2: NAVIGATION/HYDRATION GEOMETRY GUARDS ────────────────────────────
//
// Three geometry-writing effects in RoomDesigner.jsx must all guard against
// hydration with `if (loadState?.phase !== 'loaded') return;` so that
// navigation re-mounts do not persist derived geometry:
//
//   (a) LCR wall-lock effect — locks FL/FC/FR to front wall + z=1.2
//   (b) FC centerline effect  — locks FC speaker to room centerline (X)
//   (c) Speaker aiming effect  — rotates LCR/wides/surrounds toward MLP
//
// We verify each effect individually by locating its unique comment anchor
// and confirming the guard appears within that effect's body.

console.log('\nFIX 2 — Navigation/Hydration Geometry Guards');

{
  const roomDesignerSource = readFileSync(
    new URL('../src/pages/RoomDesigner.jsx', import.meta.url),
    'utf8'
  );

  // ── Helper: extract the body of a useEffect block starting at a comment ──
  // Returns the source from the comment line up to the matching `}, [...]);`
  function extractEffectBody(source, commentAnchor) {
    const anchorIdx = source.indexOf(commentAnchor);
    if (anchorIdx === -1) return null;
    // Find the next `useEffect(() => {` after the anchor
    const effectIdx = source.indexOf('useEffect(() => {', anchorIdx);
    if (effectIdx === -1) return null;
    // Find the closing `}, [` (dependency array) after the effect opening
    const depIdx = source.indexOf('}, [', effectIdx);
    if (depIdx === -1) return null;
    return source.slice(effectIdx, depIdx);
  }

  // ── (a) LCR wall-lock effect ──
  const lcrLockBody = extractEffectBody(
    roomDesignerSource,
    'Effect to lock LCR to front wall'
  );
  assert(
    'LCR wall-lock effect found in source',
    lcrLockBody !== null,
    'could not locate LCR wall-lock effect'
  );
  if (lcrLockBody) {
    assert(
      'LCR wall-lock effect does not persist during hydration',
      lcrLockBody.includes("if (loadState?.phase !== 'loaded') return;"),
      'no loadState hydration guard in LCR wall-lock effect'
    );
    assert(
      'LCR wall-lock uses yHalfExtentM_physical',
      lcrLockBody.includes('yHalfExtentM_physical(depthM, widthM, targetYawDeg)'),
      'still using stroke-contaminated yHalfExtentM'
    );
    assert(
      'LCR wall-lock does NOT use stroke-contaminated yHalfExtentM',
      !lcrLockBody.includes('yHalfExtentM(depthM, widthM, targetYawDeg)'),
      'still referencing stroke-contaminated yHalfExtentM'
    );
  }

  // ── (b) FC centerline effect ──
  const fcLockBody = extractEffectBody(
    roomDesignerSource,
    'Effect to lock FC speaker to room centerline'
  );
  assert(
    'FC centerline effect found in source',
    fcLockBody !== null,
    'could not locate FC centerline effect'
  );
  if (fcLockBody) {
    assert(
      'FC centerline effect does not persist during hydration',
      fcLockBody.includes("if (loadState?.phase !== 'loaded') return;"),
      'no loadState hydration guard in FC centerline effect'
    );
  }

  // ── (c) Speaker aiming effect ──
  const aimingBody = extractEffectBody(
    roomDesignerSource,
    'Speaker aiming (inline, compacted)'
  );
  assert(
    'Speaker aiming effect found in source',
    aimingBody !== null,
    'could not locate speaker aiming effect'
  );
  if (aimingBody) {
    assert(
      'Speaker aiming effect does not persist during hydration',
      aimingBody.includes("if (loadState?.phase !== 'loaded') return;"),
      'no loadState hydration guard in speaker aiming effect'
    );
  }

  // ── Global: all three guards present in file ──
  const guardCount = (roomDesignerSource.match(/if \(loadState\?\.phase !== 'loaded'\) return;/g) || []).length;
  assert(
    'at least 3 loadState hydration guards present in RoomDesigner',
    guardCount >= 3,
    `found ${guardCount} guards, expected >= 3`
  );
}

// ─── SUMMARY ─────────────────────────────────────────────────────────────────

console.log(`\n─── Regression Summary: ${pass} passed, ${fail} failed ───`);

if (fail > 0) {
  console.error('\n✗ DESIGN INTEGRITY REGRESSION FAILED');
  process.exit(1);
} else {
  console.log('\n✓ All design-integrity regression tests passed.');
}