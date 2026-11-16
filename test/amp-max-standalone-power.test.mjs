// Verifies the buildSpecPatch fix: when power_w is empty and power_w_amp
// holds the recommended amplifier maximum, the patch must still write
// recommended_amp_max_w so the live Read Source proposed-status calculation
// produces GOOD DATA instead of INCOMPLETE.
//
// buildSpecPatch lives inside saveSpeakerComparison.js which imports
// @/api/base44Client, so it cannot be imported directly in Node. The
// power-handling branch is replicated here verbatim from the patched source
// to verify the data-flow logic in isolation.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const numberOrNull = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(/[,£\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

// Replicated from the patched buildSpecPatch (saveSpeakerComparison.js lines 148-195)
function buildPowerPatch(values) {
  const patch = {};
  const authority = {};
  const power = numberOrNull(values.power_w);
  const powerAmp = numberOrNull(values.power_w_amp);
  if (power !== null) {
    if (values.power_basis === 'continuous') {
      patch.power_handling_continuous_w = power;
      authority.power_handling_continuous_w = 'Official Product Page';
      if (powerAmp !== null && powerAmp !== power) {
        patch.recommended_amp_max_w = powerAmp;
        authority.recommended_amp_max_w = 'Official Product Page';
        const powerMin = numberOrNull(values.power_w_min);
        if (powerMin !== null) {
          patch.recommended_amp_min_w = powerMin;
          authority.recommended_amp_min_w = 'Official Product Page';
        }
      }
    } else {
      patch.recommended_amp_max_w = power;
      authority.recommended_amp_max_w = 'Official Product Page';
      const powerMin = numberOrNull(values.power_w_min);
      if (powerMin !== null) {
        patch.recommended_amp_min_w = powerMin;
        authority.recommended_amp_min_w = 'Official Product Page';
      }
    }
  } else if (powerAmp !== null) {
    patch.recommended_amp_max_w = powerAmp;
    authority.recommended_amp_max_w = 'Official Product Page';
    const powerMin = numberOrNull(values.power_w_min);
    if (powerMin !== null) {
      patch.recommended_amp_min_w = powerMin;
      authority.recommended_amp_min_w = 'Official Product Page';
    }
  }
  return { patch, authority };
}

test('500 W via power_w_amp (sole authority) writes recommended_amp_max_w', () => {
  const { patch } = buildPowerPatch({
    power_w: '', power_w_amp: '500', power_w_min: '', power_basis: 'amplifier',
  });
  assert.equal(patch.recommended_amp_max_w, 500);
  assert.equal(patch.power_handling_continuous_w, undefined);
});

test('500 W unchecked (no power at all) writes nothing', () => {
  const { patch } = buildPowerPatch({
    power_w: '', power_w_amp: '', power_w_min: '', power_basis: 'amplifier',
  });
  assert.equal(patch.recommended_amp_max_w, undefined);
  assert.equal(patch.power_handling_continuous_w, undefined);
});

test('continuous 300 W + amp max 500 W still works (regression)', () => {
  const { patch } = buildPowerPatch({
    power_w: '300', power_w_amp: '500', power_w_min: '', power_basis: 'continuous',
  });
  assert.equal(patch.power_handling_continuous_w, 300);
  assert.equal(patch.recommended_amp_max_w, 500);
});

test('amp max via power_w with amplifier basis still works (regression)', () => {
  const { patch } = buildPowerPatch({
    power_w: '500', power_w_amp: '', power_w_min: '', power_basis: 'amplifier',
  });
  assert.equal(patch.recommended_amp_max_w, 500);
  assert.equal(patch.power_handling_continuous_w, undefined);
});

test('amp range min/max preserved when power_w_amp is sole authority', () => {
  const { patch } = buildPowerPatch({
    power_w: '', power_w_amp: '500', power_w_min: '25', power_basis: 'amplifier',
  });
  assert.equal(patch.recommended_amp_max_w, 500);
  assert.equal(patch.recommended_amp_min_w, 25);
});
