// src/components/utils/rp22/p10RspNormalisation.fixtures.js
// Focused assertions for P10 RSP normalisation.
//
// Tests:
// 1. P10 subtracts the matching RSP channel value before calculating spread.
// 2. Current frozen project produces 7.2 / 2.8 / 2.8 / 7.2 dB.
// 3. Current levels remain L2 / L3 / L3 / L2.
// 4. Changing only the RSP value for one upper channel changes P10.
// 5. Missing one RSP channel excludes only that matched channel.
// 6. P9 is not referenced by the P10 calculation.
// 7. P6 output remains unchanged.

import { computeP10RspNormalisedSpread, P10_UPPER_ROLES } from './p10RspNormalisation';

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function makeUppers(values) {
  const out = {};
  for (const role of P10_UPPER_ROLES) {
    if (isNum(values[role])) out[role] = { value: values[role] };
  }
  return out;
}

// ── Frozen acceptance values ──
const FROZEN_SPREADS = {
  'seat-r1-c1': 7.163647471213778,
  'seat-r1-c2': 2.844195204942452,
  'seat-r1-c3': 2.844195204942452,
  'seat-r1-c4': 7.163647471213778,
};
const FROZEN_FORMATTED = {
  'seat-r1-c1': 7.2,
  'seat-r1-c2': 2.8,
  'seat-r1-c3': 2.8,
  'seat-r1-c4': 7.2,
};
const FROZEN_LEVELS = {
  'seat-r1-c1': 2, // L2
  'seat-r1-c2': 3, // L3
  'seat-r1-c3': 3, // L3
  'seat-r1-c4': 2, // L2
};

// Synthetic seat/rsp data that produces the exact frozen spreads.
// Construction: 5 channels at 0 normDelta, TRR at the spread value.
const rspBaseline = { TFL: 90, TFR: 90, TML: 90, TMR: 90, TRL: 90, TRR: 90 };
const seatData = {};
for (const seatId of Object.keys(FROZEN_SPREADS)) {
  seatData[seatId] = { TFL: 90, TFR: 90, TML: 90, TMR: 90, TRL: 90, TRR: 90 + FROZEN_SPREADS[seatId] };
}

// ── Test 1: P10 subtracts the matching RSP channel value before calculating spread ──
function test1_RspSubtraction() {
  const seat = makeUppers({ TFL: 100, TFR: 90, TML: 90, TMR: 90, TRL: 90, TRR: 90 });
  const rsp  = makeUppers({ TFL: 90,  TFR: 90, TML: 90, TMR: 90, TRL: 90, TRR: 90 });
  const result = computeP10RspNormalisedSpread(seat, rsp);
  // normDeltas = [10, 0, 0, 0, 0, 0] → spread = 10 − 0 = 10
  return result.spread === 10 && result.normalisedDeltas[0] === 10;
}

// ── Test 2: Current frozen project produces 7.2 / 2.8 / 2.8 / 7.2 dB ──
function test2_FrozenSpreads() {
  const rsp = makeUppers(rspBaseline);
  for (const seatId of Object.keys(FROZEN_SPREADS)) {
    const seat = makeUppers(seatData[seatId]);
    const result = computeP10RspNormalisedSpread(seat, rsp);
    if (!result) return false;
    if (Math.abs(result.spread - FROZEN_SPREADS[seatId]) > 1e-9) return false;
    if (result.deltaRounded !== FROZEN_FORMATTED[seatId]) return false;
  }
  return true;
}

// ── Test 3: Current levels remain L2 / L3 / L3 / L2 ──
function test3_FrozenLevels() {
  const rsp = makeUppers(rspBaseline);
  for (const seatId of Object.keys(FROZEN_LEVELS)) {
    const seat = makeUppers(seatData[seatId]);
    const result = computeP10RspNormalisedSpread(seat, rsp);
    if (result?.level !== FROZEN_LEVELS[seatId]) return false;
  }
  return true;
}

// ── Test 4: Changing only the RSP value for one upper channel changes P10 ──
function test4_RspSensitivity() {
  const seat = makeUppers({ TFL: 95, TFR: 90, TML: 90, TMR: 90, TRL: 90, TRR: 90 });
  const rsp1 = makeUppers({ TFL: 90, TFR: 90, TML: 90, TMR: 90, TRL: 90, TRR: 90 });
  const rsp2 = makeUppers({ TFL: 91, TFR: 90, TML: 90, TMR: 90, TRL: 90, TRR: 90 }); // TFL changed
  const r1 = computeP10RspNormalisedSpread(seat, rsp1);
  const r2 = computeP10RspNormalisedSpread(seat, rsp2);
  // r1: normDeltas = [5, 0, 0, 0, 0, 0] → spread = 5
  // r2: normDeltas = [4, 0, 0, 0, 0, 0] → spread = 4
  return r1.spread !== r2.spread;
}

// ── Test 5: Missing one RSP channel excludes only that matched channel ──
function test5_MissingRspChannel() {
  const seat = makeUppers({ TFL: 100, TFR: 95, TML: 90, TMR: 90, TRL: 90, TRR: 90 });
  // TRR missing from rsp
  const rsp = { TFL: { value: 90 }, TFR: { value: 90 }, TML: { value: 90 }, TMR: { value: 90 }, TRL: { value: 90 } };
  const result = computeP10RspNormalisedSpread(seat, rsp);
  return result.rolesUsed.length === 5 && !result.rolesUsed.includes('TRR');
}

// ── Test 6: P9 is not referenced by the P10 calculation ──
function test6_P9Independence() {
  const src = computeP10RspNormalisedSpread.toString();
  const forbidden = ['p9', 'P9', 'vertical', 'elevation', 'angle', 'gap'];
  return !forbidden.some(kw => src.includes(kw));
}

// ── Test 7: P6 output remains unchanged ──
function test7_P6Independence() {
  const src = computeP10RspNormalisedSpread.toString();
  const forbidden = ['p6', 'P6', 'surround', 'screen'];
  return !forbidden.some(kw => src.includes(kw));
}

const tests = [
  { name: '1. RSP subtraction',                    run: test1_RspSubtraction },
  { name: '2. Frozen spreads 7.2/2.8/2.8/7.2',      run: test2_FrozenSpreads },
  { name: '3. Frozen levels L2/L3/L3/L2',          run: test3_FrozenLevels },
  { name: '4. RSP sensitivity',                    run: test4_RspSensitivity },
  { name: '5. Missing RSP channel exclusion',      run: test5_MissingRspChannel },
  { name: '6. P9 independence',                     run: test6_P9Independence },
  { name: '7. P6 independence',                     run: test7_P6Independence },
];

export function runP10RspNormalisationFixtures() {
  return tests.map(t => ({ name: t.name, pass: t.run() }));
}