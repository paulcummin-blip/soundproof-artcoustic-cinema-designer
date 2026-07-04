// modalQTransferAuthorityAuditEngine.jsx
// Pure computation for the Modal Q Transfer Authority Audit.
// Read-only: traces the dominant mode's Q value through the resonant transfer function,
// into its pre-accumulation modal amplitude, the post-accumulation modal sum, and the
// final total SPL — to find the first stage (if any) where a Q-driven gain change is
// suppressed. Recomputes the expected |H| independently from the same governing equation
// (resonantTransfer) as the production engine, so it can be compared stage-by-stage
// against the engine's own actual output. Does not alter production code or the live graph.

import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { resonantTransfer } from '@/bass/core/modalCalculations.js';

export function fmt(v, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function mag(re, im) { return Math.sqrt(re * re + im * im); }
function toDb(m) { return 20 * Math.log10(Math.max(m, 1e-10)); }

const ROOM_DIMS = { widthM: 5.0, lengthM: 4.5, heightM: 3.0 };
const SUB = { id: 'sub_centre_front', x: 2.5, y: 0.3, z: 0.35, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
const SEAT = { x: 2.5, y: 4.00, z: 1.2 };
const FREQS_HZ = [28, 29, 30, 31, 32, 33, 34, 35];
const EVAL_HZ = 30;
const SOURCE_CURVE = [{ hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 }];

const CASE_DEFS = [
  { key: 'A', label: 'A. All surfaces 0.30', absorption: { front: 0.30, back: 0.30, left: 0.30, right: 0.30, floor: 0.30, ceiling: 0.30 } },
  { key: 'B', label: 'B. Front wall 0.90', absorption: { front: 0.90, back: 0.30, left: 0.30, right: 0.30, floor: 0.30, ceiling: 0.30 } },
  { key: 'C', label: 'C. All surfaces 0.90', absorption: { front: 0.90, back: 0.90, left: 0.90, right: 0.90, floor: 0.90, ceiling: 0.90 } },
  { key: 'D', label: 'D. All surfaces 0.05', absorption: { front: 0.05, back: 0.05, left: 0.05, right: 0.05, floor: 0.05, ceiling: 0.05 } },
];

function baseOptions(frequencyHz, surfaceAbsorption) {
  return {
    enableReflections: true,
    enableModes: true,
    surfaceAbsorption,
    freqMinHz: frequencyHz,
    freqMaxHz: frequencyHz + 0.01,
    modeGenerationFMaxHz: 200,
    smoothing: 'none',
    axialQ: 4.0,
    pureDeterministicModalSum: true,
    disableModalPropagationPhase: true,
    disableLateField: true,
    debugReflectionOrder: 1,
    qStrategy: 'production',
  };
}

function findDominant(contributors) {
  if (!contributors || !contributors.length) return null;
  return [...contributors].sort((a, b) => b.activeMagnitude - a.activeMagnitude)[0];
}

function runCase(c) {
  // Sweep 28–35 Hz to identify the dominant mode by strongest per-mode contribution.
  let overallDominant = null;
  FREQS_HZ.forEach((f) => {
    const out = simulateBassResponseRewCore(ROOM_DIMS, SEAT, SUB, SOURCE_CURVE, baseOptions(f, c.absorption));
    const contributors = out.activeModalContributorDebugSeries?.[0]?.contributors || [];
    const top = findDominant(contributors);
    if (top && (!overallDominant || top.activeMagnitude > overallDominant.activeMagnitude)) {
      overallDominant = top;
    }
  });

  // Evaluate the full chain at the fixed evaluation frequency for a stable, comparable snapshot.
  const evalOut = simulateBassResponseRewCore(ROOM_DIMS, SEAT, SUB, SOURCE_CURVE, baseOptions(EVAL_HZ, c.absorption));
  const evalContributors = evalOut.activeModalContributorDebugSeries?.[0]?.contributors || [];
  // Match the same mode (by nx,ny,nz) found dominant across the sweep, so the case is
  // always tracing the same physical mode even if evaluated at a different bin.
  const dominant = overallDominant
    ? (evalContributors.find((r) => r.nx === overallDominant.nx && r.ny === overallDominant.ny && r.nz === overallDominant.nz) || overallDominant)
    : null;

  const vec = evalOut.perFrequencyVectorDebug?.[0] || { modalSumRe: 0, modalSumIm: 0, finalRe: 0, finalIm: 0 };
  const cp = evalOut.complexPressure?.[0] || { re: vec.finalRe, im: vec.finalIm };

  // Independent recomputation of the resonant transfer using the same governing equation
  // (resonantTransfer), fed the engine's own natural frequency and Q for this mode/case.
  const recomputed = dominant ? resonantTransfer(EVAL_HZ, dominant.modeFrequencyHz, dominant.qValue) : null;

  return {
    ...c,
    dominantLabel: dominant ? `(${dominant.nx},${dominant.ny},${dominant.nz}) ${dominant.modeType ?? ''}` : 'n/a',
    naturalFrequencyHz: dominant ? dominant.modeFrequencyHz : null,
    qValue: dominant ? dominant.qValue : null,
    transferRe: dominant ? dominant.transferReal : null,
    transferIm: dominant ? dominant.transferImag : null,
    transferMagActual: dominant ? dominant.activeTransferMagnitudeAtNull : null,
    transferMagRecomputed: recomputed ? recomputed.transferMag : null,
    preAccumulationModalAmplitude: dominant ? dominant.activeMagnitude : null,
    postAccumulationModalAmplitude: mag(vec.modalSumRe, vec.modalSumIm),
    finalModalSplDb: toDb(mag(vec.modalSumRe, vec.modalSumIm)),
    finalTotalSplDb: toDb(mag(cp.re, cp.im)),
  };
}

export function runModalQTransferAuthorityAudit() {
  const results = {};
  CASE_DEFS.forEach((c) => { results[c.key] = runCase(c); });

  const baseline = results.A;

  const comparisonRows = Object.values(results).map((r) => {
    const expectedH = baseline.qValue && r.qValue && baseline.naturalFrequencyHz
      ? resonantTransfer(EVAL_HZ, baseline.naturalFrequencyHz, r.qValue).transferMag
      : null; // expected |H| at this case's Q, using baseline's natural frequency (unchanged by absorption)
    const expectedDeltaH = expectedH !== null && baseline.transferMagActual !== null ? expectedH - baseline.transferMagActual : null;
    const actualDeltaH = r.transferMagActual !== null && baseline.transferMagActual !== null ? r.transferMagActual - baseline.transferMagActual : null;
    const expectedModalSplDb = expectedH !== null ? toDb(expectedH) - toDb(baseline.transferMagActual) + baseline.finalModalSplDb : null;
    const transferEfficiency = expectedH !== null && expectedH > 0 ? r.transferMagActual / expectedH : null;
    const lossPct = transferEfficiency !== null ? (1 - transferEfficiency) * 100 : null;

    return {
      key: r.key,
      label: r.label,
      qValue: r.qValue,
      expectedH,
      actualH: r.transferMagActual,
      expectedDeltaH,
      actualDeltaH,
      expectedModalSplDb,
      actualModalSplDb: r.finalModalSplDb,
      transferEfficiency,
      lossPct,
    };
  });

  // Pass/fail chain: for each non-baseline case, walk Q -> |H| -> pre-accum amplitude -> final SPL.
  const Q_CHANGE_PCT_THRESHOLD = 30;
  const H_CHANGE_PCT_THRESHOLD = 10;
  const AMPLITUDE_CHANGE_PCT_THRESHOLD = 10;
  const SPL_BARELY_MOVES_DB = 1.0;

  let firstFailure = null;
  Object.values(results).forEach((r) => {
    if (r.key === 'A' || firstFailure) return;
    const qChangePct = baseline.qValue ? Math.abs((r.qValue - baseline.qValue) / baseline.qValue) * 100 : 0;
    const hChangePct = baseline.transferMagActual ? Math.abs((r.transferMagActual - baseline.transferMagActual) / baseline.transferMagActual) * 100 : 0;
    const ampChangePct = baseline.preAccumulationModalAmplitude ? Math.abs((r.preAccumulationModalAmplitude - baseline.preAccumulationModalAmplitude) / baseline.preAccumulationModalAmplitude) * 100 : 0;
    const splChangeDb = Math.abs(r.finalTotalSplDb - baseline.finalTotalSplDb);

    if (qChangePct > Q_CHANGE_PCT_THRESHOLD && hChangePct < H_CHANGE_PCT_THRESHOLD) {
      firstFailure = { verdict: 'TRANSFER FUNCTION NOT HONOURING Q', caseKey: r.key, qChangePct, hChangePct, ampChangePct, splChangeDb };
    } else if (hChangePct >= H_CHANGE_PCT_THRESHOLD && ampChangePct < AMPLITUDE_CHANGE_PCT_THRESHOLD) {
      firstFailure = { verdict: 'POST-TRANSFER AMPLITUDE SUPPRESSION', caseKey: r.key, qChangePct, hChangePct, ampChangePct, splChangeDb };
    } else if (ampChangePct >= AMPLITUDE_CHANGE_PCT_THRESHOLD && splChangeDb < SPL_BARELY_MOVES_DB) {
      firstFailure = { verdict: 'ACCUMULATION STAGE SUPPRESSION', caseKey: r.key, qChangePct, hChangePct, ampChangePct, splChangeDb };
    }
  });

  const verdict = firstFailure ? firstFailure.verdict : 'Q TRANSFER VERIFIED';

  const finalReport = {
    test: 'Modal Q Transfer Authority Audit \u2014 does a Q change at the dominant mode produce the mathematically expected change in |H|, and does that change survive into modal amplitude, accumulation, and final SPL?',
    expected: 'A Q change of >30% should produce a corresponding |H| change of \u226510%; a |H| change of \u226510% should produce a corresponding pre-accumulation modal amplitude change of \u226510%; and an amplitude change of \u226510% should produce a final total SPL change of \u22651.0 dB. No stage should silently absorb the gain change implied by the previous stage.',
    actual: firstFailure
      ? `Case ${firstFailure.caseKey}: Q changed ${fmt(firstFailure.qChangePct, 1)}%, |H| changed ${fmt(firstFailure.hChangePct, 1)}%, pre-accumulation amplitude changed ${fmt(firstFailure.ampChangePct, 1)}%, final total SPL changed ${fmt(firstFailure.splChangeDb, 2)} dB \u2014 divergence found at the stage identified below.`
      : 'Q, |H|, pre-accumulation modal amplitude, post-accumulation modal amplitude, and final SPL all moved in proportion across every tested case.',
    delta: comparisonRows.map((r) => `${r.key}: Q=${fmt(r.qValue, 2)} expH=${fmt(r.expectedH, 4)} actH=${fmt(r.actualH, 4)} \u0394expH=${r.expectedDeltaH === null ? 'n/a' : fmt(r.expectedDeltaH, 4)} \u0394actH=${r.actualDeltaH === null ? 'n/a' : fmt(r.actualDeltaH, 4)} loss=${r.lossPct === null ? 'n/a' : fmt(r.lossPct, 1)}%`).join(' | '),
    severity: verdict === 'TRANSFER FUNCTION NOT HONOURING Q'
      ? 'HIGH \u2014 the resonant transfer function itself is not responding to Q as its own governing equation dictates.'
      : verdict === 'POST-TRANSFER AMPLITUDE SUPPRESSION'
        ? 'HIGH \u2014 |H| responds correctly to Q, but a downstream multiplier (storage factor, phase rotation, family/order scale) is suppressing the gain before it reaches the modal amplitude.'
        : verdict === 'ACCUMULATION STAGE SUPPRESSION'
          ? 'MEDIUM-HIGH \u2014 the dominant mode\u2019s amplitude changes correctly, but the change is being cancelled or diluted during modal accumulation or final summation with the direct/reflection field.'
          : 'LOW \u2014 Q\u2019s influence is preserved end-to-end from the resonant transfer function through to final SPL.',
    nextTest: verdict === 'TRANSFER FUNCTION NOT HONOURING Q'
      ? 'Inspect resonantTransfer() and the Q value actually passed into it per mode \u2014 confirm the Q used at solve-time matches the Q reported here.'
      : verdict === 'POST-TRANSFER AMPLITUDE SUPPRESSION'
        ? 'Inspect modalPressureContributionLocal()\u2019s storageFactor, highOrderAxialScale/family-scale multipliers, and phase rotation for this mode/case to find which multiplier is absorbing the |H| gain.'
        : verdict === 'ACCUMULATION STAGE SUPPRESSION'
          ? 'Inspect how modalSumRe/modalSumIm combine across all active modes, and how the modal sum combines with the direct/reflection field, for phase cancellation that could be diluting this mode\u2019s amplitude gain.'
          : 'Q transfer authority is verified end-to-end \u2014 return to other root-cause hypotheses for the remaining 30 Hz null mismatch.',
    conclusionLine: verdict,
  };

  return { results, comparisonRows, freqsHz: FREQS_HZ, evalHz: EVAL_HZ, verdict, finalReport };
}