// p6-canonical-authority.test.mjs
// ---------------------------------------------------------------------------
// P6 CANONICAL AUTHORITY — one P6 semantic in the app, and it is capability-free.
//
// P6 is the RSP-normalised relative level spread across the installed
// listener-level surround speakers (bed-layer sides including numbered pairs,
// the rear pair and the front wides):
//
//     normalisedLevelAtSeat_i = levelAtSeat_i - levelAtRSP_i
//     P6 spread               = max(normalised) - min(normalised)
//
// Because each speaker is normalised against ITSELF, that speaker's
// sensitivity, amplifier power and cabinet capability cancel exactly. P6 must
// therefore:
//   * be unaffected by an amplifier-power change with identical geometry,
//   * be unaffected by a speaker capability/model change with identical geometry,
//   * move when the geometry moves,
//   * be 0 dB / L4 at the RSP itself,
//   * hold the unchanged RP22 thresholds and whole-dB design value.
//
// These tests run the REAL SPL engine (centralSplEngine) and the REAL P6
// authority. Nothing here changes a threshold, a score, a report or any P13
// logic — and no report merge is involved.

import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeAllSeatSplMetrics, getSeatSplMetrics } from '../components/utils/spl/centralSplEngine.jsx';
import {
  computeP6Authority,
  levelLabelForP6Spread,
} from '../components/utils/rp22/canonicalP6Authority.js';

// ── Fixture: a 9.x listener-level layout in a 5.0 × 6.0 × 2.4 m room ──

const ROOM = { widthM: 5.0, lengthM: 6.0, heightM: 2.4 };
const RSP = { x: 2.5, y: 3.4, z: 1.2 };

const SURROUNDS = [
  { id: 'sl', role: 'SL', model: 'TEST-SURROUND', position: { x: 0.2, y: 2.6, z: 1.2 } },
  { id: 'sr', role: 'SR', model: 'TEST-SURROUND', position: { x: 4.8, y: 2.6, z: 1.2 } },
  { id: 'sbl', role: 'SBL', model: 'TEST-SURROUND', position: { x: 1.4, y: 5.8, z: 1.2 } },
  { id: 'sbr', role: 'SBR', model: 'TEST-SURROUND', position: { x: 3.6, y: 5.8, z: 1.2 } },
];

const SEATS = [
  { id: 'seat-1', x: 1.6, y: 2.2, z: 1.2, isPrimary: true },
  { id: 'seat-2', x: 3.4, y: 2.2, z: 1.2 },
  { id: 'seat-3', x: 2.5, y: 4.4, z: 1.2 },
];

// Capability variants for the SAME geometry. CAP_LIMITED reaches its physical
// max-SPL ceiling at the nearer listener positions; MODEL_MORE_SENSITIVE is a
// more sensitive cabinet with the same ceiling.
const CAP_ROOMY = {
  sensitivity_db_1w_1m: 91,
  max_spl_cont_db_1m: 112,
  power_handling_w: 400,
  recommended_amp_max_w: 400,
};
const CAP_LIMITED = { ...CAP_ROOMY, max_spl_cont_db_1m: 94 };
const MODEL_MORE_SENSITIVE = { ...CAP_ROOMY, sensitivity_db_1w_1m: 94 };

function splMaps({ speakers = SURROUNDS, powerW = 100, meta = CAP_ROOMY } = {}) {
  return computeAllSeatSplMetrics({
    seats: SEATS,
    placedSpeakers: speakers,
    getCanonicalRole: (role) => String(role || '').toUpperCase(),
    getEffectiveSplInputs: () => ({ powerW }),
    getModelDimsM: () => meta,
    mlpPoint: RSP,
    heightM: ROOM.heightM,
    widthM: ROOM.widthM,
    lengthM: ROOM.lengthM,
  });
}

/** The production call the engine and the seat HUD both make. */
function p6For(seatId, maps) {
  const seatSpl = getSeatSplMetrics(maps, seatId);
  const rspSpl = getSeatSplMetrics(maps, 'mlp');
  return computeP6Authority({
    seatListeners: seatSpl?.listenerLevelSurrounds || seatSpl?.surrounds || null,
    rspListeners: rspSpl?.listenerLevelSurrounds || rspSpl?.surrounds || null,
  });
}

const maxPairwise = (values) => {
  let max = 0;
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      max = Math.max(max, Math.abs(values[i] - values[j]));
    }
  }
  return max;
};

// ── The P6 formula itself ──

test('1. P6 is the RSP-normalised relative level spread, computed at full precision', () => {
  const maps = splMaps();
  const p6 = p6For('seat-1', maps);
  const seat = getSeatSplMetrics(maps, 'seat-1');
  const rsp = getSeatSplMetrics(maps, 'mlp');

  // Every installed listener-level surround is assessed (sides + rear pair).
  expect(p6.rolesUsed.sort()).toEqual(['SBL', 'SBR', 'SL', 'SR']);

  // Each speaker's level is normalised to ITS OWN level at the RSP.
  const expected = {};
  for (const [role, entry] of Object.entries(seat.listenerLevelSurrounds)) {
    expected[role] = entry.theoretical - rsp.listenerLevelSurrounds[role].theoretical;
  }
  for (const role of Object.keys(expected)) {
    expect(p6.normalizedByRole[role]).toBeCloseTo(expected[role], 10);
  }

  // The spread is the widest difference between those normalised levels, and the
  // graded design value is the unchanged whole-dB floor of it.
  const rawSpread = maxPairwise(Object.values(expected));
  expect(p6.maxDeltaRaw).toBeCloseTo(rawSpread, 10);
  expect(p6.valueDb).toBe(Math.floor(rawSpread));
  expect(p6.formatted).toBe(`${Math.floor(rawSpread)} dB`);
  expect(p6.uncapped).toBe(true);
});

test('2. P6 is unaffected by an amplifier-power change (identical geometry)', () => {
  const at100W = p6For('seat-1', splMaps({ powerW: 100 }));
  const at400W = p6For('seat-1', splMaps({ powerW: 400 }));

  // The per-speaker design level really did move (+6 dB across the board)…
  const seat100 = getSeatSplMetrics(splMaps({ powerW: 100 }), 'seat-1');
  const seat400 = getSeatSplMetrics(splMaps({ powerW: 400 }), 'seat-1');
  expect(seat400.listenerLevelSurrounds.SL.theoretical - seat100.listenerLevelSurrounds.SL.theoretical)
    .toBeCloseTo(10 * Math.log10(4), 6);

  // …and P6 did not: power cancels in the same-speaker RSP normalisation.
  expect(at400W.valueDb).toBe(at100W.valueDb);
  expect(at400W.maxDeltaRaw).toBeCloseTo(at100W.maxDeltaRaw, 10);
});

test('3. P6 is unaffected by a capability / model change (identical geometry)', () => {
  const roomy = p6For('seat-1', splMaps({ meta: CAP_ROOMY }));
  const limited = p6For('seat-1', splMaps({ meta: CAP_LIMITED }));
  const sensitive = p6For('seat-1', splMaps({ meta: MODEL_MORE_SENSITIVE }));

  // The capability limit really does bite: the CAPPED seat level of the same
  // speaker is materially lower under the limited cabinet.
  const roomyMaps = splMaps({ meta: CAP_ROOMY });
  const limitedMaps = splMaps({ meta: CAP_LIMITED });
  const cappedDropDb = getSeatSplMetrics(roomyMaps, 'seat-1').listenerLevelSurrounds.SL.value
    - getSeatSplMetrics(limitedMaps, 'seat-1').listenerLevelSurrounds.SL.value;
  expect(cappedDropDb).toBeGreaterThan(0.5);

  // The cap is applied at the 1 m stage, so it is position-independent for one
  // speaker and cancels in the same-speaker RSP normalisation: the capped spread
  // and the uncapped spread of one design are the same number. P6 reads the
  // uncapped level so that independence is a property of the code, not a
  // coincidence of where the cap is applied.
  const limitedSeat = getSeatSplMetrics(limitedMaps, 'seat-1');
  const limitedRsp = getSeatSplMetrics(limitedMaps, 'mlp');
  const cappedSpread = maxPairwise(Object.entries(limitedSeat.listenerLevelSurrounds).map(
    ([role, entry]) => entry.value - limitedRsp.listenerLevelSurrounds[role].value,
  ));
  const uncappedSpread = maxPairwise(Object.entries(limitedSeat.listenerLevelSurrounds).map(
    ([role, entry]) => entry.theoretical - limitedRsp.listenerLevelSurrounds[role].theoretical,
  ));
  expect(cappedSpread).toBeCloseTo(uncappedSpread, 10);

  // P6 is identical in all three cases, and identical to the capped spread too.
  expect(limited.valueDb).toBe(roomy.valueDb);
  expect(limited.maxDeltaRaw).toBeCloseTo(roomy.maxDeltaRaw, 10);
  expect(sensitive.valueDb).toBe(roomy.valueDb);
  expect(sensitive.maxDeltaRaw).toBeCloseTo(roomy.maxDeltaRaw, 10);
  expect(roomy.maxDeltaRaw).toBeCloseTo(cappedSpread, 10);
});

test('4. P6 responds to a geometry change', () => {
  const base = p6For('seat-1', splMaps());
  const moved = p6For('seat-1', splMaps({
    speakers: SURROUNDS.map((s) => (s.id === 'sl' ? { ...s, position: { ...s.position, x: 1.3 } } : s)),
  }));

  expect(Math.abs(moved.maxDeltaRaw - base.maxDeltaRaw)).toBeGreaterThan(0.05);
  expect(moved.normalizedByRole.SL).not.toBeCloseTo(base.normalizedByRole.SL, 6);
});

test('5. At the RSP, P6 = 0 dB and L4', () => {
  const maps = splMaps();
  const p6 = p6For('mlp', maps);

  expect(p6).not.toBeNull();
  expect(p6.valueDb).toBe(0);
  expect(p6.maxDeltaRaw).toBeLessThan(1e-9);
  expect(p6.level).toBe(4);
  expect(p6.levelLabel).toBe('L4');
  expect(p6.formatted).toBe('0 dB');
});

// ── Unchanged thresholds and the no-fabrication guard ──

test('6. RP22 P6 thresholds and the whole-dB design value are unchanged', () => {
  expect(levelLabelForP6Spread(0)).toBe('L4');
  expect(levelLabelForP6Spread(2)).toBe('L4');
  expect(levelLabelForP6Spread(3)).toBe('L3');
  expect(levelLabelForP6Spread(4)).toBe('L3');
  expect(levelLabelForP6Spread(5)).toBe('L2');
  expect(levelLabelForP6Spread(6)).toBe('L2');
  expect(levelLabelForP6Spread(9)).toBe('L1');
  expect(levelLabelForP6Spread(10)).toBe('L1');
  expect(levelLabelForP6Spread(11)).toBe('FAIL');
  // Grading receives the whole-dB DESIGN value: P6 floors the raw spread before
  // it is ever graded, so a fraction of a dB cannot cost a Performance Level.
  expect(levelLabelForP6Spread(10.4)).toBe('FAIL');
  expect(levelLabelForP6Spread(Math.floor(10.4))).toBe('L1');
});

test('7. A speaker with no uncapped level is excluded, never assessed on its capped level', () => {
  const seat = {
    SL: { value: 100, theoretical: 100 },
    SR: { value: 100, theoretical: 100 },
    SBL: { value: 88, theoretical: null }, // capped level only — must not contribute
  };
  const rsp = {
    SL: { value: 98, theoretical: 98 },
    SR: { value: 98, theoretical: 98 },
    SBL: { value: 90, theoretical: null },
  };

  const p6 = computeP6Authority({ seatListeners: seat, rspListeners: rsp });
  expect(p6.rolesUsed.sort()).toEqual(['SL', 'SR']);
  expect(p6.normalizedByRole.SBL).toBeUndefined();
});

// ── ONE authority: every surface reads the same P6 ──

const readSource = (relPath) => fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');

test('8. The analysis engine — the sole published P6 source — computes P6 in the one authority', () => {
  const engine = readSource('src/components/hooks/useRP22AnalysisEngine.jsx');
  expect(engine).toContain('computeP6Authority(');
  expect(engine).toContain('canonicalP6Authority');
  // The engine no longer resolves P6 roles or thresholds inline.
  expect(engine).not.toContain('resolveP6Listeners');
  expect(engine).not.toContain('level6 = ');
});

test('9. Both seat-HUD paths compute P6 in the one authority (no second semantic)', () => {
  const hudSnapshot = readSource('src/components/utils/buildSeatHudSnapshot.jsx');
  const hudMetrics = readSource('src/components/utils/computeSeatHudMetrics.jsx');

  for (const src of [hudSnapshot, hudMetrics]) {
    expect(src).toContain('computeP6Authority(');
    // No local P6 thresholds remain in the HUD.
    expect(src).not.toMatch(/p6ValueDb <= 2/);
    expect(src).not.toMatch(/p6FloorDb <= 2/);
  }
  // The HUD snapshot still prefers the engine's published P6 when it has one.
  expect(hudSnapshot).toContain('const engineP6 = engineSeatRp22?.[6];');
});

test('10. Compliance Panel, Visual Report and Technical Report consume the published P6, never compute it', () => {
  const compliance = readSource('src/components/rp22/RP22CompliancePanel.jsx');
  const visual = readSource('src/components/report/client/selectClientSeatCoverage.js');
  const technical = readSource('src/components/report/technical/useParameterGridAuthority.jsx');

  // Each reads the published per-seat authority.
  expect(compliance).toContain('seatHudById?.[seatId]?.rp22?.[paramKey]');
  expect(visual).toContain('rp22[6]');
  expect(technical).toContain('parameterSummaries.p6');

  // None of them computes P6 or reaches into the SPL engine for it.
  for (const src of [compliance, visual, technical]) {
    expect(src).not.toContain('canonicalP6Authority');
    expect(src).not.toContain('computeP6Authority');
    expect(src).not.toMatch(/metricP6_/);
    expect(src).not.toContain('centralSplEngine');
  }
});

test('11. P6 wording states the RSP-normalised level spread and separates it from capability (P12/P13)', () => {
  const definitions = readSource('src/components/data/rp22Definitions.jsx');
  const authority = readSource('src/components/utils/rp22/canonicalP6Authority.js');

  expect(definitions).toMatch(/relative to the reference seat \(RSP\)/);
  expect(definitions).toMatch(/P12 and P13 assess/);
  // P6 is not described as a capability or output claim.
  expect(definitions).not.toContain('uniform surround presentation');
  expect(authority).toMatch(/RSP-normalised relative\s+level spread/);
});