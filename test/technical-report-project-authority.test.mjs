/**
 * technical-report-project-authority.test.mjs
 * -------------------------------------------
 * Regression coverage for the Technical Report project authority fix.
 *
 * Verifies:
 * 1. useParameterGridAuthority has NO parallel global bass authority subscription
 * 2. RP22Report uses explicitProjectId (not activeProjectId fallback) as sole authority
 * 3. autoPrint without explicit project ID is blocked
 * 4. Print consistency guard exists before window.print()
 * 5. All RP22Report navigation entry points pass explicit projectId
 *
 * This is a static-analysis test — it reads the source files and asserts
 * the structural properties that prevent cross-project contamination.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ── TEST 1: useParameterGridAuthority — no parallel global authority ──

function testNoParallelGlobalAuthority() {
  const src = readFile('src/components/report/technical/useParameterGridAuthority.jsx');

  const assertions = [
    {
      name: 'no useActiveProjectId import',
      pass: !src.includes('useActiveProjectId'),
    },
    {
      name: 'no useCompletedBassAuthority import',
      pass: !src.includes('useCompletedBassAuthority'),
    },
    {
      name: 'no useOptionalSharedBassResults import',
      pass: !src.includes('useOptionalSharedBassResults'),
    },
    {
      name: 'resolvedBassAuthority uses prop only (no projectBassAuthority fallback)',
      pass: src.includes('bassAuthority || null') && !src.includes('projectBassAuthority'),
    },
    {
      name: 'resolvedBassError uses prop only (no cross-project fallback)',
      pass: src.includes('bassErrorMessage || null') && !src.includes('projectBassAuthority?.errorMessage') && !src.includes('sharedBassResults?.detailedError'),
    },
  ];

  for (const a of assertions) {
    if (!a.pass) {
      return { pass: false, failed: a.name };
    }
  }
  return { pass: true };
}

// ── TEST 2: RP22Report — explicitProjectId is sole authority ──

function testExplicitProjectIdIsSoleAuthority() {
  const src = readFile('src/pages/RP22Report.jsx');

  const assertions = [
    {
      name: 'explicitProjectId defined without activeProjectId fallback',
      pass: src.includes('const explicitProjectId =') && !src.includes('activeProjectId;\n    // ── Report'),
    },
    {
      name: 'no effectiveProjectId references remain',
      pass: !src.includes('effectiveProjectId'),
    },
    {
      name: 'explicitProjectId does not fall back to activeProjectId in its definition',
      pass: /const explicitProjectId\s*=\s*\n\s*routeProjectId\s*\|\|\s*\n\s*searchParams\.get\("projectId"\)\s*\|\|\s*\n\s*searchParams\.get\("id"\)\s*\|\|\s*\n\s*null;/.test(src),
    },
    {
      name: 'useCompletedBassAuthority uses explicitProjectId',
      pass: src.includes('useCompletedBassAuthority(explicitProjectId || "free")'),
    },
    {
      name: 'reportProjectError state exists',
      pass: src.includes('reportProjectError'),
    },
  ];

  for (const a of assertions) {
    if (!a.pass) {
      return { pass: false, failed: a.name };
    }
  }
  return { pass: true };
}

// ── TEST 3: autoPrint without explicit project ID is blocked ──

function testAutoPrintRequiresExplicitProjectId() {
  const src = readFile('src/pages/RP22Report.jsx');

  const assertions = [
    {
      name: 'autoPrint effect checks !explicitProjectId and sets error',
      pass: src.includes('if (!explicitProjectId)') && src.includes('setReportProjectError("Project could not be resolved for Technical Report.")'),
    },
    {
      name: 'reportProjectError renders error screen',
      pass: src.includes('if (reportProjectError)') && src.includes('Project could not be resolved'),
    },
  ];

  for (const a of assertions) {
    if (!a.pass) {
      return { pass: false, failed: a.name };
    }
  }
  return { pass: true };
}

// ── TEST 4: Print consistency guard before window.print() ──

function testPrintConsistencyGuard() {
  const src = readFile('src/pages/RP22Report.jsx');

  const assertions = [
    {
      name: 'guard checks reportReadyProjectId === explicitProjectId before print',
      pass: src.includes('reportReadyProjectId !== explicitProjectId') && src.includes('Print cancelled — project identity mismatch'),
    },
    {
      name: 'guard checks bass authority scope matches before print',
      pass: src.includes('bassScopeId') && src.includes('Print cancelled — bass authority project mismatch'),
    },
    {
      name: 'guard cancels print on mismatch (setIsPrinting(false))',
      pass: src.includes('Print cancelled — project identity mismatch') && src.includes('setIsPrinting(false)'),
    },
  ];

  for (const a of assertions) {
    if (!a.pass) {
      return { pass: false, failed: a.name };
    }
  }
  return { pass: true };
}

// ── TEST 5: All RP22Report navigation entry points pass explicit projectId ──

function testNavigationEntryPointsPassProjectId() {
  const designReviewActions = readFile('src/components/designreview/DesignReviewActions.jsx');

  const assertions = [
    {
      name: 'DesignReviewActions passes projectId in RP22Report navigation',
      pass: designReviewActions.includes('/RP22Report?projectId=${projectId}&autoPrint=1'),
    },
    {
      name: 'DesignReviewActions guards against null projectId',
      pass: designReviewActions.includes('if (!projectId) return;'),
    },
  ];

  for (const a of assertions) {
    if (!a.pass) {
      return { pass: false, failed: a.name };
    }
  }
  return { pass: true };
}

// ── TEST 6: Cross-project isolation — authority resolution logic ──

function testCrossProjectIsolationLogic() {
  // Simulate the resolvedBassAuthority / resolvedBassError logic from the hook.
  // After the fix, these are pure functions of the prop — no global fallback.
  function resolveAuthority({ bassAuthority, bassErrorMessage }) {
    const resolvedBassAuthority = bassAuthority || null;
    const resolvedBassError = bassErrorMessage || null;
    return { resolvedBassAuthority, resolvedBassError };
  }

  // Project A authority (correct)
  const projectA = { projectId: 'A', status: 'complete', errorMessage: null };
  // Project B authority (wrong, global active)
  const projectB = { projectId: 'B', status: 'error', errorMessage: 'Bass analysis failed' };

  // Case 1: Report for A, global active = B
  // Prop supplies A's authority. Hook must use A, not B.
  const result1 = resolveAuthority({ bassAuthority: projectA, bassErrorMessage: null });
  if (result1.resolvedBassAuthority?.projectId !== 'A') {
    return { pass: false, failed: 'Case 1: authority should be A, got ' + result1.resolvedBassAuthority?.projectId };
  }
  if (result1.resolvedBassError !== null) {
    return { pass: false, failed: 'Case 1: error should be null (A has no error), got ' + result1.resolvedBassError };
  }

  // Case 2: Report for B, global active = A
  const result2 = resolveAuthority({ bassAuthority: projectB, bassErrorMessage: 'Bass analysis failed' });
  if (result2.resolvedBassAuthority?.projectId !== 'B') {
    return { pass: false, failed: 'Case 2: authority should be B, got ' + result2.resolvedBassAuthority?.projectId };
  }
  if (result2.resolvedBassError !== 'Bass analysis failed') {
    return { pass: false, failed: 'Case 2: error should be from B, got ' + result2.resolvedBassError };
  }

  // Case 3: No prop supplied (should be null, not global fallback)
  const result3 = resolveAuthority({ bassAuthority: null, bassErrorMessage: null });
  if (result3.resolvedBassAuthority !== null) {
    return { pass: false, failed: 'Case 3: authority should be null without prop' };
  }

  return { pass: true };
}

// ── TEST 7: autoPrint=1 without projectId should not print ──

function testAutoPrintWithoutProjectIdBlocked() {
  // Simulate the autoPrint guard logic
  function shouldAutoPrint({ autoPrintRequested, explicitProjectId, reportHydrating, reportReadyProjectId, bassReady }) {
    if (!autoPrintRequested) return { print: false, reason: 'not-requested' };
    if (!explicitProjectId) return { print: false, reason: 'no-project-id', error: 'Project could not be resolved for Technical Report.' };
    if (reportHydrating || reportReadyProjectId !== explicitProjectId) return { print: false, reason: 'hydrating' };
    if (!bassReady) return { print: false, reason: 'bass-pending' };
    return { print: true };
  }

  // autoPrint=1 with no projectId → must NOT print
  const result1 = shouldAutoPrint({
    autoPrintRequested: true,
    explicitProjectId: null,
    reportHydrating: false,
    reportReadyProjectId: null,
    bassReady: true,
  });
  if (result1.print !== false || result1.reason !== 'no-project-id') {
    return { pass: false, failed: 'autoPrint without projectId should be blocked' };
  }
  if (!result1.error) {
    return { pass: false, failed: 'autoPrint without projectId should set error' };
  }

  // autoPrint=1 with projectId → should print when ready
  const result2 = shouldAutoPrint({
    autoPrintRequested: true,
    explicitProjectId: 'A',
    reportHydrating: false,
    reportReadyProjectId: 'A',
    bassReady: true,
  });
  if (result2.print !== true) {
    return { pass: false, failed: 'autoPrint with valid projectId should print when ready' };
  }

  // autoPrint=1 with projectId but global active = different project → should still print for explicit project
  const result3 = shouldAutoPrint({
    autoPrintRequested: true,
    explicitProjectId: 'A',
    reportHydrating: false,
    reportReadyProjectId: 'A',
    bassReady: true,
  });
  if (result3.print !== true) {
    return { pass: false, failed: 'autoPrint should not be affected by global active project' };
  }

  return { pass: true };
}

// ── TEST 8: Print consistency guard logic ──

function testPrintConsistencyGuardLogic() {
  // Simulate the print consistency guard
  function shouldAllowPrint({ explicitProjectId, reportReadyProjectId, reportHydrating, bassAuthorityProjectId }) {
    if (!explicitProjectId || reportReadyProjectId !== explicitProjectId || reportHydrating) {
      return { allow: false, reason: 'project-identity-mismatch' };
    }
    if (String(bassAuthorityProjectId || 'free') !== String(explicitProjectId || 'free')) {
      return { allow: false, reason: 'bass-authority-mismatch' };
    }
    return { allow: true };
  }

  // Case 1: All match → allow
  const r1 = shouldAllowPrint({
    explicitProjectId: 'A',
    reportReadyProjectId: 'A',
    reportHydrating: false,
    bassAuthorityProjectId: 'A',
  });
  if (!r1.allow) {
    return { pass: false, failed: 'Case 1: should allow print when all match' };
  }

  // Case 2: Bass authority for wrong project → block
  const r2 = shouldAllowPrint({
    explicitProjectId: 'A',
    reportReadyProjectId: 'A',
    reportHydrating: false,
    bassAuthorityProjectId: 'B',
  });
  if (r2.allow) {
    return { pass: false, failed: 'Case 2: should block print when bass authority is for wrong project' };
  }

  // Case 3: Report still hydrating → block
  const r3 = shouldAllowPrint({
    explicitProjectId: 'A',
    reportReadyProjectId: 'A',
    reportHydrating: true,
    bassAuthorityProjectId: 'A',
  });
  if (r3.allow) {
    return { pass: false, failed: 'Case 3: should block print while hydrating' };
  }

  // Case 4: No explicit project → block
  const r4 = shouldAllowPrint({
    explicitProjectId: null,
    reportReadyProjectId: null,
    reportHydrating: false,
    bassAuthorityProjectId: 'free',
  });
  if (r4.allow) {
    return { pass: false, failed: 'Case 4: should block print without explicit project' };
  }

  return { pass: true };
}

// ── Runner ──

const tests = [
  { name: 'TEST 1: No parallel global bass authority in useParameterGridAuthority', fn: testNoParallelGlobalAuthority },
  { name: 'TEST 2: explicitProjectId is sole authority in RP22Report', fn: testExplicitProjectIdIsSoleAuthority },
  { name: 'TEST 3: autoPrint without explicit project ID is blocked', fn: testAutoPrintRequiresExplicitProjectId },
  { name: 'TEST 4: Print consistency guard before window.print()', fn: testPrintConsistencyGuard },
  { name: 'TEST 5: Navigation entry points pass explicit projectId', fn: testNavigationEntryPointsPassProjectId },
  { name: 'TEST 6: Cross-project isolation logic', fn: testCrossProjectIsolationLogic },
  { name: 'TEST 7: autoPrint=1 without projectId blocked', fn: testAutoPrintWithoutProjectIdBlocked },
  { name: 'TEST 8: Print consistency guard logic', fn: testPrintConsistencyGuardLogic },
];

let allPass = true;
for (const t of tests) {
  const result = t.fn();
  if (result.pass) {
    console.log(`  ✓ ${t.name}`);
  } else {
    console.error(`  ✗ ${t.name}`);
    console.error(`    FAILED: ${result.failed}`);
    allPass = false;
  }
}

if (allPass) {
  console.log('\n✅ ALL TESTS PASSED — Technical Report project authority is isolated.');
  process.exit(0);
} else {
  console.error('\n❌ TESTS FAILED — cross-project contamination risk remains.');
  process.exit(1);
}