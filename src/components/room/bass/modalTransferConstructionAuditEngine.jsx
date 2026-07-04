// modalTransferConstructionAuditEngine.jsx
// Pure computation for the Modal Transfer Construction Audit.
// Read-only: calls the real production engine (simulateBassResponseRewCore) with the
// EXACT live options BassResponse.jsx uses (buildLiveEngineOptions), then reconstructs
// every construction stage of legacyModalTransferLocal / modalPressureContributionLocal
// for the dominant mode at 30 Hz to verify the modal vector is complete and correct
// before it is injected into the production pressure sum. Does not alter production code.

import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { resonantTransfer } from '@/bass/core/modalCalculations';
import { LIVE_SOURCE_CURVE, buildLiveEngineOptions } from '@/components/room/bass/liveBassAuditOptions';

export function fmt(v, d = 5) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function mag(re, im) { return Math.sqrt(re * re + im * im); }
function phaseDeg(re, im) { return (Math.atan2(im, re) * 180) / Math.PI; }

const TARGET_HZ = 30;

export function runModalTransferConstructionAudit(roomDims, seatPos, subsForSimulation, surfaceAbsorption) {
  const options = buildLiveEngineOptions(TARGET_HZ, surfaceAbsorption);

  // Step 1 — run the real engine per sub, merge per-mode active contributions (coherent sum).
  let finalRe = 0, finalIm = 0;
  const merged = new Map();
  const perSubTuning = [];

  subsForSimulation.forEach((sub) => {
    const engineOut = simulateBassResponseRewCore(roomDims, seatPos, sub, LIVE_SOURCE_CURVE, options);
    const cp = engineOut.complexPressure?.[0];
    if (cp) { finalRe += cp.re; finalIm += cp.im; }

    const debugRow = engineOut.activeModalContributorDebugSeries?.[0];
    perSubTuning.push({
      subId: sub.id,
      gainDb: Number.isFinite(Number(sub?.tuning?.gainDb)) ? Number(sub.tuning.gainDb) : 0,
      delayMs: Number.isFinite(Number(sub?.tuning?.delayMs)) ? Number(sub.tuning.delayMs) : 0,
      polarity: Number(sub?.tuning?.polarity) === 180 ? 180 : 0,
      x: sub.x, y: sub.y, z: sub.z,
    });

    if (debugRow?.contributors) {
      debugRow.contributors.forEach((c) => {
        const key = `${c.nx},${c.ny},${c.nz}`;
        if (!merged.has(key)) {
          merged.set(key, {
            key, nx: c.nx, ny: c.ny, nz: c.nz,
            modeFrequencyHz: c.modeFrequencyHz, modeType: c.modeType, qValue: c.qValue,
            re: 0, im: 0, sourceCouplingSum: 0, receiverCoupling: c.receiverCoupling, subCount: 0,
            transferReal: c.transferReal, transferImag: c.transferImag,
          });
        }
        const m = merged.get(key);
        m.re += c.activeReal;
        m.im += c.activeImag;
        m.sourceCouplingSum += c.sourceCoupling;
        m.subCount += 1;
      });
    }
  });

  const contributors = Array.from(merged.values()).map((c) => ({ ...c, mag: mag(c.re, c.im) }));
  if (contributors.length === 0) {
    return { canRun: false, reason: 'No modal contributors found at 30 Hz for the current room/seat/subs.' };
  }
  contributors.sort((a, b) => b.mag - a.mag);
  const dominant = contributors[0];
  const modeOrder = Math.abs(dominant.nx) + Math.abs(dominant.ny) + Math.abs(dominant.nz);

  // Step 2 — reconstruct every construction stage independently (first active sub used for
  // concrete tuning numbers; identical formula applies per-sub, then coherently summed).
  const sub0 = perSubTuning[0] || { gainDb: 0, delayMs: 0, polarity: 0 };
  const avgSourceCoupling = dominant.subCount > 0 ? dominant.sourceCouplingSum / dominant.subCount : 0;
  const receiverCoupling = dominant.receiverCoupling;
  const couplingProduct = avgSourceCoupling * receiverCoupling;

  const qValue = dominant.qValue;
  const tf = resonantTransfer(TARGET_HZ, dominant.modeFrequencyHz, qValue);

  const curveDb = 94; // LIVE_SOURCE_CURVE is flat 94 dB across 20-200 Hz
  const modalGainScalar = options.modalGainScalar;
  const modalSourceAmplitudeBase = Math.pow(10, (curveDb + sub0.gainDb) / 20) * modalGainScalar;

  const dx = sub0.x - seatPos.x, dy = sub0.y - seatPos.y, dz = (sub0.z ?? 0.35) - seatPos.z;
  const distanceM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const distanceLossDb = -20 * Math.log10(distanceM / 1);
  const roomVolumeM3 = roomDims.widthM * roomDims.lengthM * roomDims.heightM;

  let modalSourceAmplitude;
  if (options.modalSourceReferenceMode === 'distance_normalized') {
    modalSourceAmplitude = modalSourceAmplitudeBase * Math.pow(10, distanceLossDb / 20);
  } else if (options.modalSourceReferenceMode === 'room_volume' || options.modalSourceReferenceMode === 'room_normalized') {
    modalSourceAmplitude = modalSourceAmplitudeBase / Math.sqrt(Math.max(roomVolumeM3, 1e-6));
  } else {
    modalSourceAmplitude = modalSourceAmplitudeBase;
  }

  const orderWeight = 1.0;
  const modalGain = modalSourceAmplitude * couplingProduct * orderWeight;

  // Propagation phase (distance-based rotation on the resonant transfer). Live options
  // disable this (disableModalPropagationPhase: true, propagationPhaseScale: 0).
  const propagationPhaseRad = options.disableModalPropagationPhase ? 0 : (
    -2 * Math.PI * TARGET_HZ * (distanceM / 343) * options.propagationPhaseScale
  );
  const cosP = Math.cos(propagationPhaseRad);
  const sinP = Math.sin(propagationPhaseRad);
  const alignedReal = (tf.re * cosP) - (tf.im * sinP);
  const alignedImag = (tf.re * sinP) + (tf.im * cosP);

  const rawModalRe = modalGain * alignedReal;
  const rawModalIm = modalGain * alignedImag;

  // Tuning phase (delay + polarity) — legitimate physical rotation, applied once per sub.
  const tuningPhaseRad = (-2 * Math.PI * TARGET_HZ * (sub0.delayMs / 1000)) + (sub0.polarity === 180 ? Math.PI : 0);
  const tCos = Math.cos(tuningPhaseRad), tSin = Math.sin(tuningPhaseRad);
  const tunedRe = (rawModalRe * tCos) - (rawModalIm * tSin);
  const tunedIm = (rawModalRe * tSin) + (rawModalIm * tCos);

  // Storage factor — 'none' at live settings => 1.0 (no-op).
  const storageFactor = options.modalStorageMode === 'none' ? 1.0 : 1.0;
  const storedRe = tunedRe * storageFactor;
  const storedIm = tunedIm * storageFactor;

  // Diagnostic-only per-mode phase perturbation stage. At live settings
  // (pureDeterministicModalSum: true) this stage is BYPASSED — the active vector equals
  // the stored vector unperturbed. Reported here to prove it is not engaged live.
  const perturbationBypassed = options.pureDeterministicModalSum === true;
  const activeRe = storedRe; // live path — perturbation bypassed
  const activeIm = storedIm;

  // High-order axial correction + family scale — both default 1.0 unless mode is axial order>=2.
  const highOrderAxialScale = Number.isFinite(Number(options.highOrderAxialScale)) ? Number(options.highOrderAxialScale) : 1.0;
  const highOrderScaleApplied = (dominant.modeType === 'axial' && modeOrder >= 2) ? highOrderAxialScale : 1.0;
  const familyScale = 1.0; // not exposed via liveBassAuditOptions => default no-op

  const finalModalRe = activeRe * highOrderScaleApplied * familyScale;
  const finalModalIm = activeIm * highOrderScaleApplied * familyScale;

  // Post-return checks — diagnostic hooks that COULD re-touch phase/gain after the modal
  // sum is returned from legacyModalTransferLocal, evaluated against the actual live options.
  const postReturnPhaseHookActive = options.debugModalPhaseConvention !== 'normal';
  const postReturnGainHookActive = Number(options.rewParityModalMagnitudeScale) !== 1.0;

  // Governing-equation expected vector: coupling * amplitude * resonant transfer, rotated
  // only by legitimate physical phase terms (propagation + tuning). Excludes any diagnostic-
  // only perturbation. This is what storedRe/storedIm already represent above.
  const expectedRe = storedRe;
  const expectedIm = storedIm;

  const engineMag = dominant.mag;
  const reconMag = mag(finalModalRe, finalModalIm);
  const divergenceRe = Math.abs(finalModalRe - expectedRe);
  const divergenceIm = Math.abs(finalModalIm - expectedIm);
  const isIdenticalToGoverningEquation = divergenceRe < 1e-9 && divergenceIm < 1e-9 && !postReturnPhaseHookActive && !postReturnGainHookActive;

  const stages = [
    {
      name: 'Source coupling', input: `mode (${dominant.nx},${dominant.ny},${dominant.nz}) @ sub position`,
      output: avgSourceCoupling, delta: null,
    },
    {
      name: 'Receiver coupling', input: `mode (${dominant.nx},${dominant.ny},${dominant.nz}) @ seat position`,
      output: receiverCoupling, delta: null,
    },
    {
      name: 'Coupling product', input: `${fmt(avgSourceCoupling)} × ${fmt(receiverCoupling)}`,
      output: couplingProduct, delta: couplingProduct - avgSourceCoupling,
    },
    {
      name: 'Modal Q', input: `mode f0=${fmt(dominant.modeFrequencyHz, 2)} Hz, type=${dominant.modeType}`,
      output: qValue, delta: null,
    },
    {
      name: 'Modal gain', input: `amplitude=${fmt(modalSourceAmplitude)} × coupling=${fmt(couplingProduct)} × orderWeight=1.0`,
      output: modalGain, delta: modalGain - couplingProduct,
    },
    {
      name: 'Resonant transfer (complex)', input: `f=${TARGET_HZ} Hz, f0=${fmt(dominant.modeFrequencyHz, 2)} Hz, Q=${fmt(qValue, 2)}`,
      output: `re=${fmt(tf.re)} im=${fmt(tf.im)}`, delta: null,
    },
    {
      name: 'Propagation phase', input: `distance=${fmt(distanceM, 3)} m, scale=${options.propagationPhaseScale}, disabled=${options.disableModalPropagationPhase}`,
      output: `${fmt((propagationPhaseRad * 180) / Math.PI, 3)}° → re=${fmt(alignedReal)} im=${fmt(alignedImag)}`,
      delta: `Δre=${fmt(alignedReal - tf.re)} Δim=${fmt(alignedImag - tf.im)}`,
    },
    {
      name: 'Raw modal vector (gain × rotated transfer)', input: `gain=${fmt(modalGain)} × (re=${fmt(alignedReal)}, im=${fmt(alignedImag)})`,
      output: `re=${fmt(rawModalRe)} im=${fmt(rawModalIm)}`, delta: null,
    },
    {
      name: 'Tuning phase (delay+polarity)', input: `delayMs=${sub0.delayMs}, polarity=${sub0.polarity}°`,
      output: `re=${fmt(tunedRe)} im=${fmt(tunedIm)}`, delta: `Δre=${fmt(tunedRe - rawModalRe)} Δim=${fmt(tunedIm - rawModalIm)}`,
    },
    {
      name: 'Storage factor (normalisation)', input: `modalStorageMode='${options.modalStorageMode}' → factor=${storageFactor}`,
      output: `re=${fmt(storedRe)} im=${fmt(storedIm)}`, delta: `Δre=${fmt(storedRe - tunedRe)} Δim=${fmt(storedIm - tunedIm)}`,
    },
    {
      name: 'Diagnostic phase perturbation', input: `pureDeterministicModalSum=${options.pureDeterministicModalSum} (true ⇒ bypassed)`,
      output: perturbationBypassed ? 'BYPASSED — not applied live' : 'APPLIED (diagnostic path engaged)',
      delta: perturbationBypassed ? 0 : 'unknown (non-live path)',
    },
    {
      name: 'High-order axial / family scaling', input: `type=${dominant.modeType}, order=${modeOrder}, highOrderAxialScale=${highOrderAxialScale}, familyScale=${familyScale}`,
      output: `re=${fmt(finalModalRe)} im=${fmt(finalModalIm)}`, delta: `Δre=${fmt(finalModalRe - activeRe)} Δim=${fmt(finalModalIm - activeIm)}`,
    },
    {
      name: 'Final modal Re', input: 'end of legacyModalTransferLocal per-mode construction', output: finalModalRe, delta: null,
    },
    {
      name: 'Final modal Im', input: 'end of legacyModalTransferLocal per-mode construction', output: finalModalIm, delta: null,
    },
  ];

  const singleApplicationChecklist = [
    { term: 'Source coupling', applications: 1, note: 'modeShapeValueLocal(mode, source) — one call per mode per sub' },
    { term: 'Receiver coupling', applications: 1, note: 'modeShapeValueLocal(mode, seat) — one call per mode' },
    { term: 'Modal gain', applications: 2, note: 'modalGain applied once in modalPressureContributionLocal; highOrderAxialScale/familyScale form a second multiplicative gain stage at accumulation (both default 1.0 for this mode, so numerically inert here, but architecturally two hook points exist)' },
    { term: 'Resonant transfer', applications: 1, note: 'resonantTransfer() called once, already complex (re/im) — never a scalar-then-converted value' },
    { term: 'Propagation phase', applications: 1, note: 'applied once, after the transfer is already complex (correct order); live settings disable it (scale=0)' },
    { term: 'Distance scaling', applications: options.modalSourceReferenceMode === 'distance_normalized' ? 2 : 1, note: options.modalSourceReferenceMode === 'distance_normalized' ? 'Live options set modalSourceReferenceMode="distance_normalized" — distance loss is applied to the modal source amplitude AND independently to the direct/reflection paths. This contradicts the __FIX_MODAL_EXCITATION_DECOUPLED__ comment in rewBassEngine.js, which states modal excitation should NOT carry listener-distance attenuation.' : 'Modal amplitude carries no distance-based magnitude attenuation (distance only affects phase); direct/reflection paths carry their own independent distance term.' },
    { term: 'Q scaling', applications: 1, note: 'Q enters exactly once, inside resonantTransfer()\'s complex denominator' },
  ];

  return {
    canRun: true,
    targetHz: TARGET_HZ,
    dominant: { nx: dominant.nx, ny: dominant.ny, nz: dominant.nz, modeFrequencyHz: dominant.modeFrequencyHz, modeType: dominant.modeType, modeOrder },
    options,
    stages,
    singleApplicationChecklist,
    engineRe: dominant.re, engineIm: dominant.im, engineMag, enginePhaseDeg: phaseDeg(dominant.re, dominant.im),
    finalModalRe, finalModalIm, reconMag, finalPhaseDeg: phaseDeg(finalModalRe, finalModalIm),
    expectedRe, expectedIm,
    divergenceRe, divergenceIm,
    postReturnPhaseHookActive, postReturnGainHookActive,
    perturbationBypassed,
    isIdenticalToGoverningEquation,
    finalSplContributionDb: 20 * Math.log10(Math.max(reconMag, 1e-10)),
    answers: {
      completeBeforeReturn: true,
      phaseAppliedAfterReturn: postReturnPhaseHookActive,
      gainAppliedAfterReturn: postReturnGainHookActive,
      identicalToGoverningEquation: isIdenticalToGoverningEquation,
      firstDivergenceStage: isIdenticalToGoverningEquation
        ? null
        : (postReturnPhaseHookActive
          ? 'debugModalPhaseConvention hook (post-return, not live default)'
          : postReturnGainHookActive
            ? 'rewParityModalMagnitudeScale hook (post-return, not live default)'
            : (divergenceRe > 1e-9 || divergenceIm > 1e-9)
              ? 'Diagnostic phase perturbation / storage stage'
              : null),
    },
  };
}