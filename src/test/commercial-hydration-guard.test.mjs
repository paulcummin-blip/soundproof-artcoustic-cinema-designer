// commercial-hydration-guard.test.mjs
// The commercial-collection hydration + dirty gate.
//
//   TEST 1  delayed hydration              → no commercial save is allowed
//   TEST 2  hydrated, unchanged payload    → save allowed
//   TEST 3  populated extras → empty        → blocked (no real edit)
//   TEST 4  a real extras edit              → allowed
//   TEST 5  accepted treatment → off/0      → blocked (no real edit)
//   TEST 6  a real treatment edit           → allowed
//   TEST 7  genuinely empty project         → allowed, nothing invented
//   TEST 8  version mismatch                → blocked
//   TEST 9  normaliser + migration          → stored values preserved, defaults sane
import assert from 'node:assert/strict';
import {
  COMMERCIAL_BLOCK_REASON,
  COMMERCIAL_COLLECTION,
  clearCommercialEdits,
  createCommercialAuthority,
  guardCommercialSave,
  isCommercialHydrationComplete,
  markCommercialHydrated,
  normaliseCommercialSelections,
  recordCommercialEdit,
  setActiveCommercialAuthority,
  summariseCommercialSelections,
} from '../components/state/commercialHydrationAuthority.js';

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`PASS  ${name}`); }
  catch (e) { failures += 1; console.error(`FAIL  ${name}\n      ${e.message}`); }
};

const PROJECT = 'proj-marquee';
const VERSION = 'ver-original-design';

const loadedRecord = (overrides = {}) => ({
  manual_extras: [
    { id: 'e1', description: 'Projector', quantity: 1, unitPriceExVat: 10000 },
    { id: 'e2', description: 'amplifier', quantity: 1, unitPriceExVat: 5000 },
    { id: 'e3', description: 'power amps', quantity: 1, unitPriceExVat: 2000 },
  ],
  acoustic_treatment_enabled: true,
  selected_abfuser_qty: 6,
  abfuser_qty_source: '',
  legacy_abfuser_auto_qty: 6,
  price_mode: 'incVat',
  show_prices: true,
  difficulty_multiplier: 1,
  selected_speakers: [{ id: 'FL' }, { id: 'FR' }, { id: 'FC' }],
  ...overrides,
});

/** Build an outgoing payload from a record, exactly as serializeProject would. */
const outgoingFrom = (record) => {
  const s = normaliseCommercialSelections(record);
  return {
    manual_extras: s.manualExtras,
    acoustic_treatment_enabled: s.acousticTreatment.enabled,
    selected_abfuser_qty: s.acousticTreatment.selectedQuantity,
    abfuser_qty_source: s.acousticTreatment.quantitySource,
    price_mode: s.priceMode,
    show_prices: s.showPrices,
    difficulty_multiplier: s.difficultyMultiplier,
  };
};

const hydratedAuthority = (record = loadedRecord()) => {
  clearCommercialEdits();
  const authority = markCommercialHydrated(
    createCommercialAuthority({ projectId: PROJECT, versionId: VERSION, loadGenerationId: 1 }),
    normaliseCommercialSelections(record),
  );
  setActiveCommercialAuthority(authority);
  return authority;
};

const guard = (authority, outgoing, versionId = VERSION) => guardCommercialSave({
  authority,
  projectId: PROJECT,
  versionId,
  outgoing,
});

check('TEST 1 — delayed hydration: no commercial save is allowed', () => {
  const loading = createCommercialAuthority({ projectId: PROJECT, versionId: null, loadGenerationId: 1 });
  assert.equal(isCommercialHydrationComplete(loading, PROJECT, VERSION), false);
  // Even an outgoing payload that *looks* right is refused while loading: the
  // authoritative collections are not in state yet.
  const result = guard(loading, outgoingFrom(loadedRecord()));
  assert.equal(result.blocked, true);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, COMMERCIAL_BLOCK_REASON.HYDRATION_INCOMPLETE);
});

check('TEST 2 — hydrated and unchanged: the save is allowed', () => {
  const authority = hydratedAuthority();
  assert.equal(isCommercialHydrationComplete(authority, PROJECT, VERSION), true);
  const result = guard(authority, outgoingFrom(loadedRecord()));
  assert.equal(result.blocked, false);
  assert.equal(result.allowed, true);
  assert.equal(result.reason, null);
  // The loaded snapshot keeps everything that was priced.
  assert.equal(authority.snapshot.manualExtras.length, 3);
  assert.equal(authority.snapshot.acousticTreatment.selectedQuantity, 6);
});

check('TEST 3 — a populated extras list is not replaced by an empty default', () => {
  const authority = hydratedAuthority();
  const outgoing = outgoingFrom(loadedRecord({ manual_extras: [] }));
  const result = guard(authority, outgoing);
  assert.equal(result.blocked, true);
  assert.equal(result.reason, COMMERCIAL_BLOCK_REASON.DEFAULT_WIPE);
  assert.match(result.detail, /manualExtras 3→0/);
});

check('TEST 4 — a real extras edit (including clearing them) saves', () => {
  const authority = hydratedAuthority();
  recordCommercialEdit(COMMERCIAL_COLLECTION.MANUAL_EXTRAS);
  const result = guard(authority, outgoingFrom(loadedRecord({ manual_extras: [] })));
  assert.equal(result.blocked, false);
  assert.equal(result.allowed, true);
});

check('TEST 5 — an accepted treatment selection is not silently dropped', () => {
  const authority = hydratedAuthority();

  const disabled = guard(authority, outgoingFrom(loadedRecord({ acoustic_treatment_enabled: false })));
  assert.equal(disabled.blocked, true);
  assert.equal(disabled.reason, COMMERCIAL_BLOCK_REASON.DEFAULT_WIPE);
  assert.match(disabled.detail, /acousticTreatment enabled→disabled/);

  const zeroed = guard(authority, outgoingFrom(loadedRecord({ selected_abfuser_qty: 0 })));
  assert.equal(zeroed.blocked, true);
  assert.match(zeroed.detail, /treatmentQty 6→0/);
});

check('TEST 6 — a real treatment edit saves', () => {
  const authority = hydratedAuthority();
  recordCommercialEdit(COMMERCIAL_COLLECTION.ACOUSTIC_TREATMENT);
  const result = guard(authority, outgoingFrom(loadedRecord({ acoustic_treatment_enabled: false, selected_abfuser_qty: 0 })));
  assert.equal(result.blocked, false);
});

check('TEST 7 — a genuinely empty project stays valid and invents nothing', () => {
  const empty = {
    manual_extras: [],
    acoustic_treatment_enabled: false,
    selected_abfuser_qty: 0,
    legacy_abfuser_auto_qty: 0,
    selected_speakers: [],
  };
  const authority = hydratedAuthority(empty);
  assert.equal(authority.snapshot.manualExtras.length, 0);
  assert.equal(authority.snapshot.acousticTreatment.selectedQuantity, 0);

  const result = guard(authority, outgoingFrom(empty));
  assert.equal(result.blocked, false, 'an empty project must still save');

  // Adding extras to an empty project is a normal edit, never blocked.
  const withNew = loadedRecord();
  assert.equal(guard(authority, outgoingFrom(withNew)).blocked, false);

  const summary = summariseCommercialSelections(outgoingFrom(empty));
  assert.equal(summary.manualExtras, 0);
  assert.equal(summary.treatmentQty, 0);
  assert.equal(summary.treatmentEnabled, false);
});

check('TEST 8 — a version mismatch blocks the write', () => {
  const authority = hydratedAuthority();
  const result = guard(authority, outgoingFrom(loadedRecord()), 'ver-some-other-version');
  assert.equal(result.blocked, true);
  assert.equal(result.reason, COMMERCIAL_BLOCK_REASON.HYDRATION_INCOMPLETE);
});

check('TEST 9 — normaliser preserves stored values and applies sane defaults', () => {
  const stored = normaliseCommercialSelections(loadedRecord());
  assert.equal(stored.manualExtras.length, 3);
  assert.equal(stored.manualExtras[0].description, 'Projector');
  assert.equal(stored.manualExtras[0].unitPriceExVat, 10000);
  assert.equal(stored.priceMode, 'incVat');
  assert.equal(stored.showPrices, true);
  assert.equal(stored.difficultyMultiplier, 1);
  assert.equal(stored.acousticTreatment.enabled, true);
  assert.equal(stored.acousticTreatment.selectedQuantity, 6);
  assert.equal(stored.acousticTreatment.legacyAutoQuantity, 6);
  assert.equal(stored.selectedProductCount, 3);

  const bare = normaliseCommercialSelections({});
  assert.deepEqual(bare.manualExtras, []);
  assert.equal(bare.priceMode, 'incVat');
  assert.equal(bare.showPrices, true);
  assert.equal(bare.difficultyMultiplier, 1);
  assert.equal(bare.acousticTreatment.selectedQuantity, 0);

  const exVatHidden = normaliseCommercialSelections({ price_mode: 'exVat', show_prices: false, difficulty_multiplier: 1.25 });
  assert.equal(exVatHidden.priceMode, 'exVat');
  assert.equal(exVatHidden.showPrices, false);
  assert.equal(exVatHidden.difficultyMultiplier, 1.25);
});

if (failures) { console.error(`\n${failures} failing`); process.exit(1); }
console.log('\nAll commercial hydration guard checks passed.');