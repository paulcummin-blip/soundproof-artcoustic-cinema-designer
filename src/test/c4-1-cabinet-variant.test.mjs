// ---------------------------------------------------------------------------
// TEST   C4-1 cabinet variant — single centre selection and dual-centre 1222 mm
// WHAT   The C4-1 is published in several cabinet lengths. This suite asserts
//        that the installed variant is chosen from the SCREEN'S PHYSICAL WIDTH
//        (never its diagonal, never a fixed default), that the dual-centre
//        arrangement uses the catalogue's named 1222 mm cabinet, that an
//        explicit choice survives a screen change, and that the four TV presets
//        resolve exactly as they did before — so existing projects are untouched.
//        It also guards both approved artworks (the 1222 mm and 1441 mm
//        cabinets) and the fact that every drawing resolves the variant through
//        the ONE authority.
// ENGINEERING SCOPE  None of this touches SPL, RP22, impedance, aiming or the
//        logical centre channel. TEST 9 asserts the C4-1's engineering data is
//        byte-for-byte what it was.
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
  resolveScreenPhysicalWidthMm,
  resolveSoundbarCabinetLengthMm,
  resolvePlacedCabinetLengthMm,
} from '@/components/models/speakers/soundbarCabinetVariant';
import {
  CENTRE_CABINET_ROLES,
  defaultCentreCabinetOrientation,
  resolveCentreCabinetFootprintM,
} from '@/components/utils/frontStageModeAuthority';

// ── Fixtures ───────────────────────────────────────────────────────────────
const C41_LENGTHS = [1222, 1411, 1441, 1711, 1872, 2230];

const tv = (key, mm) => ({ tvPresetKey: key, tvWidthMm: mm, aspectRatio: '16:9' });
const manualWh = (widthM, heightM) => ({
  aspectRatio: '16:9',
  manualSize: { enabled: true, mode: 'wh', widthM, heightM },
});
const widthInches = (inches) => ({ aspectRatio: '16:9', visibleWidthInches: inches });

const lengthFor = (modelKey, screen, extra = {}) => resolveSoundbarCabinetLengthMm({ modelKey, screen, ...extra });
const read = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

const faceIcons = read('src/components/report/SpeakerFaceIcons.jsx');
const c41Artwork = read('src/components/report/C41ArtworkFaceIcons.jsx');
const frontElevation = read('src/components/room/FrontElevation.jsx');
const planLayer = read('src/components/room/rv/render/RvSpeakerLayer.jsx');
const planIcons = read('src/components/room/rv/RenderPrimitives.jsx');

// ── 1. The catalogue ──────────────────────────────────────────────────────

test('TEST 1  The catalogue publishes six C4-1 cabinet lengths, names the dual-centre one, and lists 1441 mm', () => {
  assert.deepEqual(getSoundbarCabinetLengthsMm('c4-1'), C41_LENGTHS);
  assert.equal(getDualCentreCabinetLengthMm('c4-1'), 1222);
  // 1441 mm is a catalogue length of its own — a new variant, never a copy of the
  // 1411 mm row — and it changes nothing about the dual-centre requirement.
  assert.ok(C41_LENGTHS.includes(1441), 'the 1441 mm cabinet is an available variant');
  // A catalogue product, not a new one: exactly one C4-1 row, no duplicates.
  assert.equal(MODELS.filter((m) => m.key === 'c4-1').length, 1);
  // The other TV-linked soundbars keep the lengths they already published.
  assert.deepEqual(getSoundbarCabinetLengthsMm('multi-mono'), [1411, 1711, 1872, 2230]);
  assert.deepEqual(getSoundbarCabinetLengthsMm('evolve-2-1'), [], 'a discrete speaker has no cabinet lengths');
});

// ── 2. Single centre — nearest available length to the screen width ───────

test('TEST 2  The four existing TV presets resolve exactly as before (no regression)', () => {
  assert.equal(lengthFor('c4-1', tv('tv65', 1411)), 1411);
  assert.equal(lengthFor('c4-1', tv('tv77', 1711)), 1711);
  assert.equal(lengthFor('c4-1', tv('tv83', 1872)), 1872);
  assert.equal(lengthFor('c4-1', tv('tv100', 2230)), 2230);
});

test('TEST 3  The physical width decides, never the screen diagonal', () => {
  // "TV 65"" is a DIAGONAL; the physical viewable width is 55.55" = 1411 mm, and
  // the cabinet that fits it is the 1411 mm one.
  const preset = tv('tv65', 1411);
  assert.equal(Math.round(resolveScreenPhysicalWidthMm(preset)), 1411);
  assert.equal(lengthFor('c4-1', preset), 1411);

  // A 1222 mm screen — 48.1" wide — gets the 1222 mm cabinet, which is neither
  // the smallest fallback in use before nor the next length up.
  assert.equal(lengthFor('c4-1', manualWh(1.222, 0.687)), 1222);
  assert.equal(lengthFor('c4-1', widthInches(48.11)), 1222);
  // A recorded TV width resolves the cabinet the same way (a preset key, when
  // one is set, is the screen's own authority and wins — that is existing
  // screen behaviour, not a cabinet rule).
  assert.equal(lengthFor('c4-1', { aspectRatio: '16:9', tvWidthMm: 1250 }), 1222,
    'a 1250 mm screen is closest to the 1222 mm cabinet');

  // The 1441 mm cabinet is reachable, and it is chosen for its own width: the
  // 1411 mm cabinet is no longer substituted there.
  assert.equal(lengthFor('c4-1', manualWh(1.441, 0.8106)), 1441);
  assert.equal(lengthFor('c4-1', widthInches(56.73)), 1441);
  assert.equal(nearestCabinetLengthMm(C41_LENGTHS, 1441), 1441);
});

test('TEST 4  Widths between variants pick the closest catalogue length', () => {
  assert.equal(lengthFor('c4-1', manualWh(2.4, 1.35)), 2230);
  assert.equal(lengthFor('c4-1', manualWh(1.0, 0.5625)), 1222);
  assert.equal(lengthFor('c4-1', manualWh(1.9, 1.07)), 1872);
  assert.equal(nearestCabinetLengthMm(C41_LENGTHS, 1300), 1222);
  assert.equal(nearestCabinetLengthMm(C41_LENGTHS, 1400), 1411);
  assert.equal(nearestCabinetLengthMm([], 1400), null, 'nothing comparable is never guessed');
});

test('TEST 5  The 1222 mm cabinet is NOT used for every single-centre installation', () => {
  const resolved = [
    lengthFor('c4-1', tv('tv65', 1411)),
    lengthFor('c4-1', tv('tv77', 1711)),
    lengthFor('c4-1', tv('tv83', 1872)),
    lengthFor('c4-1', tv('tv100', 2230)),
    lengthFor('c4-1', manualWh(2.4, 1.35)),
  ];
  assert.ok(resolved.every((mm) => mm !== 1222), `no screen here fits the 1222 mm cabinet (got ${resolved})`);
});

test('TEST 6  An explicitly selected length is preserved when the screen changes', () => {
  const chosen = { model: 'c4-1', cabinetLengthMm: 1711 };

  assert.equal(resolvePlacedCabinetLengthMm(chosen, manualWh(2.4, 1.35)), 1711);
  assert.equal(resolvePlacedCabinetLengthMm(chosen, tv('tv65', 1411)), 1711);
  // A value that is not a real catalogue variant is ignored, not honoured.
  assert.equal(resolvePlacedCabinetLengthMm({ model: 'c4-1', cabinetLengthMm: 1500 }, tv('tv65', 1411)), 1411);
  // An explicitly chosen 1441 mm cabinet is honoured on any screen too.
  assert.equal(resolvePlacedCabinetLengthMm({ model: 'c4-1', cabinetLengthMm: 1441 }, manualWh(2.4, 1.35)), 1441);
});

// ── 3. Dual Mono Centre — the 1222 mm variant ─────────────────────────────

test('TEST 7  Dual centre with the C4-1 is always the 1222 mm cabinet', () => {
  const screens = [tv('tv65', 1411), tv('tv100', 2230), manualWh(2.4, 1.35), null];
  screens.forEach((screen) => {
    assert.equal(lengthFor('c4-1', screen, { dualCentre: true }), 1222, 'a wider screen never substitutes a longer bar');
  });
});

test('TEST 8  Dual-centre cabinets default to Vertical and draw the rotated 1222 mm cabinet', () => {
  assert.equal(defaultCentreCabinetOrientation('c4-1', 'tv100'), 'vertical');
  assert.equal(CENTRE_CABINET_ROLES.left, 'FCL');
  assert.equal(CENTRE_CABINET_ROLES.right, 'FCR');

  const vertical = resolveCentreCabinetFootprintM('c4-1', 'vertical', 'tv100');
  assert.equal(vertical.cabinetLengthMm, 1222, 'the installed length travels with the footprint');
  assert.equal(vertical.widthM, 0.12);
  assert.equal(vertical.heightM, 1.222);
  assert.equal(vertical.depthM, 0.081);

  const horizontal = resolveCentreCabinetFootprintM('c4-1', 'horizontal', 'tv100');
  assert.equal(horizontal.cabinetLengthMm, 1222);
  assert.equal(horizontal.widthM, 1.222);
  assert.equal(horizontal.heightM, 0.12);
});

test('TEST 8b Other models are untouched by the variant rule', () => {
  // A discrete centre channel keeps its own catalogue width.
  assert.equal(getSpeakerModelMeta('c-1', 'tv100').widthM, 0.4);
  assert.equal(getSpeakerModelMeta('evolve-2-1').widthM, 0.2);
  assert.equal(getDualCentreCabinetLengthMm('c-1'), null);
  assert.equal(resolveSoundbarCabinetLengthMm({ modelKey: 'c-1', screen: tv('tv100', 2230) }), null);
  // The other TV-linked bars keep resolving from their preset key.
  assert.equal(resolveCentreCabinetFootprintM('multi-mono', 'horizontal', 'tv83').widthM, 1.872);
});

// ── 4. Engineering authority is untouched ─────────────────────────────────

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

  // The variant only ever changes the cabinet's LENGTH.
  const at1222 = getSpeakerModelMeta('c4-1', null, { cabinetLengthMm: 1222 });
  const at1441 = getSpeakerModelMeta('c4-1', null, { cabinetLengthMm: 1441 });
  const at2230 = getSpeakerModelMeta('c4-1', null, { cabinetLengthMm: 2230 });
  assert.equal(at1222.widthM, 1.222);
  assert.equal(at1441.widthM, 1.441);
  assert.equal(at2230.widthM, 2.23);
  [at1222, at1441, at2230].forEach((m) => {
    assert.equal(m.heightM, 0.12);
    assert.equal(m.depthM, 0.081);
    assert.equal(m.sensitivity_dB_1w1m, 98);
    assert.equal(m.max_power, 120);
  });
});

// ── 5. The approved 1222 mm artwork ───────────────────────────────────────

test('TEST 10 The 1222 mm artwork is cropped to its ink and keeps the cabinet proportions', () => {
  assert.ok(c41Artwork.includes('export function C41_1222FaceIcon'), 'the approved artwork has its own icon');
  assert.ok(c41Artwork.includes('https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/0103ea1cc_ChatGPTImage9Oct202610_47_24.png'));

  // Measured from the source file: 2172 × 724 px, ink at x 45–2127, y 257–464.
  // That ink box is the viewBox, so the white page around the drawing is gone.
  assert.ok(c41Artwork.includes('viewBox="45 257 2083 208"'), 'the surrounding whitespace is cropped');

  const inkAspect = 2083 / 208;
  const cabinetAspect = 1222 / 120;
  assert.ok(Math.abs(inkAspect - cabinetAspect) / cabinetAspect < 0.02,
    `the artwork is the 1222 × 120 mm cabinet itself (ink ${inkAspect.toFixed(3)} vs cabinet ${cabinetAspect.toFixed(3)})`);
});

test('TEST 11 The 1222 mm artwork is used for the 1222 mm variant only', () => {
  assert.ok(frontElevation.includes("const isC41_1222 = isC41 && Number(cabinetLengthMm) === 1222;"),
    'the new artwork is gated on the installed cabinet length');
  assert.ok(frontElevation.includes('if (isC41 && isC41_1222) return <C41_1222FaceIcon'),
    'the 1222 mm cabinet draws the approved artwork');
  assert.ok(frontElevation.includes('if (isC41) return <C41FaceIcon'),
    'the other C4-1 lengths keep their existing artwork');
});

// ── 6. One variant authority, both drawings ───────────────────────────────

test('TEST 12 Front Elevation and Plan View resolve the variant through one authority', () => {
  const authority = read('src/components/models/speakers/soundbarCabinetVariant.js');
  assert.ok(authority.includes('export function resolveSoundbarCabinetLengthMm'));

  // Nothing resolves a screen-wide soundbar width on its own any more.
  [frontElevation, planLayer, planIcons].forEach((source, i) => {
    assert.ok(source.includes('resolveSoundbarCabinetLengthMm'), `drawing site ${i} uses the variant authority`);
  });
  assert.ok(planLayer.includes('resolveCentreCabinetFootprintM(speaker.model, speaker.orientation, tvPresetKey || null, { cabinetLengthMm: speaker.cabinetLengthMm })'),
    'the plan draws the dual-centre cabinet at its installed variant');
  assert.ok(frontElevation.includes('cabinetLengthMm: footprint?.cabinetLengthMm ?? meta?.cabinetLengthMm ?? null'),
    'the front elevation knows which variant it installed');
});

test('TEST 13 A vertically mounted cabinet is rotated a quarter turn, not redrawn', () => {
  assert.ok(frontElevation.includes('rotate(90 ${cx} ${cy})'), 'the existing 90° cabinet rotation is used');
  assert.ok(frontElevation.includes('vertical: spk.vertical === true'), 'the cabinet carries its installed orientation');
  assert.ok(frontElevation.includes('iconBoxW = vertical ? sh : sw'), 'the rotated cabinet swaps its drawn axes');
});

// ── 7. Save and reopen ────────────────────────────────────────────────────

test('TEST 14 Model, orientation and variant are restored on reopen', () => {
  // What is stored on the design: the model and the installed orientation.
  const stored = [
    { role: 'FCL', model: 'c4-1', orientation: 'vertical' },
    { role: 'FCR', model: 'c4-1', orientation: 'vertical' },
  ];
  const reloaded = JSON.parse(JSON.stringify(stored));

  // The variant is a pure function of the stored model and the stored screen, so
  // reopening reproduces exactly the cabinet that was installed.
  reloaded.forEach((cabinet) => {
    const footprint = resolveCentreCabinetFootprintM(cabinet.model, cabinet.orientation, 'tv100');
    assert.equal(footprint.cabinetLengthMm, 1222);
    assert.equal(footprint.widthM, 0.12);
    assert.equal(footprint.heightM, 1.222);
    assert.equal(footprint.orientation, 'vertical');
  });

  // A single-centre installation re-resolves to the same variant too: both the
  // 1222 mm and the 1441 mm cabinet survive a save and reopen unchanged.
  const screen1222 = manualWh(1.222, 0.687);
  assert.equal(lengthFor('c4-1', screen1222), 1222);
  assert.equal(lengthFor('c4-1', screen1222), lengthFor('c4-1', JSON.parse(JSON.stringify(screen1222))));

  const screen1441 = manualWh(1.441, 0.8106);
  assert.equal(lengthFor('c4-1', screen1441), 1441);
  assert.equal(lengthFor('c4-1', screen1441), lengthFor('c4-1', JSON.parse(JSON.stringify(screen1441))));
  // An explicitly stored 1441 mm choice is restored verbatim.
  assert.equal(
    resolvePlacedCabinetLengthMm(JSON.parse(JSON.stringify({ model: 'c4-1', cabinetLengthMm: 1441 })), screen1441),
    1441,
  );
});

// ── 8. The approved 1441 mm artwork ───────────────────────────────────────

test('TEST 15 The 1222 mm artwork is unchanged by the 1441 mm addition', () => {
  assert.ok(c41Artwork.includes('export function C41_1222FaceIcon'), 'the 1222 mm icon is still published');
  assert.ok(c41Artwork.includes('https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/0103ea1cc_ChatGPTImage9Oct202610_47_24.png'),
    'the approved 1222 mm illustration is untouched');
  assert.ok(c41Artwork.includes('viewBox="45 257 2083 208"'), 'the 1222 mm crop is untouched');
  assert.ok(frontElevation.includes('if (isC41 && isC41_1222) return <C41_1222FaceIcon'),
    'the 1222 mm cabinet still draws its own artwork');
});

test('TEST 16 The 1441 mm artwork is cropped to its ink and keeps the cabinet proportions', () => {
  assert.ok(c41Artwork.includes('export function C41_1441FaceIcon'), 'the 1441 mm cabinet has its own icon');
  assert.ok(c41Artwork.includes('https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/40ad34db7_ChatGPTImage9Oct202610_49_42.png'),
    'the approved illustration is the one referenced');

  // Measured from the source file: 2167 × 726 px, ink at x 36–2130, y 275–444 —
  // the same measurement basis as the 1222 mm artwork. That ink box is the
  // viewBox, so the white page around the drawing is cropped away.
  assert.ok(c41Artwork.includes('viewBox="36 275 2095 170"'), 'the surrounding whitespace is cropped');

  const inkAspect = 2095 / 170;
  const cabinetAspect = 1441 / 120;
  assert.ok(Math.abs(inkAspect - cabinetAspect) / cabinetAspect < 0.03,
    `the artwork is the 1441 × 120 mm cabinet itself (ink ${inkAspect.toFixed(3)} vs cabinet ${cabinetAspect.toFixed(3)})`);
});

test('TEST 17 Each C4-1 artwork is drawn for its own variant only', () => {
  assert.ok(frontElevation.includes('const isC41_1441 = isC41 && Number(cabinetLengthMm) === 1441;'),
    'the 1441 mm artwork is gated on the installed cabinet length');
  assert.ok(frontElevation.includes('if (isC41 && isC41_1441) return <C41_1441FaceIcon'),
    'the 1441 mm cabinet draws the approved artwork');
  // The catalogue drawing remains the fallback for every other length.
  assert.ok(frontElevation.includes('if (isC41) return <C41FaceIcon'));
  // They are drawn through the one face-icon path, which the vertical orientation
  // rotates — so a vertically mounted cabinet is turned, not redrawn.
  assert.ok(frontElevation.includes('rotate(90 ${cx} ${cy})'));
  // One catalogue row, no duplicate product entry, and no variant artwork left
  // behind in the shared icon library.
  assert.equal(MODELS.filter((m) => m.key === 'c4-1').length, 1);
  assert.ok(!faceIcons.includes('C41_1441FaceIcon'), 'the icon library stays free of variant artwork');
});

test('TEST 18 Dual Mono Centre still defaults to the 1222 mm cabinet with 1441 mm available', () => {
  assert.equal(getDualCentreCabinetLengthMm('c4-1'), 1222);
  [tv('tv65', 1411), tv('tv83', 1872), tv('tv100', 2230), manualWh(1.441, 0.8106), manualWh(2.4, 1.35)].forEach((screen) => {
    assert.equal(lengthFor('c4-1', screen, { dualCentre: true }), 1222,
      'a 1441 mm screen never changes the dual-centre cabinet');
  });
  assert.equal(defaultCentreCabinetOrientation('c4-1', 'tv100'), 'vertical');
  assert.equal(CENTRE_CABINET_ROLES.left, 'FCL');
  assert.equal(CENTRE_CABINET_ROLES.right, 'FCR');
});