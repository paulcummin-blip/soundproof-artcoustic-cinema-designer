/**
 * Q4-3 Engineering Authority Normalisation — Validation
 *
 * Validates that q4-3 and q4-3_s resolve to identical physical authority
 * after the sensitivity/impedance correction, and that the downstream
 * SPL calculations behave as specified.
 *
 * No commercial Product Master records are created, merged, or edited.
 */

import { describe, it, expect } from 'vitest';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { resolveUsefulLcrPowerW } from '@/components/recommendations/usefulLcrPower';
import { POWER_OPTIONS } from '@/components/utils/spl/engine';

// Physics helpers (mirror centralSplEngine.getSPL1mCapability)
const spl1mCapped = (sens1w, powerW, capDb) =>
  Math.min(sens1w + 10 * Math.log10(powerW), capDb);

describe('Q4-3 Engineering Authority Normalisation', () => {
  const lcr = getSpeakerModelMeta('q4-3');
  const sur = getSpeakerModelMeta('q4-3_s');

  // ── 1. Voltage-to-watt conversion math ──────────────────────────────
  it('98 + 10·log10(2.83²/4) = 101.015 dB, stored as 101', () => {
    const computed = 98 + 10 * Math.log10((2.83 * 2.83) / 4);
    expect(computed).toBeCloseTo(101.015, 1);
    expect(lcr.sensitivity_dB_2p83).toBe(101);
    expect(sur.sensitivity_dB_2p83).toBe(101);
  });

  // ── 2. q4-3 and q4-3_s resolve to identical sensitivity and impedance ─
  it('q4-3 and q4-3_s have identical sensitivity and impedance', () => {
    expect(lcr.sensitivity_dB_1w1m).toBe(sur.sensitivity_dB_1w1m);
    expect(lcr.sensitivity_dB_2p83).toBe(sur.sensitivity_dB_2p83);
    expect(lcr.nominalOhms).toBe(sur.nominalOhms);
    expect(lcr.sensitivity_dB_1w1m).toBe(98);
    expect(lcr.sensitivity_dB_2p83).toBe(101);
    expect(lcr.nominalOhms).toBe(4);
    expect(sur.nominalOhms).toBe(4);
  });

  // ── 3. q4-3 and q4-3_s resolve to identical SPL, LF, and coverage ─────
  it('q4-3_s inherits identical continuous/peak, LF, and coverage authority', () => {
    expect(sur.max_spl_cont_db_1m_halfspace).toBe(lcr.max_spl_cont_db_1m_halfspace);
    expect(sur.max_spl_peak_db_cf6_1m_halfspace).toBe(lcr.max_spl_peak_db_cf6_1m_halfspace);
    expect(sur.max_spl_cont_db_1m_anechoic).toBe(lcr.max_spl_cont_db_1m_anechoic);
    expect(sur.max_spl_peak_db_cf6_1m_anechoic).toBe(lcr.max_spl_peak_db_cf6_1m_anechoic);
    expect(sur.frequency_response_low).toBe(lcr.frequency_response_low);
    expect(sur.usable_lf_hz_minus6db).toBe(lcr.usable_lf_hz_minus6db);
    expect(sur.coverage_deg).toEqual(lcr.coverage_deg);
    expect(lcr.max_spl_cont_db_1m_halfspace).toBe(114);
    expect(lcr.max_spl_peak_db_cf6_1m_halfspace).toBe(120);
    expect(lcr.frequency_response_low).toBe(100);
    expect(lcr.usable_lf_hz_minus6db).toBe(97);
    expect(lcr.coverage_deg).toEqual({ horizontal: 90, vertical: 45 });
  });

  // ── 4. Frequency-dependent dispersion preserved separately ──────────
  it('frequency-dependent dispersion data is not overwritten by nominal coverage', () => {
    expect(lcr.dispersion).toEqual({
      horizontal: { minus1p5dB: 38, minus3dB: 54, minus5dB: 72 },
    });
    expect(lcr.hfOffAxis16k).toEqual({ minus3deg: 35, minus5deg: 45 });
    // coverage_deg is a separate nominal field
    expect(lcr.coverage_deg).toEqual({ horizontal: 90, vertical: 45 });
  });

  // ── 5. P12/P13 useful power continues using the 1 W field ────────────
  it('resolveUsefulLcrPowerW uses sensitivity_dB_1w1m (the 1 W field)', () => {
    const useful = resolveUsefulLcrPowerW(lcr);
    // powerToReachCap = 10^((114-98)/10) = 39.8 W → snap to 50 W
    expect(useful).toBe(50);
  });

  // ── 6. At 100 W, Q4-3 remains capped at 114 dB at 1 m ────────────────
  it('at 100 W, Q4-3 is capped at 114 dB at 1 m', () => {
    const spl = spl1mCapped(lcr.sensitivity_dB_1w1m, 100, lcr.max_spl_cont_db_1m_halfspace);
    expect(spl).toBe(114);
  });

  // ── 7. At 50 W, Q4-3 changes from ~112.99 dB to 114 dB ───────────────
  it('at 50 W, Q4-3 changes from approximately 112.99 dB to 114 dB', () => {
    const oldSens = 96; // pre-normalisation
    const newSens = lcr.sensitivity_dB_1w1m; // 98
    const cap = lcr.max_spl_cont_db_1m_halfspace; // 114

    const oldSpl = spl1mCapped(oldSens, 50, cap);
    const newSpl = spl1mCapped(newSens, 50, cap);

    expect(oldSpl).toBeCloseTo(112.99, 1); // 96 + 16.99 = 112.99 (uncapped)
    expect(newSpl).toBe(114);              // 98 + 16.99 = 114.99 → capped at 114
  });

  // ── 8. Useful amplifier recommendation changes from 75 W to 50 W ────
  it('useful amplifier recommendation changes from 75 W to 50 W', () => {
    // Pre-normalisation: sens 96, cap 114 → powerToReachCap = 10^1.8 = 63.1 W → snap 75 W
    const oldPowerToCap = Math.pow(10, (114 - 96) / 10);
    const oldCeiling = Math.min(120, oldPowerToCap);
    const oldSnap = POWER_OPTIONS.slice().sort((a, b) => a - b).find((o) => o >= oldCeiling);
    expect(oldSnap).toBe(75);

    // Post-normalisation: sens 98, cap 114 → powerToReachCap = 10^1.6 = 39.8 W → snap 50 W
    const newUseful = resolveUsefulLcrPowerW(lcr);
    expect(newUseful).toBe(50);
  });

  // ── 9. No commercial Product Master record is created or edited ─────
  it('registry max_power and price are unchanged', () => {
    expect(lcr.max_power).toBe(120);
    expect(lcr.price_gbp_exVat).toBe(1820);
    expect(sur.max_power).toBe(120);
    expect(sur.price_gbp_exVat).toBe(1820);
  });
});