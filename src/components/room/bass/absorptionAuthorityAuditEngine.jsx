// absorptionAuthorityAuditEngine.jsx
// Pure computation for the Absorption Authority Audit.
// Read-only: tests whether B44's surface absorption has enough authority over the
// low-frequency pressure field (Q vs final SPL vs reflection/modal split), against
// baseline case A. No REW measured dataset is wired into this audit environment, so the
// REW-parity check uses the established physical expectation (see finalReport.expected)
// rather than a hardcoded REW curve. Does not alter production code or the live graph.

import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';

export function fmt(v, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function mag(re, im) { return Math.sqrt(re * re + im * im); }
function toDb(m) { return 20 * Math.log10(Math.max(m, 1e-10)); }

const ROOM_DIMS = { widthM: 5.0, lengthM: 4.5, heightM: 3.0 };
const SUB = { id: 'sub_centre_front', x: 2.5, y: 0.3, z: 0.35, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
const SEAT = { x: 2.5, y: 4.00, z: 1.2 };
const FREQS_HZ = [28, 29, 30, 31, 32, 33, 34, 35];
const SOURCE_CURVE = [{ hz: 20, db: 94 }, { hz: 50, db: 94 }, { hz: 100, db: 94 }, { hz: 200, db: 94 }];

const CASE_DEFS = [
  { key: 'A', label: 'A. All surfaces 0.30', absorption: { front: 0.30, back: 0.30, left: 0.30, right: 0.30, floor: 0.30, ceiling: 0.30 } },
  { key: 'B', label: 'B. Front wall 0.90, others 0.30', absorption: { front: 0.90, back: 0.30, left: 0.30, right: 0.30, floor: 0.30, ceiling: 0.30 } },
  { key: 'C', label: 'C. Back wall 0.90, others 0.30', absorption: { front: 0.30, back: 0.90, left: 0.30, right: 0.30, floor: 0.30, ceiling: 0.30 } },
  { key: 'D', label: 'D. Front + back 0.90, others 0.30', absorption: { front: 0.90, back: 0.90, left: 0.30, right: 0.30, floor: 0.30, ceiling: 0.30 } },
  { key: 'E', label: 'E. All surfaces 0.90', absorption: { front: 0.90, back: 0.90, left: 0.90, right: 0.90, floor: 0.90, ceiling: 0.90 } },
  { key: 'F', label: 'F. All surfaces 0.05', absorption: { front: 0.05, back: 0.05, left: 0.05, right: 0.05, floor: 0.05, ceiling: 0.05 } },
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

function dominantModeInfo(contributors) {
  if (!contributors || !contributors.length) return { label: 'n/a', qValue: null, key: null };
  const top = [...contributors].sort((a, b) => b.activeMagnitude - a.activeMagnitude)[0];
  return {
    label: `(${top.nx},${top.ny},${top.nz}) ${top.modeType ?? ''} @ ${fmt(top.modeFrequencyHz, 1)} Hz`,
    qValue: top.qValue,
    key: `${top.nx},${top.ny},${top.nz}`,
  };
}

function runAtFrequency(surfaceAbsorption, frequencyHz) {
  const options = baseOptions(frequencyHz, surfaceAbsorption);
  const out = simulateBassResponseRewCore(ROOM_DIMS, SEAT, SUB, SOURCE_CURVE, options);

  const vec = out.perFrequencyVectorDebug?.[0] || { directRe: 0, directIm: 0, reflectionRe: 0, reflectionIm: 0, modalSumRe: 0, modalSumIm: 0, finalRe: 0, finalIm: 0 };
  const cp = out.complexPressure?.[0] || { re: vec.finalRe, im: vec.finalIm };
  const contributors = out.activeModalContributorDebugSeries?.[0]?.contributors || [];
  const dominant = dominantModeInfo(contributors);

  return {
    frequencyHz,
    totalSplDb: toDb(mag(cp.re, cp.im)),
    directSplDb: toDb(mag(vec.directRe, vec.directIm)),
    reflectionSplDb: toDb(mag(vec.reflectionRe, vec.reflectionIm)),
    modalSplDb: toDb(mag(vec.modalSumRe, vec.modalSumIm)),
    finalRe: cp.re,
    finalIm: cp.im,
    finalPhaseDeg: (Math.atan2(cp.im, cp.re) * 180) / Math.PI,
    dominantMode: dominant.label,
    dominantModeQ: dominant.qValue,
    dominantModeKey: dominant.key,
  };
}

function nullDepthDb(rows) {
  const peak = Math.max(...rows.map((r) => r.totalSplDb));
  const nullRows = rows.filter((r) => r.frequencyHz >= 29 && r.frequencyHz <= 31);
  const nullMin = nullRows.length ? Math.min(...nullRows.map((r) => r.totalSplDb)) : peak;
  return peak - nullMin;
}

// Find the Q of the same mode (by nx,ny,nz key) as case A's dominant-at-30Hz mode, within
// this case's own 30Hz contributor list — so "Q of same mode in baseline A" is always a
// true apples-to-apples comparison even if a different mode becomes dominant in this case.
function qOfModeKeyAt30(surfaceAbsorption, modeKey) {
  if (!modeKey) return null;
  const options = baseOptions(30, surfaceAbsorption);
  const out = simulateBassResponseRewCore(ROOM_DIMS, SEAT, SUB, SOURCE_CURVE, options);
  const contributors = out.activeModalContributorDebugSeries?.[0]?.contributors || [];
  const match = contributors.find((c) => `${c.nx},${c.ny},${c.nz}` === modeKey);
  return match ? match.qValue : null;
}

export function runAbsorptionAuthorityAudit() {
  const results = {};
  CASE_DEFS.forEach((c) => {
    const rows = FREQS_HZ.map((f) => runAtFrequency(c.absorption, f));
    const at30 = rows.find((r) => r.frequencyHz === 30);
    const at34 = rows.find((r) => r.frequencyHz === 34);
    results[c.key] = {
      ...c,
      rows,
      spl30: at30.totalSplDb,
      spl34: at34.totalSplDb,
      nullDepthDb: nullDepthDb(rows),
      rise30to34: at34.totalSplDb - at30.totalSplDb,
      dominantAt30: at30.dominantMode,
      dominantAt30Q: at30.dominantModeQ,
      dominantAt30Key: at30.dominantModeKey,
      modalSplAt30: at30.modalSplDb,
      reflectionSplAt30: at30.reflectionSplDb,
      directSplAt30: at30.directSplDb,
      finalPhaseAt30: at30.finalPhaseDeg,
    };
  });

  // Baseline A's dominant mode key at 30Hz — used to fetch a true like-for-like Q comparison.
  const baselineModeKey = results.A.dominantAt30Key;
  Object.values(results).forEach((r) => {
    r.dominantAt30QInBaselineA = r.key === 'A' ? r.dominantAt30Q : qOfModeKeyAt30(CASE_DEFS.find((c) => c.key === 'A').absorption, baselineModeKey);
  });

  // Delta table vs baseline A
  const deltas = {};
  Object.values(results).forEach((r) => {
    if (r.key === 'A') return;
    deltas[r.key] = {
      key: r.key,
      label: r.label,
      d30: r.spl30 - results.A.spl30,
      d34: r.spl34 - results.A.spl34,
      dNullDepth: r.nullDepthDb - results.A.nullDepthDb,
      dDominantQ: (Number.isFinite(r.dominantAt30Q) && Number.isFinite(results.A.dominantAt30Q)) ? (r.dominantAt30Q - results.A.dominantAt30Q) : null,
      dModalSpl: r.modalSplAt30 - results.A.modalSplAt30,
      dReflectionSpl: r.reflectionSplAt30 - results.A.reflectionSplAt30,
    };
  });

  // Pass/fail logic.
  // 1) Modal absorption authority failure: Q changes materially (e.g. E vs A, F vs A) but
  //    final 30Hz SPL barely moves.
  const Q_CHANGE_THRESHOLD = 1.0;   // Q units
  const SPL_BARELY_MOVES_THRESHOLD_DB = 1.5;
  const REFLECTION_CHANGE_THRESHOLD_DB = 1.5;
  const MODAL_CHANGE_THRESHOLD_DB = 1.5;

  const authorityFailureCases = Object.values(deltas).filter((d) =>
    Number.isFinite(d.dDominantQ) && Math.abs(d.dDominantQ) > Q_CHANGE_THRESHOLD && Math.abs(d.d30) < SPL_BARELY_MOVES_THRESHOLD_DB
  );

  // 2) Absorption only affects reflections: reflection SPL changes materially but modal SPL
  //    barely changes, across the absorption-varying cases.
  const reflectionOnlyCases = Object.values(deltas).filter((d) =>
    Math.abs(d.dReflectionSpl) > REFLECTION_CHANGE_THRESHOLD_DB && Math.abs(d.dModalSpl) < MODAL_CHANGE_THRESHOLD_DB
  );

  const authorityFailure = authorityFailureCases.length > 0;
  const reflectionOnly = reflectionOnlyCases.length > 0;

  // 3) REW parity check — no measured REW dataset is wired into this audit environment.
  // Established physical expectation: REW shows the SAME family of movement as B44's own
  // absorption/Q/SPL relationship (this audit cannot independently confirm or deny REW
  // parity without a measured reference; it is reported as informational only, and never
  // drives the final verdict line on its own).
  const rewParityNote = 'No measured REW dataset is wired into this audit environment — REW-parity comparison is informational only in this run and does not by itself drive the verdict.';

  let verdict;
  if (authorityFailure) {
    verdict = 'ABSORPTION AUTHORITY FAILURE CONFIRMED';
  } else if (reflectionOnly) {
    verdict = 'ABSORPTION ONLY AFFECTS REFLECTION FIELD';
  } else if (Object.values(deltas).some((d) => Math.abs(d.d30) > SPL_BARELY_MOVES_THRESHOLD_DB || Math.abs(d.dNullDepth) > SPL_BARELY_MOVES_THRESHOLD_DB)) {
    verdict = 'ABSORPTION RESPONSE MATCHES EXPECTATION';
  } else {
    verdict = 'ABSORPTION HYPOTHESIS RETIRED';
  }

  const worstAuthority = authorityFailureCases.sort((a, b) => Math.abs(b.dDominantQ) - Math.abs(a.dDominantQ))[0];
  const worstReflectionOnly = reflectionOnlyCases.sort((a, b) => Math.abs(b.dReflectionSpl) - Math.abs(a.dReflectionSpl))[0];

  const finalReport = {
    test: 'Absorption Authority Audit \u2014 does B44\u2019s surface absorption have enough authority over the 28\u201335 Hz pressure field (Q, modal SPL, reflection SPL, and final SPL) at the 30 Hz null?',
    expected: 'Absorption changes should propagate to final SPL in proportion to their effect on modal Q and reflection level \u2014 a material Q change should produce a material final-SPL change, and absorption should affect both the modal and reflection fields, not only reflections. ' + rewParityNote,
    actual: authorityFailure
      ? `Case ${worstAuthority.key} (${worstAuthority.label}): dominant-mode Q changed by ${fmt(worstAuthority.dDominantQ, 2)} vs baseline A, but 30Hz SPL only moved ${fmt(worstAuthority.d30, 2)} dB.`
      : reflectionOnly
        ? `Case ${worstReflectionOnly.key} (${worstReflectionOnly.label}): reflection SPL changed ${fmt(worstReflectionOnly.dReflectionSpl, 2)} dB but modal SPL only changed ${fmt(worstReflectionOnly.dModalSpl, 2)} dB.`
        : 'Absorption changes produced proportionate movement in Q, modal SPL, reflection SPL and final SPL across all tested cases.',
    delta: Object.values(deltas).map((d) => `${d.key}: \u039430=${fmt(d.d30, 2)}dB \u039434=${fmt(d.d34, 2)}dB \u0394null=${fmt(d.dNullDepth, 2)}dB \u0394Q=${d.dDominantQ === null ? 'n/a' : fmt(d.dDominantQ, 2)} \u0394modal=${fmt(d.dModalSpl, 2)}dB \u0394refl=${fmt(d.dReflectionSpl, 2)}dB`).join(' | '),
    severity: authorityFailure
      ? 'HIGH \u2014 the modal layer does not respond to absorption changes with the authority its own Q values imply; final SPL is effectively decoupled from Q.'
      : reflectionOnly
        ? 'MEDIUM-HIGH \u2014 absorption is only reaching the reflection field; the modal pressure field is not responding to boundary damping.'
        : verdict === 'ABSORPTION RESPONSE MATCHES EXPECTATION'
          ? 'LOW \u2014 absorption authority over the pressure field is proportionate; no masking behaviour detected.'
          : 'LOW \u2014 no case showed a material response to absorption changes; hypothesis retired.',
    nextTest: authorityFailure
      ? 'Investigate the modal transfer/accumulation path (transfer function magnitude vs Q, storage factor) to find where Q\u2019s influence on final SPL is being suppressed.'
      : reflectionOnly
        ? 'Investigate why absorptionQ / modal coupling is not responding to surfaceAbsorption changes the way the reflection path does.'
        : 'Absorption authority looks proportionate in B44 \u2014 return to other root-cause hypotheses for the remaining 30 Hz null mismatch.',
    conclusionLine: verdict,
  };

  return { results, deltas, freqsHz: FREQS_HZ, verdict, finalReport };
}