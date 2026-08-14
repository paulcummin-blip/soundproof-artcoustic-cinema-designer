import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";
import { REW_SOURCE_CURVES } from "./rewSourceCurves";

// B7 REW reference captured 2026-08-14 from Room Simulator screenshots.
// Main/RSP coordinates are displayed by REW. The sub acoustic centre is
// digitised from the scaled plan/elevation and constrained by REW's displayed
// 2.75 m source-to-main distance.
export const B7_REW_REFERENCE_CASE = Object.freeze({
  id: "rew-4x3x2p4-front-left-single",
  roomDims: Object.freeze({ widthM: 3.0, lengthM: 4.0, heightM: 2.4 }),
  rspPosition: Object.freeze({ id: "rsp", x: 1.52, y: 2.50, z: 1.08 }),
  source: Object.freeze({
    id: "rew-sub-1",
    x: 0.19,
    y: 0.27,
    z: 0.18,
    tuning: Object.freeze({ gainDb: 0, delayMs: 0, polarity: 0 }),
  }),
  reportedSourceDistanceM: 2.75,
  coordinateToleranceM: 0.03,
  roomIsSealed: true,
  surfaceAbsorption: Object.freeze({
    front: 0.30,
    back: 0.30,
    left: 0.30,
    right: 0.30,
    ceiling: 0.30,
    floor: 0.30,
  }),
  sourceDefinition: Object.freeze({ lfMinus3DbHz: 20, enclosure: "ported" }),
  markers: Object.freeze([
    Object.freeze({ hz: 25.0, db: 94.0 }),
    Object.freeze({ hz: 30.0, db: 93.8 }),
    Object.freeze({ hz: 40.0, db: 97.7 }),
    Object.freeze({ hz: 50.0, db: 84.6 }),
    Object.freeze({ hz: 60.0, db: 71.1 }),
    Object.freeze({ hz: 70.0, db: 82.1 }),
    Object.freeze({ hz: 80.1, db: 92.2 }),
    Object.freeze({ hz: 90.0, db: 92.6 }),
    Object.freeze({ hz: 100.1, db: 81.1 }),
  ]),
});

const BASE_OPTIONS = Object.freeze({
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: B7_REW_REFERENCE_CASE.surfaceAbsorption,
  freqMinHz: 15,
  freqMaxHz: 200,
  pointsPerOctave: 96,
  smoothing: "none",
  modalSourceReferenceMode: "distance_normalized",
  modalGainScalar: 1,
  axialQ: 4,
  modalStorageMode: "none",
  propagationPhaseScale: 0,
  pureDeterministicModalSum: true,
  disableReflectionPhaseJitter: true,
  disableReflectionCoherenceWeight: false,
  disableLateField: true,
  disableModalPropagationPhase: true,
  debugMode200Multiplier: 1,
  debugReflectionOrder: 1,
  reflectionGainScale: 1,
  rewParityModalMagnitudeScale: 1,
  modalCoherenceMode: "coherent",
  highOrderAxialScale: 1,
  qStrategy: "ab_corrected",
  rewModalBandwidthScale: 1,
});

function sampleDbAt(freqsHz, splDb, targetHz) {
  if (!Array.isArray(freqsHz) || !Array.isArray(splDb) || freqsHz.length < 2) return null;
  let hi = freqsHz.findIndex((hz) => hz >= targetHz);
  if (hi < 0) hi = freqsHz.length - 1;
  if (hi === 0) return splDb[0];
  const lo = hi - 1;
  const span = freqsHz[hi] - freqsHz[lo];
  const t = span > 0 ? (targetHz - freqsHz[lo]) / span : 0;
  return splDb[lo] + (splDb[hi] - splDb[lo]) * t;
}

function scoreMarkers(markers, freqsHz, splDb) {
  const sampled = markers.map((marker) => ({
    ...marker,
    predictedDb: sampleDbAt(freqsHz, splDb, marker.hz),
  }));
  const valid = sampled.filter((row) => Number.isFinite(row.predictedDb));
  const meanDeltaDb = valid.reduce((sum, row) => sum + row.predictedDb - row.db, 0) / Math.max(valid.length, 1);
  const rows = sampled.map((row) => {
    const rawDeltaDb = Number.isFinite(row.predictedDb) ? row.predictedDb - row.db : null;
    return {
      ...row,
      rawDeltaDb,
      shapeDeltaDb: Number.isFinite(rawDeltaDb) ? rawDeltaDb - meanDeltaDb : null,
    };
  });
  const finiteRows = rows.filter((row) => Number.isFinite(row.rawDeltaDb));
  const rms = (key) => Math.sqrt(finiteRows.reduce((sum, row) => sum + row[key] * row[key], 0) / Math.max(finiteRows.length, 1));
  const maxAbs = (key) => Math.max(0, ...finiteRows.map((row) => Math.abs(row[key])));
  return {
    rows,
    meanDeltaDb,
    rawRmsDb: rms("rawDeltaDb"),
    shapeRmsDb: rms("shapeDeltaDb"),
    rawMaxDb: maxAbs("rawDeltaDb"),
    shapeMaxDb: maxAbs("shapeDeltaDb"),
  };
}

export function runB7RewReferenceFixture(optionOverrides = {}, sourceCurve = REW_SOURCE_CURVES.rew20HzPorted) {
  const reference = B7_REW_REFERENCE_CASE;
  const result = simulateBassResponseRewCore(
    reference.roomDims,
    reference.rspPosition,
    reference.source,
    sourceCurve,
    { ...BASE_OPTIONS, ...optionOverrides },
  );
  const distanceM = Math.hypot(
    reference.source.x - reference.rspPosition.x,
    reference.source.y - reference.rspPosition.y,
    reference.source.z - reference.rspPosition.z,
  );
  return {
    caseId: reference.id,
    options: { ...BASE_OPTIONS, ...optionOverrides },
    distanceM,
    distanceErrorM: distanceM - reference.reportedSourceDistanceM,
    ...scoreMarkers(reference.markers, result.freqsHz, result.splDbRaw),
  };
}

export function runB7RewCandidateMatrix() {
  const candidates = [
    {
      id: "active_ab_direct_images_modes",
      overrides: { rewParityFieldMode: "direct_plus_reflections_and_modes", enableReflections: true },
    },
    {
      id: "ab_direct_modes",
      overrides: { rewParityFieldMode: "direct_plus_modes", enableReflections: false },
    },
    {
      id: "ab_modes_only_200hz_bank",
      overrides: { rewParityFieldMode: "modes_only", enableReflections: false, modeGenerationFMaxHz: 200 },
    },
    {
      id: "ab_modes_only_300hz_bank",
      overrides: { rewParityFieldMode: "modes_only", enableReflections: false, modeGenerationFMaxHz: 300 },
    },
    {
      id: "ab_modes_only_500hz_bank",
      overrides: { rewParityFieldMode: "modes_only", enableReflections: false, modeGenerationFMaxHz: 500 },
    },
    {
      id: "ab_modes_only_1000hz_bank",
      overrides: { rewParityFieldMode: "modes_only", enableReflections: false, modeGenerationFMaxHz: 1000 },
    },
  ];
  return candidates.map(({ id, overrides }) => {
    const report = runB7RewReferenceFixture(overrides);
    return {
      id,
      distanceM: report.distanceM,
      distanceErrorM: report.distanceErrorM,
      meanDeltaDb: report.meanDeltaDb,
      rawRmsDb: report.rawRmsDb,
      shapeRmsDb: report.shapeRmsDb,
      rawMaxDb: report.rawMaxDb,
      shapeMaxDb: report.shapeMaxDb,
      rows: report.rows.map(({ hz, db, predictedDb, rawDeltaDb, shapeDeltaDb }) => ({
        hz, rewDb: db, predictedDb, rawDeltaDb, shapeDeltaDb,
      })),
    };
  });
}

if (typeof process !== "undefined" && process?.env?.B7_REW_FIXTURE === "1") {
  console.log(JSON.stringify(runB7RewCandidateMatrix(), null, 2));
}
