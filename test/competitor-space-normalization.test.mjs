import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { normalizeCompetitor, competitorMetaForComparison } from '../src/components/utils/spl/competitorNormalization.js';

const base = { manufacturer:'Test', model:'Test', sensitivity_value_db:90, sensitivity_reference:'1W/1m', rated_impedance_ohm:8, continuous_power_w:100, measurement_space_basis:'Half Space' };
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);

// --- Space-basis resolution: independent sensitivity / max-SPL fields ---

test('1. published Half Space sensitivity → 0 dB correction', () => {
  const n = normalizeCompetitor({ ...base, sensitivity_measurement_basis: 'Half Space', max_spl_measurement_basis: 'Half Space' });
  near(n.sensitivity_space_correction_db, 0);
  assert.equal(n.sensitivity_space_provenance, 'half_space_published');
  near(n.halfspace_sensitivity_db_1w_1m, 90);
  near(n.sensitivity_value_db, 90); // raw preserved
});

test('2. published Full Space sensitivity → +6 dB once', () => {
  const n = normalizeCompetitor({ ...base, sensitivity_measurement_basis: 'Full Space', max_spl_measurement_basis: 'Half Space' });
  near(n.sensitivity_space_correction_db, 6);
  assert.equal(n.sensitivity_space_provenance, 'full_space_published_converted');
  near(n.normalized_sensitivity_db_1w_1m, 90); // raw 1W unchanged
  near(n.halfspace_sensitivity_db_1w_1m, 96);   // +6 applied once
  near(n.halfspace_calculated_max_continuous_spl_db_1m, 116);
  assert.deepEqual(normalizeCompetitor(n), n); // idempotent — no double +6
  near(competitorMetaForComparison(n).max_spl_cont_db_1m_halfspace, 116);
});

test('3. blank/Unknown sensitivity basis → assumed Half Space, 0 dB', () => {
  for (const space of [undefined, '', 'Unknown', 'Anechoic', 'Free Space', 'Full Space / Half Space']) {
    const n = normalizeCompetitor({ ...base, measurement_space_basis: undefined, sensitivity_measurement_basis: space });
    near(n.sensitivity_space_correction_db, 0);
    assert.equal(n.sensitivity_space_provenance, 'half_space_assumed');
    near(n.halfspace_sensitivity_db_1w_1m, 90);
    assert.equal(n.p12_p13_eligible, true); // does NOT block grading
    assert.equal(competitorMetaForComparison(n) !== null, true);
  }
});

test('4. published Half Space max SPL → 0 dB', () => {
  const n = normalizeCompetitor({ ...base, published_max_continuous_spl_db_1m: 103, published_max_peak_spl_db_1m: 116, max_spl_measurement_basis: 'Half Space' });
  near(n.max_spl_space_correction_db, 0);
  assert.equal(n.max_spl_space_provenance, 'half_space_published');
  near(n.halfspace_published_max_continuous_spl_db_1m, 103);
  near(n.halfspace_published_max_peak_spl_db_1m, 116);
  near(n.published_max_continuous_spl_db_1m, 103); // raw preserved
});

test('5. published Full Space max SPL → +6 dB once', () => {
  const n = normalizeCompetitor({ ...base, published_max_continuous_spl_db_1m: 103, published_max_peak_spl_db_1m: 116, max_spl_measurement_basis: 'Full Space' });
  near(n.max_spl_space_correction_db, 6);
  assert.equal(n.max_spl_space_provenance, 'full_space_published_converted');
  near(n.halfspace_published_max_continuous_spl_db_1m, 109);
  near(n.halfspace_published_max_peak_spl_db_1m, 122);
  near(n.published_max_continuous_spl_db_1m, 103); // raw preserved
  near(competitorMetaForComparison(n).max_spl_cont_db_1m_halfspace, 109);
  assert.deepEqual(normalizeCompetitor(n), n); // idempotent
});

test('6. blank/Unknown max SPL basis → assumed Half Space, 0 dB', () => {
  for (const space of [undefined, '', 'Unknown', 'Anechoic']) {
    const n = normalizeCompetitor({ ...base, measurement_space_basis: undefined, published_max_continuous_spl_db_1m: 103, max_spl_measurement_basis: space });
    near(n.max_spl_space_correction_db, 0);
    assert.equal(n.max_spl_space_provenance, 'half_space_assumed');
    near(n.halfspace_published_max_continuous_spl_db_1m, 103);
    assert.equal(n.p12_p13_eligible, true);
  }
});

test('7. 2.83 V / 4 Ω and Full Space conversion occur independently', () => {
  const n = normalizeCompetitor({ ...base, sensitivity_reference: '2.83V/1m', rated_impedance_ohm: 4, sensitivity_measurement_basis: 'Full Space', max_spl_measurement_basis: 'Half Space' });
  near(n.voltage_to_1w_correction_db, -10 * Math.log10(2.83 ** 2 / 4));
  near(n.normalized_sensitivity_db_1w_1m, 86.98487120279381); // voltage correction only
  near(n.sensitivity_space_correction_db, 6);                // space correction separate
  near(n.halfspace_sensitivity_db_1w_1m, 92.98487120279381);  // both applied
});

test('8. no double +6 dB correction — idempotent on re-normalisation', () => {
  const full = normalizeCompetitor({ ...base, sensitivity_measurement_basis: 'Full Space', max_spl_measurement_basis: 'Full Space', published_max_continuous_spl_db_1m: 103 });
  const reNorm = normalizeCompetitor(full);
  near(reNorm.sensitivity_space_correction_db, 6);
  near(reNorm.max_spl_space_correction_db, 6);
  near(reNorm.halfspace_sensitivity_db_1w_1m, 96);
  near(reNorm.halfspace_published_max_continuous_spl_db_1m, 109);
  // Also check sensitivity and max-SPL are independent: Full sensitivity + Half max-SPL
  const mixed = normalizeCompetitor({ ...base, sensitivity_measurement_basis: 'Full Space', max_spl_measurement_basis: 'Half Space', published_max_continuous_spl_db_1m: 103 });
  near(mixed.sensitivity_space_correction_db, 6);
  near(mixed.max_spl_space_correction_db, 0);
  near(mixed.halfspace_sensitivity_db_1w_1m, 96);
  near(mixed.halfspace_published_max_continuous_spl_db_1m, 103);
});

test('half space (legacy single field) adds zero and preserves raw data', () => {
  const n = normalizeCompetitor(base);
  near(n.space_correction_db, 0);
  near(n.halfspace_sensitivity_db_1w_1m, 90);
  near(n.halfspace_calculated_max_continuous_spl_db_1m, 110);
  assert.equal(n.sensitivity_value_db, 90);
});

test('legacy measurement_space_basis falls back when independent fields are blank', () => {
  const n = normalizeCompetitor({ ...base, measurement_space_basis: 'Full Space' });
  near(n.sensitivity_space_correction_db, 6);
  near(n.max_spl_space_correction_db, 6);
  assert.equal(n.sensitivity_space_provenance, 'full_space_published_converted');
  assert.equal(n.max_spl_space_provenance, 'full_space_published_converted');
});

test('independent fields take precedence over legacy field', () => {
  const n = normalizeCompetitor({ ...base, measurement_space_basis: 'Full Space', sensitivity_measurement_basis: 'Half Space', max_spl_measurement_basis: 'Half Space' });
  near(n.sensitivity_space_correction_db, 0);
  near(n.max_spl_space_correction_db, 0);
  assert.equal(n.sensitivity_space_provenance, 'half_space_published');
});

// Execute the actual page importer, shared engine and shared grader, without API calls.
const read = p => fs.readFileSync(p, 'utf8');
const strip = s => s.replace(/^import .*;\s*$/gm, '').replace(/^export default .*;\s*$/gm, '').replace(/\bexport /g, '');
const ctx = vm.createContext({ normalizeCompetitor, competitorMetaForComparison, console: { log() {}, warn() {} }, React: { useMemo: f => f() }, logRp22SplDiagnostic() {}, SUBWOOFER_BASS_CAPABILITIES: Object.fromEntries(['sub1-12', 'sub2-12', 'sub3-12', 'sub4-12'].map(k => [k, { frequencyResponseCurve: [] }])) });
for (const p of ['src/components/data/speakerData.jsx', 'src/components/utils/modelKeyNormaliser.js', 'src/components/models/speakers/registry.jsx', 'src/components/utils/spl/speakerSplMeta.js', 'src/components/utils/spl/centralSplEngine.jsx', 'src/components/report/technical/roomParameterLevelAuthority.js', 'src/components/utils/rp22/resolveRp22DesignValue.js', 'src/components/hooks/useAllSeatSplMetrics.jsx']) vm.runInContext(strip(read(p)), ctx);
const page = read('src/pages/SPLCalculator.jsx');
vm.runInContext(page.slice(page.indexOf('function numeric('), page.indexOf('function Rp22Pill(')), ctx);
vm.runInContext(page.slice(page.indexOf('function firstValue('), page.indexOf('function SpeakerRow(')), ctx);
for (const name of ['calculateArtResult', 'competitorResultFor']) {
  const prefix = `  const ${name} = useCallback((`;
  const a = page.indexOf(prefix);
  const body = page.slice(a + prefix.length, page.indexOf('  }, [d, p, roomVolumeM3, basis]);', a));
  vm.runInContext(`function ${name}(${body.replace(') => {', '){')}\n}`, ctx);
}

test('Excel header is imported and raw measurement declaration is preserved', () => {
  ctx.row = { 'Manufacturer': 'Test', 'Model': 'Test', 'Sensitivity Value dB': 90, 'Sensitivity Reference': '1W/1m', 'Continuous Power W': 100, 'Sensitivity Measurement Basis': 'Full Space', 'Max SPL Measurement Basis': 'Half Space' };
  const n = vm.runInContext('normalizeImportedRow(row,0)', ctx);
  assert.equal(n.record.sensitivity_measurement_basis, 'Full Space');
  assert.equal(n.record.max_spl_measurement_basis, 'Half Space');
  near(n.record.halfspace_sensitivity_db_1w_1m, 96);
  assert.equal(n.warnings.length, 0);
});

test('Monitor Audio Synergy 100 Full Space control uses cap 109, not inferred 115', () => {
  ctx.record = { ...base, manufacturer: 'Monitor Audio', model: 'Synergy 100', sensitivity_value_db: 89, sensitivity_reference: '2.83V/1m', rated_impedance_ohm: 4, continuous_power_w: 200, published_max_continuous_spl_db_1m: 103, published_max_peak_spl_db_1m: 116, sensitivity_measurement_basis: 'Full Space', max_spl_measurement_basis: 'Full Space' };
  const n = normalizeCompetitor(ctx.record);
  near(n.normalized_sensitivity_db_1w_1m, 85.98487120279381);
  near(n.halfspace_sensitivity_db_1w_1m, 91.98487120279381);
  near(n.halfspace_calculated_max_continuous_spl_db_1m, 114.99517115943362);
  ctx.d = 3; ctx.p = 100; ctx.roomVolumeM3 = 69.828; ctx.basis = 'minimum';
  let r = vm.runInContext('competitorResultFor(record)', ctx);
  near(r.debug.maxContinuousSplCapDb, 109);
  near(r.spl, 100.95757490560675);
  assert.equal(r.grades.p12, 'L1');
  assert.equal(r.grades.p13, 'L2');
  ctx.basis = 'recommended';
  r = vm.runInContext('competitorResultFor(record)', ctx);
  assert.equal(r.grades.p12, 'FAIL');
  assert.equal(r.grades.p13, 'L1');
});

test('9. Artcoustic P12/P13 regression results remain unchanged', () => {
  const models = ['Evolve 2-1', 'Spitfire Q 4-3', 'Spitfire Q 4-5', 'Spitfire Q 8-5'];
  const expected = [['L1','L2'],['FAIL','L1'],['FAIL','L1'],['FAIL','FAIL'],['FAIL','L1'],['FAIL','FAIL'],['L3','L4'],['L2','L3'],['L2','L3'],['L1','L2'],['L2','L3'],['L1','L2'],['L4','L4'],['L4','L4'],['L4','L4'],['L3','L4'],['L4','L4'],['L3','L4'],...Array(6).fill(['L4','L4'])];
  let i = 0; ctx.roomVolumeM3 = 69.828;
  for (const model of models) for (const [d, p] of [[3, 100], [4, 100], [5, 200]]) for (const basis of ['minimum', 'recommended']) {
    Object.assign(ctx, { modelName: model, d, p, basis });
    const r = vm.runInContext('calculateArtResult(artcousticSpeakers.find(s=>s.model===modelName))', ctx);
    assert.deepEqual([r.grades.p12, r.grades.p13], expected[i++]);
  }
  assert.equal(i, 24);
});

test('10. unknown basis does not return NOT VERIFIED — grades using half-space assumption', () => {
  const n = normalizeCompetitor({ ...base, sensitivity_measurement_basis: '', max_spl_measurement_basis: '', published_max_continuous_spl_db_1m: 105 });
  assert.equal(n.p12_p13_eligible, true);
  assert.equal(n.sensitivity_space_provenance, 'half_space_assumed');
  assert.equal(n.max_spl_space_provenance, 'half_space_assumed');
  ctx.record = { ...base, sensitivity_measurement_basis: '', max_spl_measurement_basis: '', published_max_continuous_spl_db_1m: 105 };
  ctx.d = 3; ctx.p = 100; ctx.roomVolumeM3 = 69.828; ctx.basis = 'minimum';
  const r = vm.runInContext('competitorResultFor(record)', ctx);
  assert.notEqual(r.grades.p12, '—');
  assert.notEqual(r.grades.p13, '—');
});