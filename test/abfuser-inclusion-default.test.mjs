// abfuser-inclusion-default.test.mjs
// The ADI recommendation is the DEFAULT included Abfuser quantity.
//
//   TEST 1  new project, treatment ON  → included = ADI recommendation
//   TEST 2  treatment OFF              → nothing included, nothing priced
//   TEST 3  manual override            → preserved, never overwritten
//   TEST 4  "Use ADI recommendation"   → override cleared, follows recommendation
//   TEST 5  legacy 23                  → not carried forward, replaced by the
//                                        new ADI recommendation
import assert from 'node:assert/strict';
import {
  isManualAbfuserOverride,
  resolveIncludedAbfuserQuantity,
} from '../src/components/utils/abfuserInclusionAuthority.js';
import {
  resolveAbfuserQuantityFromProject,
  ABFUSER_QTY_SOURCE,
} from '../src/components/utils/abfuserQuantityMigration.js';
import { describeAbfuserInclusion } from '../src/components/utils/adiAbfuserRecommendation.js';

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`PASS  ${name}`); }
  catch (e) { failures += 1; console.error(`FAIL  ${name}\n      ${e.message}`); }
};

const included = (overrides) => resolveIncludedAbfuserQuantity({
  enabled: true,
  quantitySource: ABFUSER_QTY_SOURCE.NONE,
  selectedQuantity: 0,
  recommendedQuantity: 0,
  ...overrides,
});

check('TEST 1 — treatment ON, no override → ADI recommendation included by default', () => {
  assert.equal(included({ recommendedQuantity: 6, selectedQuantity: 0 }), 6);
});

check('TEST 2 — treatment OFF → nothing included', () => {
  assert.equal(included({ enabled: false, recommendedQuantity: 6 }), 0);
  assert.equal(included({ enabled: false, quantitySource: ABFUSER_QTY_SOURCE.USER, selectedQuantity: 4, recommendedQuantity: 6 }), 0);
});

check('TEST 3 — manual override preserved when the recommendation changes', () => {
  assert.equal(included({ quantitySource: ABFUSER_QTY_SOURCE.USER, selectedQuantity: 4, recommendedQuantity: 6 }), 4);
  assert.equal(included({ quantitySource: ABFUSER_QTY_SOURCE.USER, selectedQuantity: 4, recommendedQuantity: 9 }), 4);
  assert.equal(isManualAbfuserOverride(ABFUSER_QTY_SOURCE.USER), true);
  assert.equal(isManualAbfuserOverride(ABFUSER_QTY_SOURCE.NONE), false);
  assert.equal(isManualAbfuserOverride(ABFUSER_QTY_SOURCE.RECOMMENDED), false);
});

check('TEST 4 — "Use ADI recommendation" clears the override', () => {
  assert.equal(included({ quantitySource: ABFUSER_QTY_SOURCE.RECOMMENDED, selectedQuantity: 4, recommendedQuantity: 6 }), 6);
});

check('TEST 5 — legacy 23 is not carried forward as a selection', () => {
  const migrated = resolveAbfuserQuantityFromProject({
    selected_abfuser_qty: 23,
    abfuser_qty_source: 'recommended',
    legacy_abfuser_auto_qty: 0,
  });
  assert.equal(migrated.selectedQuantity, 0);
  assert.equal(migrated.quantitySource, ABFUSER_QTY_SOURCE.NONE);
  assert.equal(migrated.legacyAutoQuantity, 23);
  assert.equal(migrated.migrated, true);
  // The new recommendation replaces it.
  assert.equal(included({ quantitySource: migrated.quantitySource, recommendedQuantity: 6 }), 6);
});

check('migration preserves an explicit designer quantity', () => {
  const migrated = resolveAbfuserQuantityFromProject({
    selected_abfuser_qty: 4,
    abfuser_qty_source: 'user',
    legacy_abfuser_auto_qty: 23,
  });
  assert.equal(migrated.selectedQuantity, 4);
  assert.equal(migrated.quantitySource, ABFUSER_QTY_SOURCE.USER);
  assert.equal(migrated.legacyAutoQuantity, 23);
  assert.equal(migrated.migrated, false);
  assert.equal(included({ quantitySource: migrated.quantitySource, selectedQuantity: migrated.selectedQuantity, recommendedQuantity: 6 }), 4);
});

check('migration: a stored value inside the current automatic range is preserved', () => {
  // A stored quantity that is already priced must never be zeroed during
  // hydration. Zeroing it dropped the selection, and the next autosave then
  // persisted 0 over a populated project (Marquee Home regression).
  const migrated = resolveAbfuserQuantityFromProject({
    selected_abfuser_qty: 6,
    abfuser_qty_source: '',
    legacy_abfuser_auto_qty: 0,
  });
  assert.equal(migrated.selectedQuantity, 6);
  assert.equal(migrated.quantitySource, ABFUSER_QTY_SOURCE.NONE);
  assert.equal(migrated.legacyAutoQuantity, 0); // not misreported as retired legacy
  assert.equal(migrated.migrated, false);
  // Pricing is unchanged: with no manual override, the included quantity still
  // follows the live ADI recommendation.
  assert.equal(included({
    quantitySource: migrated.quantitySource,
    selectedQuantity: migrated.selectedQuantity,
    recommendedQuantity: 6,
  }), 6);
  assert.equal(included({
    quantitySource: migrated.quantitySource,
    selectedQuantity: migrated.selectedQuantity,
    recommendedQuantity: 8,
  }), 8);
});

check('report wording follows the three states', () => {
  assert.equal(
    describeAbfuserInclusion({ recommendedQuantity: 6, selectedQuantity: 6 }).message,
    'ADI recommendation included in proposal.'
  );
  assert.equal(
    describeAbfuserInclusion({ recommendedQuantity: 6, selectedQuantity: 4 }).message,
    'Designer selected quantity differs from the ADI recommendation.'
  );
  assert.equal(
    describeAbfuserInclusion({ recommendedQuantity: 6, selectedQuantity: 4, enabled: false }).message,
    'ADI acoustic treatment recommendation not included in proposal.'
  );
});

if (failures) { console.error(`\n${failures} failing`); process.exit(1); }
console.log('\nAll Abfuser inclusion checks passed.');