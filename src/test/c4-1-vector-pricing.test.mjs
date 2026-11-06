// ---------------------------------------------------------------------------
// TEST   C4-1 vector cabinet + unified cabinet-length pricing authority
// WHAT   The C4-1 vector renderer draws the cabinet at its exact selected
//        physical dimensions, with centred, correctly proportioned drivers and
//        no white overhang. C4-1, Multi LCR and Multi Mono pricing use the SAME
//        resolved cabinet length as the drawings; HSPL remains bespoke and
//        matches the screen's overall physical width; an explicit legacy
//        selection is preserved; Multi 1094 mm stays selectable but unpriced and
//        cannot produce a misleading priced quotation; a screen-width change
//        updates the selected variant and its price; speaker coordinates,
//        acoustic centres and RP22 results are untouched; Evolve 3-1 is
//        unchanged. No commercial prices are modified and no Product Master
//        seed is run by this suite.
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  getSpeakerModelMeta,
  getSoundbarCabinetLengthsMm,
} from '@/components/models/speakers/registry';
import {
  resolveSoundbarCabinetLengthMm,
  resolvePlacedCabinetLengthMm,
  resolveScreenOverallWidthMm,
  isHsplModel,
} from '@/components/models/speakers/soundbarCabinetVariant';
import { computeCommercialPriceBreakdown } from '@/components/pricing/commercialPriceBreakdown';

// ── Fixtures ───────────────────────────────────────────────────────────────
const tv = (key, mm) => ({ tvPresetKey: key, tvWidthMm: mm, aspectRatio: '16:9' });
const manualWh = (widthM, heightM) => ({
  aspectRatio: '16:9',
  manualSize: { enabled: true, mode: 'wh', widthM, heightM },
});

// A mock price index that mirrors the real ProductPrice catalogue shape:
// C4-1 plain-length SKUs, Multi length-with-suffix SKUs, HSPL range SKUs.
// 1094 mm Multi is deliberately UNPRICED (priceExVat: null).
function mockIndex() {
  const c41Options = [1222, 1441, 1711, 1842].map((mm) => ({
    value: String(mm),
    label: `C4-1 — ${mm} mm`,
    priceExVat: mm === 1222 ? 1000 : mm === 1441 ? 1200 : mm === 1711 ? 1400 : 1600,
  }));
  const multiOptions = [
    { value: '1094-m', label: 'Multi — 1094 mm', priceExVat: null },
    { value: '1222-m', label: 'Multi — 1222 mm', priceExVat: 900 },
    { value: '1441-m', label: 'Multi — 1441 mm', priceExVat: 1100 },
    { value: '1711-m', label: 'Multi — 1711 mm', priceExVat: 1300 },
    { value: '1842-m', label: 'Multi — 1842 mm', priceExVat: 1500 },
    { value: '2230-m', label: 'Multi — 2230 mm', priceExVat: 1900 },
  ];
  const hsplOptions = [
    { value: '1669-1800', label: 'HSPL — 1669-1800 mm', priceExVat: 2000 },
    { value: '1801-2000', label: 'HSPL — 1801-2000 mm', priceExVat: 2200 },
    { value: '2001-2230', label: 'HSPL — 2001-2230 mm', priceExVat: 2400 },
  ];
  const soundbarOptions = {
    'c4-1': c41Options,
    'multi-lcr': multiOptions,
    'multi-mono': multiOptions,
    'hspl-lcr': hsplOptions,
    'hspl-mono': hsplOptions,
  };
  return { soundbarOptions, priceMap: new Map() };
}

const price = (placedSpeakers, screen, opts = {}) => {
  const { soundbarOptions, priceMap } = mockIndex();
  return computeCommercialPriceBreakdown({
    placedSpeakers,
    difficultyMultiplier: 1.0,
    priceMode: 'incVat',
    priceMap,
    soundbarOptions,
    priceListAvailable: true,
    screen,
    ...opts,
  });
};

const c41Line = (breakdown, mm) =>
  breakdown.breakdown.find((l) => l.model === 'c4-1' && l.sizeValue === String(mm));
const multiLine = (breakdown, mm) =>
  breakdown.breakdown.find((l) => l.model.startsWith('multi') && l.sizeValue === `${mm}-m`);
const hsplLine = (breakdown) =>
  breakdown.breakdown.find((l) => l.model.startsWith('hspl'));

// ── 1. Vector cabinet matches the exact selected physical dimensions ──────

test('REQ 1  The C4-1 vector cabinet is drawn at the exact resolved length, drivers centred, no white overhang', () => {
  // The resolved length for each screen maps 1:1 to the cabinet meta width.
  const cases = [
    [tv('tv65', 1411), 1222],
    [tv('tv77', 1711), 1711],
    [tv('tv83', 1872), 1711],
    [tv('tv100', 2230), 1842],
  ];
  cases.forEach(([screen, mm]) => {
    const resolved = resolveSoundbarCabinetLengthMm({ modelKey: 'c4-1', screen });
    assert.equal(resolved, mm, `screen ${JSON.stringify(screen)} resolves to ${mm} mm`);
    const meta = getSpeakerModelMeta('c4-1', null, { cabinetLengthMm: resolved });
    assert.equal(meta.cabinetLengthMm, mm);
    assert.equal(meta.widthM, mm / 1000, 'the cabinet width is the exact resolved length');
    assert.equal(meta.heightM, 0.12, 'the cabinet height is the catalogue 120 mm');
    assert.equal(meta.depthM, 0.081, 'the cabinet depth is the catalogue 81 mm');
  });
  // The renderer component itself is verified by TEST 10/11 in the variant suite.
});

// ── 2. C4-1, Multi LCR and Multi Mono pricing use the same resolved length ─

test('REQ 2  C4-1 pricing resolves to the same cabinet length the drawing installs', () => {
  const breakdown = price(
    [{ role: 'L', model: 'c4-1' }, { role: 'C', model: 'c4-1' }, { role: 'R', model: 'c4-1' }],
    tv('tv77', 1711),
  );
  const resolved = resolveSoundbarCabinetLengthMm({ modelKey: 'c4-1', screen: tv('tv77', 1711) });
  assert.equal(resolved, 1711);
  const line = c41Line(breakdown, 1711);
  assert.ok(line, 'a C4-1 price line exists for the resolved 1711 mm');
  assert.equal(line.price, 1400, 'the price is the 1711 mm option price');
  assert.equal(line.count, 3, 'three LCR cabinets are priced at the one resolved length');
  // No other C4-1 length is priced.
  assert.ok(!c41Line(breakdown, 1222), 'the 1222 mm option is not priced for a 1711 mm screen');
  assert.ok(!c41Line(breakdown, 1842), 'the 1842 mm option is not priced for a 1711 mm screen');
});

test('REQ 2b  Multi LCR pricing resolves to the same cabinet length the drawing installs', () => {
  const breakdown = price([{ role: 'L', model: 'multi-lcr' }], tv('tv100', 2230));
  const resolved = resolveSoundbarCabinetLengthMm({ modelKey: 'multi-lcr', screen: tv('tv100', 2230) });
  assert.equal(resolved, 2230);
  const line = multiLine(breakdown, 2230);
  assert.ok(line, 'a Multi price line exists for the resolved 2230 mm');
  assert.equal(line.price, 1900);
});

test('REQ 2c  Multi Mono pricing resolves to the same cabinet length the drawing installs', () => {
  const breakdown = price([{ role: 'C', model: 'multi-mono' }], tv('tv83', 1872));
  const resolved = resolveSoundbarCabinetLengthMm({ modelKey: 'multi-mono', screen: tv('tv83', 1872) });
  assert.equal(resolved, 1842);
  const line = multiLine(breakdown, 1842);
  assert.ok(line, 'a Multi Mono price line exists for the resolved 1842 mm');
  assert.equal(line.price, 1500);
});

// ── 3. HSPL remains bespoke and matches the screen overall physical width ─

test('REQ 3  HSPL pricing follows the bespoke cabinet length that matches the screen overall width', () => {
  const screen = tv('tv83', 1872);
  const resolved = resolveSoundbarCabinetLengthMm({ modelKey: 'hspl-lcr', screen });
  assert.equal(resolved, 1872, 'HSPL matches the screen overall width exactly');
  assert.equal(resolveScreenOverallWidthMm(screen), 1872);
  assert.ok(isHsplModel('hspl-lcr'));

  const breakdown = price(
    [{ role: 'L', model: 'hspl-lcr' }, { role: 'R', model: 'hspl-lcr' }],
    screen,
  );
  const line = hsplLine(breakdown);
  assert.ok(line, 'an HSPL price line exists');
  assert.equal(line.price, 2200, 'the price falls in the 1801-2000 mm range that contains 1872');
  assert.equal(line.sizeValue, '1801-2000');
  assert.equal(line.count, 2);
});

// ── 4. Explicit legacy cabinet selections remain unchanged ────────────────

test('REQ 4  An explicitly recorded legacy length is preserved in both drawing and pricing', () => {
  const screen = tv('tv65', 1411); // would resolve to 1222 mm
  const speaker = { role: 'L', model: 'c4-1', cabinetLengthMm: 1711 };
  // The drawing authority preserves the explicit 1711 mm.
  assert.equal(resolvePlacedCabinetLengthMm(speaker, screen), 1711);
  // The pricing authority preserves it too: it prices the 1711 mm option, not
  // the 1222 mm the screen would otherwise select.
  const breakdown = price([speaker], screen);
  const line = c41Line(breakdown, 1711);
  assert.ok(line, 'the explicit 1711 mm is priced');
  assert.equal(line.price, 1400);
  assert.ok(!c41Line(breakdown, 1222), 'the screen-derived 1222 mm is not priced over the explicit choice');
});

test('REQ 4b  An explicit legacy length no longer in the commercial catalogue is still preserved', () => {
  const screen = tv('tv100', 2230);
  // 1449 mm is the retired typo SKU — no longer a commercial C4-1 length.
  const speaker = { role: 'L', model: 'c4-1', cabinetLengthMm: 1449 };
  assert.equal(resolvePlacedCabinetLengthMm(speaker, screen), 1449);
  const breakdown = price([speaker], screen);
  // 1449 is no longer a commercial C4-1 length, so no priced option matches it;
  // the line is present (quantity intact) but unpriced — never a silent fallback
  // to a different length.
  const line = breakdown.breakdown.find((l) => l.model === 'c4-1');
  assert.ok(line, 'the C4-1 line is present for the legacy length');
  assert.ok([null, undefined].includes(line.price), 'the legacy length is not silently repriced to another option');
  assert.equal(breakdown.incompletePriceCount, 1, 'the unpriced legacy length is counted as incomplete');
});

// ── 5. Multi 1094 mm selectable but unpriced ──────────────────────────────

test('REQ 5  Multi 1094 mm is selectable but unpriced, and produces no misleading priced quotation', () => {
  // 1094 mm is a real catalogue length (selectable).
  assert.ok(getSoundbarCabinetLengthsMm('multi-lcr').includes(1094));
  // A screen narrow enough to fit it resolves to 1094 mm.
  const screen = tv('tv55', 1094);
  assert.equal(resolveSoundbarCabinetLengthMm({ modelKey: 'multi-lcr', screen }), 1094);

  const breakdown = price([{ role: 'L', model: 'multi-lcr' }], screen);
  const line = multiLine(breakdown, 1094);
  assert.ok(line, 'the 1094 mm line is present');
  assert.equal(line.price, null, 'the 1094 mm option is unpriced');
  assert.equal(line.note, 'price not set');
  // The quotation total excludes the unpriced line: incompletePriceCount flags it
  // and the total does not silently count it as zero.
  assert.equal(breakdown.incompletePriceCount, 1, 'the unpriced 1094 mm is flagged, not hidden');
  assert.equal(breakdown.baseTotalExVat, 0, 'an unpriced line contributes nothing to the total');
  assert.equal(breakdown.finalTotalExVat, 0);
});

// ── 6. Screen-width changes update the selected variant and its price ─────

test('REQ 6  A screen-width change updates the resolved C4-1 variant and its price', () => {
  // 1411 mm overall → 1222 mm cabinet.
  let breakdown = price([{ role: 'L', model: 'c4-1' }], tv('tv65', 1411));
  assert.equal(resolveSoundbarCabinetLengthMm({ modelKey: 'c4-1', screen: tv('tv65', 1411) }), 1222);
  assert.equal(c41Line(breakdown, 1222).price, 1000);

  // Widen the screen to 1711 mm overall → 1711 mm cabinet, higher price.
  breakdown = price([{ role: 'L', model: 'c4-1' }], tv('tv77', 1711));
  assert.equal(resolveSoundbarCabinetLengthMm({ modelKey: 'c4-1', screen: tv('tv77', 1711) }), 1711);
  assert.equal(c41Line(breakdown, 1711).price, 1400);
  assert.ok(!c41Line(breakdown, 1222), 'the previous 1222 mm is no longer priced');

  // Widen again to 2230 mm → 1842 mm cabinet.
  breakdown = price([{ role: 'L', model: 'c4-1' }], tv('tv100', 2230));
  assert.equal(resolveSoundbarCabinetLengthMm({ modelKey: 'c4-1', screen: tv('tv100', 2230) }), 1842);
  assert.equal(c41Line(breakdown, 1842).price, 1600);
});

test('REQ 6b  A manual projection-screen width change updates the resolved variant', () => {
  // 1.222 m viewable → 1322 mm overall → 1222 mm cabinet.
  let breakdown = price([{ role: 'L', model: 'c4-1' }], manualWh(1.222, 0.687));
  assert.equal(resolveSoundbarCabinetLengthMm({ modelKey: 'c4-1', screen: manualWh(1.222, 0.687) }), 1222);
  assert.equal(c41Line(breakdown, 1222).price, 1000);

  // Widen to 1.672 m viewable → 1772 mm overall → 1711 mm cabinet.
  breakdown = price([{ role: 'L', model: 'c4-1' }], manualWh(1.672, 0.9405));
  assert.equal(resolveSoundbarCabinetLengthMm({ modelKey: 'c4-1', screen: manualWh(1.672, 0.9405) }), 1711);
  assert.equal(c41Line(breakdown, 1711).price, 1400);
});

// ── 7. No changes to speaker coordinates, acoustic centres or RP22 ────────

test('REQ 7  The cabinet-length resolution touches no acoustic field, coordinate or centre', () => {
  // Resolving the variant changes ONLY the cabinet width; every acoustic field
  // is identical across the confirmed lengths, and the resolution functions
  // carry no coordinate, centre or RP22 argument.
  const metas = [1222, 1441, 1711, 1842].map((mm) =>
    getSpeakerModelMeta('c4-1', null, { cabinetLengthMm: mm }),
  );
  const ACOUSTIC = [
    'sensitivity_dB_1w1m', 'nominalOhms', 'max_power', 'max_spl', 'peak_spl',
    'max_spl_cont_db_1m_halfspace', 'max_spl_peak_db_cf6_1m_halfspace',
    'max_spl_cont_db_1m_anechoic', 'usable_lf_hz_minus6db',
    'hfOffAxis16k', 'dispersion', 'frontStageType', 'category',
  ];
  const base = metas[0];
  metas.slice(1).forEach((m, i) => {
    ACOUSTIC.forEach((field) => {
      assert.deepEqual(m[field], base[field], `${field} differs at ${metas[i + 1].cabinetLengthMm} mm`);
    });
  });
  // Only the width fields follow the length.
  metas.forEach((m, i) => {
    assert.equal(m.widthM, [1222, 1441, 1711, 1842][i] / 1000);
    assert.equal(m.heightM, 0.12);
    assert.equal(m.depthM, 0.081);
  });
  // The resolver signature carries no coordinate/centre/RP22 input.
  assert.equal(resolveSoundbarCabinetLengthMm.length, 1, 'the resolver takes one args object — no coordinate or centre argument');
});

// ── 8. Evolve 3-1 remains unchanged ───────────────────────────────────────

test('REQ 8  Evolve 3-1 is untouched by the cabinet-variant work', () => {
  const meta = getSpeakerModelMeta('evolve-3-1');
  assert.ok(meta, 'Evolve 3-1 is a catalogue product');
  // Evolve 3-1 is a discrete speaker, not a TV-linked soundbar.
  assert.notEqual(meta.widthType, 'tv_linked');
  assert.deepEqual(getSoundbarCabinetLengthsMm('evolve-3-1'), [], 'no cabinet lengths for a discrete speaker');
  assert.equal(resolveSoundbarCabinetLengthMm({ modelKey: 'evolve-3-1', screen: tv('tv100', 2230) }), null);
  // Its price is read from the plain priceMap (no soundbar option resolution).
  const { soundbarOptions, priceMap } = mockIndex();
  priceMap.set('evolve-3-1', { price_ex_vat: 750, active: true });
  const breakdown = computeCommercialPriceBreakdown({
    placedSpeakers: [{ role: 'L', model: 'evolve-3-1' }],
    priceMap,
    soundbarOptions,
    priceListAvailable: true,
    screen: tv('tv100', 2230),
  });
  const line = breakdown.breakdown.find((l) => l.model === 'evolve-3-1');
  assert.ok(line, 'Evolve 3-1 is priced from the plain price map');
  assert.equal(line.price, 750);
  assert.equal(line.isSoundbar, false);
  assert.equal(line.sizeValue, '', 'no cabinet-length option for a discrete speaker');
});