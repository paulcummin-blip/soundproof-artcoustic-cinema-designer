// modalAccumulationArchitectureAuditEngine.jsx
// Pure computation for the Modal Accumulation Architecture Audit.
// Read-only: tests whether production's "complete reflection field + complete modal field"
// assembly (direct + all reflections + summed modal field, added independently) is the
// cause of the remaining REW parity mismatch, against 5 alternate accumulation
// architectures. Does not alter production code, options, saved projects, or the live graph.

import { simulateBassResponseRewCore } from '@/bass/core/rewBassEngine';
import { computeRoomModesLocal, estimateModeQLocal, modeShapeValueLocal, resonantTransfer } from '@/bass/core/modalCalculations';

export function fmt(v, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }
function mag(re, im) { return Math.sqrt(re * re + im * im); }
function toDb(m) { return 20 * Math.log10(Math.max(m, 1e-10)); }
const SPEED_OF_SOUND = 343;
const FLAT_CURVE_DB = 94;

// Fixed parity case (shared with the other temporary bass audits)
const ROOM_DIMS = { widthM: 5.0, lengthM: 4.5, heightM: 3.0 };
const SUB = { id: 'sub_centre_front', x: 2.5, y: 0.3, z: 0.35, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
const SEAT_POS = { x: 2.5, y: 4.0, z: 1.2 };
const SURFACE_ABSORPTION = { front: 0.3, back: 0.3, left: 0.3, right: 0.3, floor: 0.3, ceiling: 0.3 };
const FREQS_HZ = [28, 29, 30, 31, 32, 33, 34, 35];
const SOURCE_CURVE = [{ hz: 20, db: FLAT_CURVE_DB }, { hz: 50, db: FLAT_CURVE_DB }, { hz: 100, db: FLAT_CURVE_DB }, { hz: 200, db: FLAT_CURVE_DB }];
const SCHROEDER_HZ = 2000 * Math.sqrt(0.4 / (ROOM_DIMS.widthM * ROOM_DIMS.lengthM * ROOM_DIMS.heightM));

function baseEngineOptions(frequencyHz) {
  return {
    enableReflections: true,
    enableModes: true,
    surfaceAbsorption: SURFACE_ABSORPTION,
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

// ── Self-contained geometry/physics helpers, used only by variants D and E which need
// per-wall and per-mode axis tagging not exposed by the production engine's options API.
// Formulas mirror production (direct 1/r pressure, order-1 image sources with
// sqrt(1-alpha) coefficients, 'existing' modal reference — no listener-distance
// attenuation on modal amplitude, resonant transfer via the shared canonical function).
function directContribution(frequencyHz) {
  const dx = SUB.x - SEAT_POS.x, dy = SUB.y - SEAT_POS.y, dz = SUB.z - SEAT_POS.z;
  const distanceM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const distanceLossDb = -20 * Math.log10(distanceM);
  const amplitude = Math.pow(10, (FLAT_CURVE_DB + distanceLossDb) / 20);
  const phase = -2 * Math.PI * frequencyHz * (distanceM / SPEED_OF_SOUND);
  return { re: amplitude * Math.cos(phase), im: amplitude * Math.sin(phase), distanceM };
}

function buildOrder1ImageSources() {
  const { widthM, lengthM, heightM } = ROOM_DIMS;
  const sa = SURFACE_ABSORPTION;
  return [
    { axis: 'width', wall: 'left', x: -SUB.x, y: SUB.y, z: SUB.z, rc: Math.sqrt(1 - sa.left) },
    { axis: 'width', wall: 'right', x: 2 * widthM - SUB.x, y: SUB.y, z: SUB.z, rc: Math.sqrt(1 - sa.right) },
    { axis: 'length', wall: 'front', x: SUB.x, y: -SUB.y, z: SUB.z, rc: Math.sqrt(1 - sa.front) },
    { axis: 'length', wall: 'back', x: SUB.x, y: 2 * lengthM - SUB.y, z: SUB.z, rc: Math.sqrt(1 - sa.back) },
    { axis: 'height', wall: 'floor', x: SUB.x, y: SUB.y, z: -SUB.z, rc: Math.sqrt(1 - sa.floor) },
    { axis: 'height', wall: 'ceiling', x: SUB.x, y: SUB.y, z: 2 * heightM - SUB.z, rc: Math.sqrt(1 - sa.ceiling) },
  ];
}

function reflectionContribution(image, frequencyHz) {
  const dx = image.x - SEAT_POS.x, dy = image.y - SEAT_POS.y, dz = image.z - SEAT_POS.z;
  const distanceM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const distanceLossDb = -20 * Math.log10(distanceM);
  const amplitude = Math.pow(10, (FLAT_CURVE_DB + distanceLossDb) / 20) * image.rc;
  const coherenceWeight = Math.min(0.75, Math.max(0.25, 0.25 + 0.5 * Math.max(0, Math.min(1, (frequencyHz - 20) / 140))));
  const phase = -2 * Math.PI * frequencyHz * (distanceM / SPEED_OF_SOUND);
  return { re: coherenceWeight * amplitude * Math.cos(phase), im: coherenceWeight * amplitude * Math.sin(phase), axis: image.axis, wall: image.wall };
}

function buildTaggedModes() {
  const modes = computeRoomModesLocal({ ...ROOM_DIMS, fMax: 200, c: SPEED_OF_SOUND });
  return modes.map((mode) => {
    const baseQ = mode.type === 'axial' ? 4.0 : mode.type === 'tangential' ? 3.9 : 2.5;
    const absorptionQ = estimateModeQLocal({ roomDims: ROOM_DIMS, surfaceAbsorption: SURFACE_ABSORPTION, f0: mode.freq, mode });
    const qValue = Math.max(1, Math.min(baseQ, absorptionQ));
    let axisGroup = 'tangential_oblique';
    if (mode.type === 'axial') {
      if (mode.nx > 0) axisGroup = 'width';
      else if (mode.ny > 0) axisGroup = 'length';
      else if (mode.nz > 0) axisGroup = 'height';
    }
    return { ...mode, qValue, axisGroup };
  });
}

function modeContribution(mode, frequencyHz) {
  const sourceCoupling = modeShapeValueLocal(mode, SUB.x, SUB.y, SUB.z, ROOM_DIMS);
  const receiverCoupling = modeShapeValueLocal(mode, SEAT_POS.x, SEAT_POS.y, SEAT_POS.z, ROOM_DIMS);
  const coupling = sourceCoupling * receiverCoupling;
  const { re: transferRe, im: transferIm } = resonantTransfer(frequencyHz, mode.freq, mode.qValue);
  const modalSourceAmplitude = Math.pow(10, FLAT_CURVE_DB / 20); // 'existing' reference — no listener-distance attenuation
  const modeOrder = Math.abs(mode.nx) + Math.abs(mode.ny) + Math.abs(mode.nz);
  const axialScale = (mode.type === 'axial' && modeOrder >= 2) ? 0.5 : 1.0;
  const gain = modalSourceAmplitude * coupling * axialScale;
  return { re: gain * transferRe, im: gain * transferIm, axisGroup: mode.axisGroup };
}

const TAGGED_MODES = buildTaggedModes();
const ORDER1_IMAGES = buildOrder1ImageSources();

function sumVec(list) { return list.reduce((acc, v) => ({ re: acc.re + v.re, im: acc.im + v.im }), { re: 0, im: 0 }); }

function runVariantAtFrequency(key, frequencyHz) {
  if (key === 'A' || key === 'B' || key === 'C' || key === 'F') {
    const opts = baseEngineOptions(frequencyHz);
    if (key === 'B') opts.rewParityFieldMode = 'modes_only';
    if (key === 'C') opts.enableModes = false;
    if (key === 'F') opts.lfReflectionHandoffPrototype = true;
    const out = simulateBassResponseRewCore(ROOM_DIMS, SEAT_POS, SUB, SOURCE_CURVE, opts);
    const cp = out.complexPressure?.[0] || { re: 0, im: 0 };
    return { re: cp.re, im: cp.im };
  }

  if (key === 'D') {
    // Per-mode interleaved: within each active-axis mode group, add that group's modal
    // vectors plus only the reflections sharing that axis, exactly once per axis group.
    // No separate direct term (per spec — D is purely the mode/reflection interleave).
    const axisGroups = ['width', 'length', 'height'];
    let total = { re: 0, im: 0 };
    axisGroups.forEach((axis) => {
      const modesInAxis = TAGGED_MODES.filter((m) => m.axisGroup === axis).map((m) => modeContribution(m, frequencyHz));
      const reflectionsInAxis = ORDER1_IMAGES.filter((img) => img.axis === axis).map((img) => reflectionContribution(img, frequencyHz));
      const group = sumVec([...modesInAxis, ...reflectionsInAxis]);
      total = { re: total.re + group.re, im: total.im + group.im };
    });
    const tangentialOblique = TAGGED_MODES.filter((m) => m.axisGroup === 'tangential_oblique').map((m) => modeContribution(m, frequencyHz));
    const toSum = sumVec(tangentialOblique);
    total = { re: total.re + toSum.re, im: total.im + toSum.im };
    return total;
  }

  if (key === 'E') {
    // Axis-bucket assembly: direct once, then each axis bucket (reflections + modes),
    // then tangential/oblique modes separately (no matching reflections — ambiguous axis).
    const direct = directContribution(frequencyHz);
    let total = { re: direct.re, im: direct.im };
    ['width', 'length', 'height'].forEach((axis) => {
      const modesInAxis = TAGGED_MODES.filter((m) => m.axisGroup === axis).map((m) => modeContribution(m, frequencyHz));
      const reflectionsInAxis = ORDER1_IMAGES.filter((img) => img.axis === axis).map((img) => reflectionContribution(img, frequencyHz));
      const group = sumVec([...modesInAxis, ...reflectionsInAxis]);
      total = { re: total.re + group.re, im: total.im + group.im };
    });
    const tangentialOblique = TAGGED_MODES.filter((m) => m.axisGroup === 'tangential_oblique').map((m) => modeContribution(m, frequencyHz));
    const toSum = sumVec(tangentialOblique);
    total = { re: total.re + toSum.re, im: total.im + toSum.im };
    return total;
  }

  return { re: 0, im: 0 };
}

const VARIANT_DEFS = [
  { key: 'A', label: 'A. Production assembly', description: 'direct + all reflections + summed modal field (current production architecture).' },
  { key: 'B', label: 'B. Modal-only reference', description: 'Summed modal field only (no direct, no reflections, no late field).' },
  { key: 'C', label: 'C. Reflection-only reference', description: 'direct + all order-1 reflections only (no modal field).' },
  { key: 'D', label: 'D. Per-mode interleaved assembly', description: 'Per active-axis mode group: that group\u2019s modal vectors + only reflections sharing the same axis, summed once per group; tangential/oblique modes added separately, no direct term.' },
  { key: 'E', label: 'E. Axis-bucket assembly', description: 'direct once + (length reflections + length modes) + (width reflections + width modes) + (height reflections + height modes) + tangential/oblique modes separately.' },
  { key: 'F', label: 'F. Low-frequency modal-dominant assembly', description: 'Below Schroeder (' + fmt(SCHROEDER_HZ, 1) + ' Hz): direct + modal only, no image-source reflections. Above Schroeder: production behaviour.' },
];

function buildRows(key) {
  return FREQS_HZ.map((f) => {
    const { re, im } = runVariantAtFrequency(key, f);
    return {
      frequencyHz: f,
      splDb: toDb(mag(re, im)),
      re, im,
      phaseDeg: (Math.atan2(im, re) * 180) / Math.PI,
    };
  });
}

function nullDepthDb(rows) {
  const peak = Math.max(...rows.map((r) => r.splDb));
  const nullRows = rows.filter((r) => r.frequencyHz >= 29 && r.frequencyHz <= 31);
  const nullMin = nullRows.length ? Math.min(...nullRows.map((r) => r.splDb)) : peak;
  return peak - nullMin;
}

function tellsRewStory(rows) {
  const at30 = rows.find((r) => r.frequencyHz === 30)?.splDb;
  const at34 = rows.find((r) => r.frequencyHz === 34)?.splDb;
  const risingTrend = Number.isFinite(at30) && Number.isFinite(at34) && (at34 - at30) > 0;
  const shallowNull = nullDepthDb(rows) < 3;
  return risingTrend && shallowNull;
}

function newArtifactVsA(rowsVariant, rowsA) {
  let artifact = false;
  let atFreq = null;
  rowsVariant.forEach((rv, i) => {
    if (rv.frequencyHz >= 29 && rv.frequencyHz <= 31) return; // exclude the target null region itself
    const ra = rowsA[i];
    if (ra && (ra.splDb - rv.splDb) > 3) { artifact = true; atFreq = rv.frequencyHz; }
  });
  return { artifact, atFreq };
}

export function runModalAccumulationArchitectureAudit() {
  const results = {};
  VARIANT_DEFS.forEach((v) => {
    const rows = buildRows(v.key);
    results[v.key] = { ...v, rows, nullDepthDb: nullDepthDb(rows), tellsRewStory: tellsRewStory(rows) };
  });

  const rowsA = results.A.rows;
  ['B', 'C', 'D', 'E', 'F'].forEach((key) => {
    const { artifact, atFreq } = newArtifactVsA(results[key].rows, rowsA);
    results[key].newArtifact = artifact;
    results[key].newArtifactFreq = atFreq;
    results[key].delta30HzVsA = results[key].rows.find((r) => r.frequencyHz === 30).splDb - rowsA.find((r) => r.frequencyHz === 30).splDb;
  });

  const dPasses = results.D.tellsRewStory && !results.D.newArtifact && (results.A.nullDepthDb - results.D.nullDepthDb) > 3;
  const ePasses = results.E.tellsRewStory && !results.E.newArtifact && (results.A.nullDepthDb - results.E.nullDepthDb) > 3;
  const fPasses = results.F.tellsRewStory && !results.F.newArtifact && (results.A.nullDepthDb - results.F.nullDepthDb) > 3;

  let verdict;
  if (dPasses || ePasses) {
    verdict = 'MODAL ACCUMULATION ARCHITECTURE CONFIRMED';
  } else if (fPasses) {
    verdict = 'REFLECTION/MODAL OVERLAP ONLY CONFIRMED';
  } else {
    verdict = 'MODAL ACCUMULATION ARCHITECTURE RETIRED';
  }

  const finalReport = {
    test: 'Modal Accumulation Architecture Audit \u2014 does production\u2019s independent-summation of the complete reflection field and complete modal field (direct + all reflections + summed modal field) create the remaining 30 Hz REW parity mismatch, vs alternate accumulation orders/architectures?',
    expected: 'If D (per-mode interleaved) or E (axis-bucket) removes the 29\u201331 Hz null and reproduces the REW story (rising 30\u201334 Hz, no deep 30 Hz null) without a new artifact elsewhere in 28\u201335 Hz, the accumulation architecture/order is confirmed as a material contributor. If only F passes, the reflection/modal overlap below Schroeder is confirmed but accumulation order is not implicated.',
    actual: 'Null depth (29\u201331 Hz) \u2014 A: ' + fmt(results.A.nullDepthDb, 2) + ' dB, B: ' + fmt(results.B.nullDepthDb, 2) + ' dB, C: ' + fmt(results.C.nullDepthDb, 2) + ' dB, D: ' + fmt(results.D.nullDepthDb, 2) + ' dB, E: ' + fmt(results.E.nullDepthDb, 2) + ' dB, F: ' + fmt(results.F.nullDepthDb, 2) + ' dB. REW-story match \u2014 D: ' + results.D.tellsRewStory + ', E: ' + results.E.tellsRewStory + ', F: ' + results.F.tellsRewStory + '.',
    delta: '\u0394NullDepth(A\u2192D)=' + fmt(results.A.nullDepthDb - results.D.nullDepthDb, 2) + ' dB, \u0394NullDepth(A\u2192E)=' + fmt(results.A.nullDepthDb - results.E.nullDepthDb, 2) + ' dB, \u0394NullDepth(A\u2192F)=' + fmt(results.A.nullDepthDb - results.F.nullDepthDb, 2) + ' dB',
    severity: verdict === 'MODAL ACCUMULATION ARCHITECTURE CONFIRMED'
      ? 'HIGH \u2014 the order/architecture in which reflections and modes are summed materially affects the 30 Hz null; production\u2019s independent-summation assembly is implicated.'
      : verdict === 'REFLECTION/MODAL OVERLAP ONLY CONFIRMED'
        ? 'MEDIUM \u2014 reflection/modal overlap below Schroeder is a contributor, but accumulation order itself is not implicated.'
        : 'LOW \u2014 no accumulation architecture variant materially improved the null; hypothesis retired.',
    nextTest: verdict === 'MODAL ACCUMULATION ARCHITECTURE CONFIRMED'
      ? 'Promote the passing architecture (D or E) to a full-curve REW parity sweep across all seats and confirm no regression above Schroeder.'
      : verdict === 'REFLECTION/MODAL OVERLAP ONLY CONFIRMED'
        ? 'Promote variant F\u2019s below-Schroeder reflection suppression to a full-curve REW parity sweep; accumulation order need not be revisited.'
        : 'Return to other root-cause hypotheses (e.g. modal Q/damping topology, source curve calibration) \u2014 accumulation architecture and reflection/modal overlap are both retired for this null.',
  };

  return { results, freqsHz: FREQS_HZ, schroederHz: SCHROEDER_HZ, verdict, finalReport };
}