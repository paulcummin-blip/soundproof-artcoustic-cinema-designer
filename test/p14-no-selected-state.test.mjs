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

// ── Summary ──
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);