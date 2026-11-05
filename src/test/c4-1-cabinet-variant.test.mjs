// ---------------------------------------------------------------------------
// TEST   TV-linked soundbar cabinet variants — commercial authority
// WHAT   The C4-1, Multi (LCR/Mono) and HSPL soundbars are published in several
//        cabinet lengths. This suite asserts the CONFIRMED commercial reality:
//
//          C4-1            1222, 1449, 1672, 1904 mm   (ProductPrice catalogue)
//          Multi LCR/Mono  1094, 1222, 1441, 1711, 1842, 2230 mm
//                          (1094 mm is valid and selectable; its price is pending)
//          HSPL            bespoke — made to the screen's overall width exactly
//
//        The installed variant is the LONGEST available cabinet that is no more
//        than 5 mm wider than the screen's OVERALL physical width (frame
//        included); the dual-centre arrangement still uses the C4-1's named
//        1222 mm cabinet; a designer's explicitly recorded length is preserved
//        even when it is no longer in the current commercial catalogue, so a
//        saved project is never silently resized. Drawings, measurements and
//        reports all resolve the variant through the ONE authority.
//
//        None of this touches SPL, RP22, impedance, aiming or the logical centre
//        channel. TEST 9 asserts the C4-1's engineering data is unchanged.
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  MODELS,
  getSpeakerModelMeta,
  getSoundbarCabinetLengthsMm,
  getDualCentreCabinetLengthMm,
} from '@/components/models/speakers/registry';
import {
  nearestCabinetLengthMm,
  longestCabinetWithinMm,
  resolveScreenPhysicalWidthMm,
  resolveScreenOverallWidthMm,
  resolveSoundbarCabinetLengthMm,
  resolvePlacedCabinetLengthMm,
  isHsplModel,
} from '@/components/models/speakers/soundbarCabinetVariant';
import {
  CENTRE_CABINET_ROLES,
  DUAL_CENTRE_CABINET_COUNT,
  DUAL_CENTRE_SPL_GAIN_DB,
  defaultCentreCabinetOrientation,
  resolveCentreCabinetFootprintM,
} from '@/components/utils/frontStageModeAuthority';

// ── Fixtures ───────────────────────────────────────────────────────────────
const C41_LENGTHS = [1222, 1449, 1672, 1904];
const MULTI_LENGTHS = [1094, 1222, 1441, 1711, 1842, 2230];

const tv = (key, mm) => ({ tvPresetKey: key, tvWidthMm: mm, aspectRatio: '16:9' });
const manualWh = (widthM, heightM) => ({
  aspectRatio: '16:9',
  manualSize: { enabled: true, mode: 'wh', widthM, heightM },
});
const widthInches = (inches) => ({ aspectRatio: '16:9', visibleWidthInches: inches });

const lengthFor = (modelKey, screen, extra = {}) => resolveSoundbarCabinetLengthMm({ modelKey, screen, ...extra });
const read = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

const c41Artwork = read('src/components/report/C41ArtworkFaceIcons.jsx');
const frontElevation = read('src/components/room/FrontElevation.jsx')
  + read('src/components/room/front/FrontSpeakerArt.jsx');
const planLayer = read('src/components/room/rv/render/RvSpeakerLayer.jsx');
const planIcons = read('src/components/room/rv/RenderPrimitives.jsx');
const authority = read('src/components/report/elevation/elevationArtAuthority.js');

// ── 1. The catalogue ──────────────────────────────────────────────────────

test('TEST 1  The catalogue publishes the verified commercial C4-1 and Multi lengths', () => {
  assert.deepEqual(getSoundbarCabinetLengthsMm('c4-1'), C41_LENGTHS);
  assert.equal(getDualCentreCabinetLengthMm('c4-1'), 1222);
  // 1222 mm is the one length the C4-1 catalogue has always carried.
  assert.ok(C41_LENGTHS.includes(1222), '1222 mm is a catalogue length');
  // A catalogue product, not a new one: exactly one C4-1 row, no duplicates.
  assert.equal(MODELS.filter((m) => m.key === 'c4-1').length, 1);

  // Multi LCR and Multi Mono share the same verified commercial range; 1094 mm
  // is a real Multi size (selectable, price pending) and every priced variant is
  // preserved.
  assert.deepEqual(getSoundbarCabinetLengthsMm('multi-lcr'), MULTI_LENGTHS);
  assert.deepEqual(getSoundbarCabinetLengthsMm('multi-mono'), MULTI_LENGTHS);
  assert.equal(MODELS.filter((m) => m.key === 'multi-lcr').length, 1);
  assert.equal(MODELS.filter((m) => m.key === 'multi-mono').length, 1);

  // A discrete speaker has no cabinet lengths.
  assert.deepEqual(getSoundbarCabinetLengthsMm('evolve-2-1'), []);
});

// ── 2. Selection — longest cabinet no more than 5 mm wider than the overall width

test('TEST 2  The screen OVERALL width (frame included) decides the cabinet', () => {
  // A TV preset's own tvWidthMm is its overall physical width (bezel included),
  // so no frame border is added on top of it.
  assert.equal(resolveScreenOverallWidthMm(tv('tv65', 1411)), 1411);
  assert.equal(resolveScreenOverallWidthMm(tv('tv100', 2230)), 2230);

  // A projection screen's overall width is the viewable image plus a border on
  // every side (default border 50 mm per side).
  const manual = manualWh(1.222, 0.687);
  assert.equal(resolveScreenOverallWidthMm(manual), 1222 + 100);

  // The legacy viewable-width accessor is preserved for callers that still read it.
  assert.equal(Math.round(resolveScreenPhysicalWidthMm(tv('tv65', 1411))), 1411);
});

test('TEST 3  C4-1 installs the longest cabinet no more than 5 mm wider than the overall width', () => {
  // TV presets: overall width = tvWidthMm.
  assert.equal(lengthFor('c4-1', tv('tv65', 1411)), 1222, '1411 → 1449 is 38 mm too wide; 1222 fits');
  assert.equal(lengthFor('c4-1', tv('tv77', 1711)), 1672, '1711 → 1672 fits (1904 is 193 mm too wide)');
  assert.equal(lengthFor('c4-1', tv('tv83', 1872)), 1672, '1872 → 1672 fits (1904 is 32 mm too wide)');
  assert.equal(lengthFor('c4-1', tv('tv100', 2230)), 1904, '2230 → 1904 fits');

  // Manual projection widths: overall = viewable + 2 × border (default 50 mm).
  assert.equal(lengthFor('c4-1', manualWh(1.222, 0.687)), 1222);
  assert.equal(lengthFor('c4-1', manualWh(1.441, 0.8106)), 1449, '1441 viewable → 1541 overall → 1449 fits');
  assert.equal(lengthFor('c4-1', manualWh(1.672, 0.9405)), 1672);
  assert.equal(lengthFor('c4-1', manualWh(1.904, 1.071)), 1904);
  assert.equal(lengthFor('c4-1', widthInches(48.11)), 1222);
});

test('TEST 4  longestCabinetWithinMm selects the longest that fits, else the smallest', () => {
  assert.equal(longestCabinetWithinMm(C41_LENGTHS, 1411, 5), 1222);
  assert.equal(longestCabinetWithinMm(C41_LENGTHS, 1711, 5), 1672);
  assert.equal(longestCabinetWithinMm(C41_LENGTHS, 2230, 5), 1904);
  // When even the smallest exceeds the limit, the smallest is returned.
  assert.equal(longestCabinetWithinMm(C41_LENGTHS, 1000, 5), 1222);
  assert.equal(longestCabinetWithinMm([], 1400, 5), null, 'nothing comparable is never guessed');
  // nearestCabinetLengthMm is preserved for callers that still read it.
  assert.equal(nearestCabinetLengthMm(C41_LENGTHS, 1300), 1222);
  assert.equal(nearestCabinetLengthMm([], 1400), null);
});

test('TEST 5  Multi LCR and Multi Mono use the same selection rule', () => {
  assert.equal(lengthFor('multi-lcr', tv('tv65', 1411)), 1222);
  assert.equal(lengthFor('multi-lcr', tv('tv77', 1711)), 1711);
  assert.equal(lengthFor('multi-lcr', tv('tv83', 1872)), 1842);
  assert.equal(lengthFor('multi-lcr', tv('tv100', 2230)), 2230);
  // 1094 mm is reachable for a screen narrow enough to fit it.
  assert.equal(lengthFor('multi-mono', tv('tv65', 1094)), 1094);
  assert.equal(lengthFor('multi-mono', manualWh(1.094, 0.615)), 1094);
});

// ── 3. HSPL — bespoke, made to measure ─────────────────────────────────────

test('TEST 6  HSPL is bespoke: the cabinet matches the screen overall width exactly', () => {
  assert.ok(isHsplModel('hspl-lcr'));
  assert.ok(isHsplModel('hspl-mono'));
  assert.equal(lengthFor('hspl-lcr', tv('tv83', 1872)), 1872, 'no rounding, no tolerance');
  assert.equal(lengthFor('hspl-mono', tv('tv100', 2230)), 2230);
  // A projection screen: overall = viewable + 2 × border.
  assert.equal(lengthFor('hspl-lcr', manualWh(1.5, 0.844)), 1600);
  // A designer's own recorded HSPL length is preserved.
  assert.equal(resolvePlacedCabinetLengthMm({ model: 'hspl-lcr', cabinetLengthMm: 1800 }, tv('tv83', 1872)), 1800);
});

// ── 4. Explicit selection — historical lengths are preserved ──────────────

test('TEST 7  An explicitly recorded length is preserved, even a legacy one', () => {
  // A current commercial length survives any screen change.
  assert.equal(resolvePlacedCabinetLengthMm({ model: 'c4-1', cabinetLengthMm: 1672 }, tv('tv65', 1411)), 1672);
  // A legacy length no longer in the commercial catalogue is STILL preserved:
  // a saved project's historical selection is never silently resized.
  assert.equal(resolvePlacedCabinetLengthMm({ model: 'c4-1', cabinetLengthMm: 1441 }, manualWh(2.4, 1.35)), 1441);
  assert.equal(resolvePlacedCabinetLengthMm({ model: 'c4-1', cabinetLengthMm: 1711 }, tv('tv65', 1411)), 1711);
  // HSPL preserves its recorded length too.
  assert.equal(resolvePlacedCabinetLengthMm({ model: 'hspl-mono', cabinetLengthMm: 2000 }, tv('tv100', 2230)), 2000);
});

// ── 5. Dual Mono Centre — the 1222 mm variant ─────────────────────────────

test('TEST 8  Dual centre with the C4-1 is always the 1222 mm cabinet', () => {
  const screens = [tv('tv65', 1411), tv('tv100', 2230), manualWh(2.4, 1.35), null];
  screens.forEach((screen) => {
    assert.equal(lengthFor('c4-1', screen, { dualCentre: true }), 1222, 'a wider screen never substitutes a longer bar');
  });
  assert.equal(defaultCentreCabinetOrientation('c4-1', 'tv100'), 'vertical');
  assert.equal(CENTRE_CABINET_ROLES.left, 'FCL');
  assert.equal(CENTRE_CABINET_ROLES.right, 'FCR');
  assert.equal(DUAL_CENTRE_SPL_GAIN_DB, 4);
  assert.equal(DUAL_CENTRE_CABINET_COUNT, 2);

  const vertical = resolveCentreCabinetFootprintM('c4-1', 'vertical', 'tv100');
  assert.equal(vertical.cabinetLengthMm, 1222);
  assert.equal(vertical.widthM, 0.12);
  assert.equal(vertical.heightM, 1.222);

  const horizontal = resolveCentreCabinetFootprintM('c4-1', 'horizontal', 'tv100');
  assert.equal(horizontal.cabinetLengthMm, 1222);
  assert.equal(horizontal.widthM, 1.222);
  assert.equal(horizontal.heightM, 0.12);
});

test('TEST 8b Other models are untouched by the variant rule', () => {
  assert.equal(getSpeakerModelMeta('c-1', 'tv100').widthM, 0.4);
  assert.equal(getSpeakerModelMeta('evolve-2-1').widthM, 0.2);
  assert.equal(getDualCentreCabinetLengthMm('c-1'), null);
  assert.equal(resolveSoundbarCabinetLengthMm({ modelKey: 'c-1', screen: tv('tv100', 2230) }), null);
});

// ── 6. Engineering authority is untouched ─────────────────────────────────

test('TEST 9  The C4-1 engineering data is unchanged by the variant work', () => {
  const meta = getSpeakerModelMeta('c4-1');
  assert.equal(meta.sensitivity_dB_1w1m, 98);
  assert.equal(meta.nominalOhms, 8);
  assert.equal(meta.max_power, 120);
  assert.equal(meta.max_spl, 109);
  assert.equal(meta.peak_spl, 115);
  assert.equal(meta.max_spl_cont_db_1m_halfspace, 109);
  assert.equal(meta.max_spl_peak_db_cf6_1m_halfspace, 115);
  assert.equal(meta.max_spl_cont_db_1m_anechoic, 103);
  assert.equal(meta.usable_lf_hz_minus6db, 77);
  assert.equal(meta.frontStageType, 'center_only');

  // The variant only ever changes the cabinet's LENGTH. Every current commercial
  // length reports its own width and the same shared acoustic specification.
  const metas = C41_LENGTHS.map((mm) => getSpeakerModelMeta('c4-1', null, { cabinetLengthMm: mm }));
  metas.forEach((m, i) => {
    assert.equal(m.widthM, C41_LENGTHS[i] / 1000);
    assert.equal(m.cabinetLengthMm, C41_LENGTHS[i]);
    assert.equal(m.heightM, 0.12);
    assert.equal(m.depthM, 0.081);
    assert.equal(m.sensitivity_dB_1w1m, 98);
    assert.equal(m.max_power, 120);
  });
  // Every acoustic field is identical across the widths.
  const ACOUSTIC_FIELDS = [
    'sensitivity_dB_1w1m', 'nominalOhms', 'max_power', 'max_spl', 'peak_spl',
    'max_spl_cont_db_1m_halfspace', 'max_spl_peak_db_cf6_1m_halfspace',
    'max_spl_cont_db_1m_anechoic', 'usable_lf_hz_minus6db',
    'hfOffAxis16k', 'dispersion', 'frontStageType', 'category', 'price_gbp_exVat',
  ];
  const base = metas[0];
  metas.slice(1).forEach((m, i) => {
    ACOUSTIC_FIELDS.forEach((field) => {
      assert.deepEqual(m[field], base[field], `${field} differs at ${C41_LENGTHS[i + 1]} mm`);
    });
    assert.equal(m.key, 'c4-1');
  });
  assert.equal(MODELS.filter((m) => m.key === 'c4-1').length, 1);
  assert.equal(MODELS.filter((m) => String(m.label || '').startsWith('C4-1')).length, 1);
});

// ── 7. The approved 1222 mm artwork ───────────────────────────────────────

test('TEST 10 The 1222 mm artwork is cropped to its ink and keeps the cabinet proportions', () => {
  assert.ok(c41Artwork.includes('export function C41_1222FaceIcon'));
  assert.ok(c41Artwork.includes('https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/0103ea1cc_ChatGPTImage9Oct202610_47_24.png'));
  assert.ok(c41Artwork.includes('box: "45 257 2083 208"'), 'the surrounding whitespace is cropped');
  // The 1222 mm cabinet is drawn through its own icon, gated on the installed length.
  assert.ok(frontElevation.includes("const isC41_1222 = isC41 && Number(cabinetLengthMm) === 1222;"));
  assert.ok(frontElevation.includes('if (isC41 && isC41_1222) return <C41_1222FaceIcon'));
  // The crop is recorded in the one elevation authority.
  assert.ok(authority.includes('c41_1222:'));
});

test('TEST 11 The legacy 1441 mm and 1711 mm artworks are preserved for saved projects', () => {
  // A saved project whose explicitly recorded length is a legacy 1441 or 1711 mm
  // cabinet still draws its own approved artwork; nothing is stretched or lost.
  assert.ok(c41Artwork.includes('export function C41_1441FaceIcon'));
  assert.ok(c41Artwork.includes('export function C41_1711FaceIcon'));
  assert.ok(c41Artwork.includes('box: "36 275 2095 170"'), 'the 1441 mm crop is preserved');
  assert.ok(c41Artwork.includes('box: "35 277 2097 149"'), 'the 1711 mm crop is preserved');
  assert.ok(frontElevation.includes('const isC41_1441 = isC41 && Number(cabinetLengthMm) === 1441;'));
  assert.ok(frontElevation.includes('const isC41_1711 = isC41 && Number(cabinetLengthMm) === 1711;'));
  assert.ok(frontElevation.includes('if (isC41 && isC41_1441) return <C41_1441FaceIcon'));
  assert.ok(frontElevation.includes('if (isC41 && isC41_1711) return <C41_1711FaceIcon'));
  // The catalogue drawing remains the fallback for any other length.
  assert.ok(frontElevation.includes('if (isC41) return <C41FaceIcon'));
  // The artwork is never axis-stretched.
  assert.ok(!c41Artwork.includes('preserveAspectRatio="none"'));
});

// ── 8. One variant authority, both drawings ───────────────────────────────

test('TEST 12 Front Elevation and Plan View resolve the variant through one authority', () => {
  assert.ok(authority.includes('export function resolveSoundbarCabinetLengthMm') || read('src/components/models/speakers/soundbarCabinetVariant.js').includes('export function resolveSoundbarCabinetLengthMm'));
  [frontElevation, planLayer, planIcons].forEach((source, i) => {
    assert.ok(source.includes('resolveSoundbarCabinetLengthMm'), `drawing site ${i} uses the variant authority`);
  });
  assert.ok(planLayer.includes('resolveCentreCabinetFootprintM(speaker.model, speaker.orientation, tvPresetKey || null, { cabinetLengthMm: speaker.cabinetLengthMm })'),
    'the plan draws the dual-centre cabinet at its installed variant');
  assert.ok(frontElevation.includes('cabinetLengthMm: footprint?.cabinetLengthMm ?? meta?.cabinetLengthMm ?? null'),
    'the front elevation knows which variant it installed');
});

test('TEST 13 A vertically mounted cabinet is rotated a quarter turn, not redrawn', () => {
  assert.ok(frontElevation.includes('rotate(90 ${cx} ${cy})'));
  assert.ok(frontElevation.includes('vertical: spk.vertical === true'));
  assert.ok(frontElevation.includes('iconBoxW = vertical ? sh : sw'));
  assert.match(frontElevation, /const FACE_ICON_VISIBLE_RATIO = elevationArtFitRatio\(faceIconArtworkKey\);/);
});

// ── 9. Save and reopen ────────────────────────────────────────────────────

test('TEST 14 Model, orientation and variant are restored on reopen', () => {
  const stored = [
    { role: 'FCL', model: 'c4-1', orientation: 'vertical' },
    { role: 'FCR', model: 'c4-1', orientation: 'vertical' },
  ];
  const reloaded = JSON.parse(JSON.stringify(stored));
  reloaded.forEach((cabinet) => {
    const footprint = resolveCentreCabinetFootprintM(cabinet.model, cabinet.orientation, 'tv100');
    assert.equal(footprint.cabinetLengthMm, 1222);
    assert.equal(footprint.orientation, 'vertical');
  });

  // A single-centre installation re-resolves to the same variant on reload.
  const screen1449 = manualWh(1.449, 0.815);
  assert.equal(lengthFor('c4-1', screen1449), lengthFor('c4-1', JSON.parse(JSON.stringify(screen1449))));
  // An explicitly stored legacy length is restored verbatim.
  assert.equal(
    resolvePlacedCabinetLengthMm(JSON.parse(JSON.stringify({ model: 'c4-1', cabinetLengthMm: 1441 })), screen1449),
    1441,
  );
});