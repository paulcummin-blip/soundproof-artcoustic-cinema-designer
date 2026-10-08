// p6-role-coverage.test.mjs
// Deterministic tests for P6 listener-level speaker-role coverage.
//
// P6 mathematics, thresholds and RSP normalisation are unchanged — these tests
// cover role SELECTION only:
//   1. base SL/SR only
//   2. SL/SR plus SL2/SR2
//   3. SL/SR plus multiple additional pairs
//   4. rear surround aliases LR/RR and LRS/RRS resolve to SBL/SBR
//   5. front-wide aliases FWL/FWR resolve to LW/RW
//   6. duplicate aliases for ONE physical speaker count once
//   7. missing / non-finite speaker is excluded
//   8. SL1/SR1 are the base pair, not a second speaker
//
// Run: node --import ./test/_alias-register.mjs test/p6-role-coverage.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalListenerLevelRole,
  isListenerLevelSurroundRole,
  resolveP6Listeners,
} from '@/components/utils/rp22/listenerLevelSurroundRoles';

const spl = (value) => ({ value });

// Build a seat/RSP pair from a { role: seatSpl } map, with the RSP at a fixed
// offset so the normalised value is deterministic and easy to assert.
function pair(seatRoles, rspOffset = 0) {
  const seat = {};
  const rsp = {};
  for (const [role, value] of Object.entries(seatRoles)) {
    seat[role] = spl(value);
    rsp[role] = spl(value - rspOffset);
  }
  return { seat, rsp };
}

test('1. base SL/SR only', () => {
  const { seat, rsp } = pair({ SL: 100, SR: 101 });
  const res = resolveP6Listeners({ seatListeners: seat, rspListeners: rsp });
  assert.deepEqual(res.rolesUsed.sort(), ['SL', 'SR']);
});

test('2. SL/SR plus SL2/SR2 — additional pairs are included and stay separate', () => {
  const { seat, rsp } = pair({ SL: 100, SR: 100, SL2: 98, SR2: 98 });
  const res = resolveP6Listeners({ seatListeners: seat, rspListeners: rsp });
  assert.deepEqual(res.rolesUsed.sort(), ['SL', 'SL2', 'SR', 'SR2']);
});

test('3. SL/SR plus multiple additional pairs', () => {
  const { seat, rsp } = pair({ SL: 100, SR: 100, SL2: 99, SR2: 99, SL3: 97, SR3: 97 });
  const res = resolveP6Listeners({ seatListeners: seat, rspListeners: rsp });
  assert.deepEqual(res.rolesUsed.sort(), ['SL', 'SL2', 'SL3', 'SR', 'SR2', 'SR3']);
});

test('4. rear aliases LR/RR and LRS/RRS resolve to SBL/SBR', () => {
  assert.equal(canonicalListenerLevelRole('LR'), 'SBL');
  assert.equal(canonicalListenerLevelRole('RR'), 'SBR');
  assert.equal(canonicalListenerLevelRole('LRS'), 'SBL');
  assert.equal(canonicalListenerLevelRole('RRS'), 'SBR');

  const { seat, rsp } = pair({ SL: 100, SR: 100, LR: 95, RR: 95 });
  const res = resolveP6Listeners({ seatListeners: seat, rspListeners: rsp });
  assert.deepEqual(res.rolesUsed.sort(), ['SBL', 'SL', 'SBR', 'SR']);
});

test('5. front-wide aliases FWL/FWR resolve to LW/RW', () => {
  assert.equal(canonicalListenerLevelRole('FWL'), 'LW');
  assert.equal(canonicalListenerLevelRole('FWR'), 'RW');

  const { seat, rsp } = pair({ SL: 100, SR: 100, FWL: 96, FWR: 96 });
  const res = resolveP6Listeners({ seatListeners: seat, rspListeners: rsp });
  assert.deepEqual(res.rolesUsed.sort(), ['LW', 'RW', 'SL', 'SR']);
});

test('6. duplicate aliases for ONE physical speaker count once', () => {
  // SBL and LR are two labels for the same rear-left position.
  const seat = { SBL: spl(95), LR: spl(95), SL: spl(100), SR: spl(100) };
  const rsp = { SBL: spl(90), LR: spl(90), SL: spl(95), SR: spl(95) };
  const res = resolveP6Listeners({ seatListeners: seat, rspListeners: rsp });
  assert.deepEqual(res.rolesUsed.sort(), ['SBL', 'SL', 'SR']);
  assert.equal(res.normalizedByRole.SBL, 5);
});

test('7. missing / non-finite speaker is excluded', () => {
  const seat = { SL: spl(100), SR: spl(100), SL2: spl(NaN) };
  const rsp = { SL: spl(95), SR: spl(95), SL2: spl(95) };
  const res = resolveP6Listeners({ seatListeners: seat, rspListeners: rsp });
  assert.deepEqual(res.rolesUsed.sort(), ['SL', 'SR']);

  // RSP value missing -> excluded too (same-speaker normalisation needs both).
  const res2 = resolveP6Listeners({
    seatListeners: { SL: spl(100), SR: spl(100), SL2: spl(95) },
    rspListeners: { SL: spl(95), SR: spl(95) },
  });
  assert.deepEqual(res2.rolesUsed.sort(), ['SL', 'SR']);
});

test('8. SL1/SR1 are the base pair, not a second speaker', () => {
  assert.equal(canonicalListenerLevelRole('SL1'), 'SL');
  assert.equal(canonicalListenerLevelRole('SR1'), 'SR');

  const seat = { SL: spl(100), SR: spl(100), SL1: spl(100), SR1: spl(100) };
  const rsp = { SL: spl(95), SR: spl(95), SL1: spl(95), SR1: spl(95) };
  const res = resolveP6Listeners({ seatListeners: seat, rspListeners: rsp });
  assert.deepEqual(res.rolesUsed.sort(), ['SL', 'SR']);
});

test('9. eligibility: non-surround roles are never eligible', () => {
  for (const role of ['FL', 'FC', 'FR', 'TFL', 'TML', 'TRR', 'LFE', 'SUB1', '']) {
    assert.equal(isListenerLevelSurroundRole(role), false, `${role} must not be P6-eligible`);
  }
  for (const role of ['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW', 'SL2', 'SR3', 'LS', 'RS', 'LR', 'RRS', 'FWL', 'FWR']) {
    assert.equal(isListenerLevelSurroundRole(role), true, `${role} must be P6-eligible`);
  }
});

test('10. P6 thresholds are unchanged by role selection', () => {
  // 1 dB favourable design floor + RP22 thresholds: <=2 L4, <=4 L3, <=6 L2, <=10 L1.
  const grade = (db) => (db <= 2 ? 4 : db <= 4 ? 3 : db <= 6 ? 2 : db <= 10 ? 1 : 0);
  const { seat, rsp } = pair({ SL: 100, SR: 100, SL2: 92, SR2: 92 }, 0);
  const res = resolveP6Listeners({ seatListeners: seat, rspListeners: rsp });
  const values = Object.values(res.normalizedByRole);
  let maxDelta = 0;
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      maxDelta = Math.max(maxDelta, Math.abs(values[i] - values[j]));
    }
  }
  assert.equal(maxDelta, 8);
  assert.equal(grade(Math.floor(maxDelta)), 1);
});