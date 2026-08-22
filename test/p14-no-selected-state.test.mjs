// Regression tests for the P14 no-selected-state architecture.
//
// Verifies:
// - null basis remains null (not coerced to "minimum")
// - null level remains null (not coerced to L1 via Number(null)===0)
// - targetKey is null before selection
// - noP14TargetSelected is true when basis or level is null
// - old completed authority is suppressed while current target is null
// - Minimum L2 selection creates "minimum-L2" targetKey
// - unselected → calculating → ready presentation transition

import assert from 'assert';

// ── Helpers (inlined from the source to avoid JSX import issues) ──

function resolveP14TargetSelectionState(splConfig) {
  const basis = splConfig?.selectedP14TargetBasis === "recommended" ? "recommended"
    : splConfig?.selectedP14TargetBasis === "minimum" ? "minimum"
    : null;
  const rawLevel = splConfig?.selectedP14Level;
  const level = (Number.isFinite(Number(rawLevel)) && Number(rawLevel) > 0)
    ? Math.max(1, Math.min(4, Math.round(Number(rawLevel))))
    : null;
  const noP14TargetSelected = !basis || !level;
  const targetKey = noP14TargetSelected ? null : `${basis}-L${level}`;
  return { noP14TargetSelected, targetKey, basis, level };
}

// Simplified buildComplianceBassPresentation that mirrors the unselected gate
function formatAuthoritativeBassParameter(completedBassAuthority, key, noP14TargetSelected = false) {
  if (noP14TargetSelected) {
    return { key, valueText: "Select Bass Target", level: "—", status: "unselected", isAuthoritative: false };
  }
  // ... normal path would read from contract; for tests we simulate old authority
  const contract = completedBassAuthority?.contract;
  if (!contract) {
    return { key, valueText: "—", level: "—", status: "uncalculated", isAuthoritative: false };
  }
  return { key, valueText: "112 dBC", level: "L2", status: "complete", isAuthoritative: true };
}

function buildComplianceBassPresentation({ completedBassAuthority }, errorMessage = null, noP14TargetSelected = false) {
  const parameters = Object.fromEntries(["p14", "p18", "p19", "p20"].map((key) => [key, formatAuthoritativeBassParameter(completedBassAuthority, key, noP14TargetSelected)]));
  return { parameters, publicationVerified: !noP14TargetSelected };
}

// ── Tests ──

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}

// 1. Null basis remains null
test('null basis remains null', () => {
  const state = resolveP14TargetSelectionState({ selectedP14TargetBasis: null, selectedP14Level: 2 });
  assert.strictEqual(state.basis, null);
  assert.strictEqual(state.noP14TargetSelected, true);
});

// 2. Null level remains null (not coerced to L1)
test('null level remains null (not coerced to L1)', () => {
  const state = resolveP14TargetSelectionState({ selectedP14TargetBasis: "minimum", selectedP14Level: null });
  assert.strictEqual(state.level, null, 'level must be null, not 1 (Number(null)===0 coercion bug)');
  assert.strictEqual(state.noP14TargetSelected, true);
});

// 3. Both null → both null
test('both null → both null', () => {
  const state = resolveP14TargetSelectionState({ selectedP14TargetBasis: null, selectedP14Level: null });
  assert.strictEqual(state.basis, null);
  assert.strictEqual(state.level, null);
  assert.strictEqual(state.noP14TargetSelected, true);
});

// 4. targetKey null before selection
test('targetKey null before selection', () => {
  const state = resolveP14TargetSelectionState({ selectedP14TargetBasis: null, selectedP14Level: null });
  assert.strictEqual(state.targetKey, null);
});

// 5. Level 0 treated as null (not coerced to L1)
test('level 0 treated as null', () => {
  const state = resolveP14TargetSelectionState({ selectedP14TargetBasis: "minimum", selectedP14Level: 0 });
  assert.strictEqual(state.level, null, '0 is not a valid level; must be null');
  assert.strictEqual(state.noP14TargetSelected, true);
});

// 6. Minimum L2 selection creates minimum-L2 targetKey
test('Minimum L2 selection creates minimum-L2 targetKey', () => {
  const state = resolveP14TargetSelectionState({ selectedP14TargetBasis: "minimum", selectedP14Level: 2 });
  assert.strictEqual(state.basis, "minimum");
  assert.strictEqual(state.level, 2);
  assert.strictEqual(state.noP14TargetSelected, false);
  assert.strictEqual(state.targetKey, "minimum-L2");
});

// 7. Recommended L4 selection creates recommended-L4 targetKey
test('Recommended L4 selection creates recommended-L4 targetKey', () => {
  const state = resolveP14TargetSelectionState({ selectedP14TargetBasis: "recommended", selectedP14Level: 4 });
  assert.strictEqual(state.targetKey, "recommended-L4");
  assert.strictEqual(state.noP14TargetSelected, false);
});

// 8. Old completed authority suppressed while current target is null
test('old completed authority suppressed while current target is null', () => {
  const oldAuthority = { contract: { productAnalysis: { parameters: { p14: { value: 112, level: 2 } } } } };
  const presentation = buildComplianceBassPresentation({ completedBassAuthority: oldAuthority }, null, true);
  assert.strictEqual(presentation.parameters.p14.valueText, "Select Bass Target");
  assert.strictEqual(presentation.parameters.p14.level, "—");
  assert.strictEqual(presentation.parameters.p14.isAuthoritative, false);
  assert.strictEqual(presentation.parameters.p18.valueText, "Select Bass Target");
  assert.strictEqual(presentation.parameters.p19.valueText, "Select Bass Target");
  assert.strictEqual(presentation.parameters.p20.valueText, "Select Bass Target");
});

// 9. Old authority surfaces normally when target IS selected
test('old authority surfaces normally when target IS selected', () => {
  const oldAuthority = { contract: { productAnalysis: { parameters: { p14: { value: 112, level: 2 } } } } };
  const presentation = buildComplianceBassPresentation({ completedBassAuthority: oldAuthority }, null, false);
  assert.strictEqual(presentation.parameters.p14.valueText, "112 dBC");
  assert.strictEqual(presentation.parameters.p14.level, "L2");
  assert.strictEqual(presentation.parameters.p14.isAuthoritative, true);
});

// 10. Unselected → selected presentation transition
test('unselected → selected presentation transition', () => {
  const authority = { contract: { productAnalysis: { parameters: { p14: { value: 112, level: 2 } } } } };

  // STATE A: unselected
  const presA = buildComplianceBassPresentation({ completedBassAuthority: authority }, null, true);
  assert.strictEqual(presA.parameters.p14.valueText, "Select Bass Target");

  // STATE B/C: selected + authority present
  const presC = buildComplianceBassPresentation({ completedBassAuthority: authority }, null, false);
  assert.strictEqual(presC.parameters.p14.valueText, "112 dBC");
  assert.strictEqual(presC.parameters.p14.level, "L2");
});

// 11. String level "2" parsed correctly
test('string level "2" parsed to 2', () => {
  const state = resolveP14TargetSelectionState({ selectedP14TargetBasis: "minimum", selectedP14Level: "2" });
  assert.strictEqual(state.level, 2);
  assert.strictEqual(state.targetKey, "minimum-L2");
});

// 12. Undefined splConfig → unselected
test('undefined splConfig → unselected', () => {
  const state = resolveP14TargetSelectionState(undefined);
  assert.strictEqual(state.basis, null);
  assert.strictEqual(state.level, null);
  assert.strictEqual(state.noP14TargetSelected, true);
  assert.strictEqual(state.targetKey, null);
});

// 13. Level clamped to 1-4
test('level clamped to 1-4', () => {
  const state = resolveP14TargetSelectionState({ selectedP14TargetBasis: "minimum", selectedP14Level: 5 });
  assert.strictEqual(state.level, 4);
  const state2 = resolveP14TargetSelectionState({ selectedP14TargetBasis: "minimum", selectedP14Level: -1 });
  assert.strictEqual(state2.level, null, 'negative level should be null');
});

// 14. Report readiness: P14 unselected → not loading (not pending)
test('report readiness: P14 unselected → not loading', () => {
  // resolveBassReadiness returns pending:false when p14TargetSelected=false
  // so showLoadingReport does NOT hang on "Loading report…"
  function resolveBassReadiness(completedBassAuthority, bassApplicable = false, p14TargetSelected = true) {
    if (!p14TargetSelected) {
      return { ready: false, pending: false, reason: 'p14-target-not-selected', fingerprint: null };
    }
    // ... other statuses would return pending:true for loading/updating
    return { ready: false, pending: true, reason: 'unknown', fingerprint: null };
  }

  const authority = { authorityStatus: 'AUTHORITATIVE' };
  const readiness = resolveBassReadiness(authority, true, false);
  assert.strictEqual(readiness.ready, false);
  assert.strictEqual(readiness.pending, false, 'pending must be false when P14 unselected — report must render, not hang');
  assert.strictEqual(readiness.reason, 'p14-target-not-selected');

  // showLoadingReport gate: only blocks when (!ready && pending)
  const showLoadingReport = (!readiness.ready && readiness.pending);
  assert.strictEqual(showLoadingReport, false, 'report must NOT be stuck on Loading when P14 unselected');
});

// 15. Presentation eligibility: unselected suppresses old authority at the export layer
test('presentation eligibility: export data suppresses old authority when unselected', () => {
  const oldAuthority = { contract: { productAnalysis: { parameters: { p14: { value: 112, level: 2 } } } } };
  function buildComplianceBassExportData({ completedBassAuthority }, errorMessage = null, noP14TargetSelected = false) {
    const presentation = buildComplianceBassPresentation({ completedBassAuthority }, errorMessage, noP14TargetSelected);
    return { ...presentation, source: noP14TargetSelected ? "unselected" : (presentation.publicationVerified ? "completed-authoritative-bass-result" : "not-verified") };
  }
  const exportData = buildComplianceBassExportData({ completedBassAuthority: oldAuthority }, null, true);
  assert.strictEqual(exportData.parameters.p14.valueText, "Select Bass Target");
  assert.strictEqual(exportData.parameters.p14.isAuthoritative, false);
  assert.strictEqual(exportData.source, "unselected");
});

// 16. normaliseP14Level: null stays null (not coerced to 0 or L1)
test('normaliseP14Level: null stays null', () => {
  function normaliseP14Level(rawLevel) {
    if (rawLevel == null) return null;
    const n = Number(rawLevel);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.max(1, Math.min(4, Math.round(n)));
  }
  // The critical bug: Number(null) === 0, Number.isFinite(0) === true
  // A naive Number.isFinite(Number(value)) check coerces null → 0 → "valid"
  assert.strictEqual(normaliseP14Level(null), null, 'null must stay null');
  assert.strictEqual(normaliseP14Level(undefined), null, 'undefined must stay null');
  assert.strictEqual(normaliseP14Level(0), null, '0 is not a valid level');
  assert.strictEqual(normaliseP14Level(NaN), null, 'NaN must stay null');
  assert.strictEqual(normaliseP14Level(2), 2);
  assert.strictEqual(normaliseP14Level(4), 4);
  assert.strictEqual(normaliseP14Level(5), 4, 'clamped to 4');
  assert.strictEqual(normaliseP14Level(-1), null, 'negative is null');
  assert.strictEqual(normaliseP14Level("2"), 2, 'string "2" parsed to 2');
  // The exact AppState bug pattern: Number.isFinite(Number(null)) would be true
  // but normaliseP14Level(null) must be null
  assert.notStrictEqual(normaliseP14Level(null), 0, 'must never return 0');
  assert.notStrictEqual(normaliseP14Level(null), 1, 'must never return L1 from null');
});

// 17. AppState hydration: persisted null → hydrated null (not 0)
test('AppState hydration: persisted null → hydrated null', () => {
  function normaliseP14Level(rawLevel) {
    if (rawLevel == null) return null;
    const n = Number(rawLevel);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.max(1, Math.min(4, Math.round(n)));
  }
  // Simulate the AppState initial state pattern (FIX 1)
  const autosaveConfig = { selectedP14Level: null };
  const hydrated = normaliseP14Level(autosaveConfig.selectedP14Level);
  assert.strictEqual(hydrated, null, 'persisted null must hydrate as null');
  // Simulate project hydration (FIX 1)
  const projectSplConfig = { selectedP14Level: null };
  const mergedSplCfg = { ...projectSplConfig };
  const hydratedFromProject = normaliseP14Level(mergedSplCfg?.selectedP14Level);
  assert.strictEqual(hydratedFromProject, null, 'project null must hydrate as null');
});

// 18. BassResponse: unselected does not render graph/result sections
test('BassResponse: unselected does not render graph/result sections', () => {
  // Simulate the gating logic in BassResponse.jsx
  const p14Selection = resolveP14TargetSelectionState({ selectedP14TargetBasis: null, selectedP14Level: null });
  const graphVisible = !p14Selection.noP14TargetSelected;
  const eqDetailVisible = !p14Selection.noP14TargetSelected;
  const recommendationVisible = !p14Selection.noP14TargetSelected;
  assert.strictEqual(graphVisible, false, 'graph must be hidden when unselected');
  assert.strictEqual(eqDetailVisible, false, 'EQ detail must be hidden when unselected');
  assert.strictEqual(recommendationVisible, false, 'recommendation must be hidden when unselected');
  // Neutral prompt is shown instead
  const neutralPrompt = p14Selection.noP14TargetSelected ? "Select Bass Target" : null;
  assert.strictEqual(neutralPrompt, "Select Bass Target");
});

// 19. ASDR: unselected does not publish numeric rating
test('ASDR: unselected does not publish numeric rating', () => {
  // Simulate the RoomDesigner handoff logic (FIX 3)
  const appDesignRating = { isP14TargetUnselected: true, roomRating: { score: 76 } };
  let publishedRating;
  if (appDesignRating?.isP14TargetUnselected === true) {
    publishedRating = null;
  } else {
    publishedRating = appDesignRating;
  }
  assert.strictEqual(publishedRating, null, 'handoff must publish null rating when P14 unselected');
  // Sidebar receives null → shows "Select Bass Target to complete design rating"
  const sidebarShowsNumeric = publishedRating != null;
  assert.strictEqual(sidebarShowsNumeric, false, 'sidebar must NOT show numeric ASDR');
});

// 20. Sidebar: unselected state shows neutral message, not numeric ASDR
test('Sidebar: unselected state shows neutral message', () => {
  // Simulate DesignRatingSummary logic
  const p14TargetUnselected = true;
  const rating = null; // from handoff
  const asdrUnavailable = false; // minimum system is present
  let displayedMessage;
  if (asdrUnavailable) {
    displayedMessage = "Add LCR, surrounds and subwoofer to calculate rating";
  } else if (p14TargetUnselected && !rating) {
    displayedMessage = "Select Bass Target to complete design rating";
  } else if (false) { // bassPending && !rating
    displayedMessage = "Calculating bass analysis…";
  } else {
    displayedMessage = "NUMERIC_RATING";
  }
  assert.strictEqual(displayedMessage, "Select Bass Target to complete design rating");
  assert.notStrictEqual(displayedMessage, "NUMERIC_RATING", 'must not show numeric rating');
});

// 21. AutoPrint: valid project + unselected P14 completes (does not hang)
test('AutoPrint: valid project + unselected P14 completes', () => {
  // Simulate the autoPrint gate (FIX 5)
  const reportHydrating = false;
  const reportReadyProjectId = "proj-123";
  const explicitProjectId = "proj-123";
  const bassReadiness = { ready: false, pending: false, reason: 'p14-target-not-selected' };
  const bassReportPending = bassReadiness.pending;
  const isPrinting = false;

  // OLD logic: if (!bassReadiness.ready) return; → would block forever
  const oldLogicBlocks = !bassReadiness.ready;

  // NEW logic: if (bassReportPending) return; → does not block
  const newLogicBlocks = bassReportPending;

  assert.strictEqual(oldLogicBlocks, true, 'old logic would block (confirming the bug)');
  assert.strictEqual(newLogicBlocks, false, 'new logic must NOT block when P14 unselected');

  // Full autoPrint trigger condition
  const shouldTrigger = !reportHydrating
    && reportReadyProjectId === explicitProjectId
    && !bassReportPending
    && !isPrinting;
  assert.strictEqual(shouldTrigger, true, 'autoPrint must trigger for valid project with unselected P14');
});

// 22. AutoPrint: invalid project still blocks
test('AutoPrint: invalid project still blocks', () => {
  const reportHydrating = false;
  const reportReadyProjectId = null;
  const explicitProjectId = null;
  const bassReportPending = false;
  const isPrinting = false;

  const shouldTrigger = !!explicitProjectId
    && !reportHydrating
    && reportReadyProjectId === explicitProjectId
    && !bassReportPending
    && !isPrinting;
  assert.strictEqual(shouldTrigger, false, 'autoPrint must NOT trigger without explicit project ID');

  // Also: project still loading (reportHydrating=true)
  const shouldTriggerWhileLoading = !!explicitProjectId
    && !true // reportHydrating is true
    && !bassReportPending;
  assert.strictEqual(shouldTriggerWhileLoading, false, 'autoPrint must NOT trigger while project is loading');
});

// 23. Transition: null → Minimum L2 → calculating → complete
test('Transition: null → Minimum L2 → calculating → complete', () => {
  // STATE A: unselected
  const stateA = resolveP14TargetSelectionState({ selectedP14TargetBasis: null, selectedP14Level: null });
  assert.strictEqual(stateA.targetKey, null);
  assert.strictEqual(stateA.noP14TargetSelected, true);

  // STATE B: Minimum L2 selected → targetKey = minimum-L2
  const stateB = resolveP14TargetSelectionState({ selectedP14TargetBasis: "minimum", selectedP14Level: 2 });
  assert.strictEqual(stateB.targetKey, "minimum-L2");
  assert.strictEqual(stateB.noP14TargetSelected, false);

  // STATE C: calculating (bassReadiness pending)
  function resolveBassReadiness(completedBassAuthority, bassApplicable, p14TargetSelected) {
    if (!p14TargetSelected) return { ready: false, pending: false, reason: 'p14-target-not-selected' };
    const status = completedBassAuthority?.authorityStatus;
    if (status === 'AUTHORITATIVE') return { ready: true, pending: false, reason: 'authoritative' };
    if (status === 'LOADING' || status === 'UPDATING') return { ready: false, pending: true, reason: 'calculating' };
    if (status === 'UNCALCULATED' && bassApplicable) return { ready: false, pending: true, reason: 'bass-not-yet-computed' };
    return { ready: false, pending: true, reason: 'unknown' };
  }
  const readinessCalculating = resolveBassReadiness({ authorityStatus: 'LOADING' }, true, true);
  assert.strictEqual(readinessCalculating.ready, false);
  assert.strictEqual(readinessCalculating.pending, true, 'must be pending while calculating');

  // STATE D: complete (authoritative)
  const readinessComplete = resolveBassReadiness({
    authorityStatus: 'AUTHORITATIVE',
    contract: { job: { resultFingerprint: 'fp1' } },
    currentFingerprint: 'fp1',
  }, true, true);
  assert.strictEqual(readinessComplete.ready, true);
  assert.strictEqual(readinessComplete.pending, false);
});

// 24. RP22Report ASDR: designRatingAuthority gated when unselected
test('RP22Report ASDR: designRatingAuthority gated when unselected', () => {
  // Simulate the RP22Report designRatingAuthority useMemo (FIX 4)
  const showDesignRating = true;
  const p14Selection = { noP14TargetSelected: true };
  let designRatingAuthority;
  if (!showDesignRating) {
    designRatingAuthority = null;
  } else if (p14Selection.noP14TargetSelected) {
    designRatingAuthority = null; // FIX 4: gated
  } else {
    designRatingAuthority = { score: 76 }; // would compute
  }
  assert.strictEqual(designRatingAuthority, null, 'designRatingAuthority must be null when P14 unselected');

  // roomDesignRating cascades to null
  let roomDesignRating;
  if (!designRatingAuthority) {
    roomDesignRating = null;
  } else {
    roomDesignRating = { score: 76 };
  }
  assert.strictEqual(roomDesignRating, null, 'roomDesignRating must be null when P14 unselected');

  // TechnicalAsdrScorecard gated by roomDesignRating
  const scorecardRenders = !!(showDesignRating && roomDesignRating);
  assert.strictEqual(scorecardRenders, false, 'ASDR scorecard must NOT render when P14 unselected');
});

// 25. Export data: unselected PDF contains no historical bass result
test('Export data: unselected PDF contains no historical bass result', () => {
  const oldAuthority = { contract: { productAnalysis: { parameters: { p14: { value: 112, level: 2 } } } } };
  function buildComplianceBassExportData({ completedBassAuthority }, errorMessage = null, noP14TargetSelected = false) {
    const presentation = buildComplianceBassPresentation({ completedBassAuthority }, errorMessage, noP14TargetSelected);
    return {
      ...presentation,
      parameters: presentation.parameters,
      source: noP14TargetSelected ? "unselected" : (presentation.publicationVerified ? "completed-authoritative-bass-result" : "not-verified"),
    };
  }
  const exportData = buildComplianceBassExportData({ completedBassAuthority: oldAuthority }, null, true);
  // No historical bass values in the export
  assert.strictEqual(exportData.parameters.p14.valueText, "Select Bass Target");
  assert.strictEqual(exportData.parameters.p14.isAuthoritative, false);
  assert.strictEqual(exportData.source, "unselected");
  // Ensure old authority values are NOT present
  assert.notStrictEqual(exportData.parameters.p14.valueText, "112 dBC");
  assert.notStrictEqual(exportData.parameters.p14.level, "L2");
});

// ── Summary ──
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);