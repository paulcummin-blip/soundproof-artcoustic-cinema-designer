import { computeNormalizedRoomTransfer } from "./normalizedRoomTransferEngine";
import { alignSubsToRSP } from "./alignSubsToRSP";
import { scoreB7Markers } from "./b7RewParityReferenceFixture";

// Independent B7 four-sub reference captured 2026-08-14 from REW Room
// Simulator screenshots. The room, RSP and source coordinates are reconstructed
// only from REW's displayed dimensions, plan/elevation coordinates and the four
// source-to-main distances. Response markers are held separately and are never
// used to choose or adjust geometry.
//
// REW's rear source table order is mapped to the symmetric rear corners by its
// displayed distance/delay pairs. This preserves the measured geometry even
// though the plan-number labels and table-row order are mirror-ambiguous.
export const B7_REW_ROOM5_FOUR_SUB_CASE = Object.freeze({
  id: "rew-7p2x6p3x3p2-four-corner-aligned",
  roomDims: Object.freeze({ widthM: 6.30, lengthM: 7.20, heightM: 3.20 }),
  rspPosition: Object.freeze({ id: "rsp", x: 3.13, y: 5.98, z: 1.08 }),
  sources: Object.freeze([
    Object.freeze({
      id: "rew-room5-sub-1-front-left",
      x: 0.15,
      y: 0.336,
      z: 0.108,
      tuning: Object.freeze({ gainDb: 0, delayMs: 0, polarity: 0 }),
    }),
    Object.freeze({
      id: "rew-room5-sub-2-front-right",
      x: 6.15,
      y: 0.336,
      z: 0.108,
      tuning: Object.freeze({ gainDb: 0, delayMs: 0, polarity: 0 }),
    }),
    Object.freeze({
      id: "rew-room5-sub-3-rear-left",
      x: 0.15,
      y: 6.864,
      z: 0.108,
      tuning: Object.freeze({ gainDb: 0, delayMs: 0, polarity: 0 }),
    }),
    Object.freeze({
      id: "rew-room5-sub-4-rear-right",
      x: 6.15,
      y: 6.864,
      z: 0.108,
      tuning: Object.freeze({ gainDb: 0, delayMs: 0, polarity: 0 }),
    }),
  ]),
  reportedSourceDistancesM: Object.freeze([6.45, 6.48, 3.26, 3.29]),
  reportedAlignmentDelaysMs: Object.freeze([0.1, 0, 9.4, 9.3]),
  coordinateToleranceM: 0.05,
  distanceToleranceM: 0.03,
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
  alignedMarkers: Object.freeze([
    Object.freeze({ hz: 20.0, db: 92.4 }),
    Object.freeze({ hz: 23.9, db: 102.7 }),
    Object.freeze({ hz: 30.2, db: 92.0 }),
    Object.freeze({ hz: 40.2, db: 87.4 }),
    Object.freeze({ hz: 47.4, db: 82.6 }),
    Object.freeze({ hz: 50.0, db: 88.5 }),
    Object.freeze({ hz: 60.0, db: 97.9 }),
    Object.freeze({ hz: 70.0, db: 87.6 }),
    Object.freeze({ hz: 79.9, db: 91.1 }),
    Object.freeze({ hz: 90.0, db: 92.9 }),
  ]),
  unalignedControl: Object.freeze({ hz: 80.1, db: 79.7 }),
  rewAlignmentBenefitDb: 11.4,
});

const ROOM5_BASE_OPTIONS = Object.freeze({
  enableReflections: false,
  enableModes: true,
  surfaceAbsorption: B7_REW_ROOM5_FOUR_SUB_CASE.surfaceAbsorption,
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
  rewParityFieldMode: "modes_only",
  roomIsSealed: true,
  abApplyModeMultiplicity: true,
  abMidbandQScale: 1,
  rewSourceCurveMode: "flat_rew_reference",
});

function distanceM(source, rspPosition) {
  return Math.hypot(
    source.x - rspPosition.x,
    source.y - rspPosition.y,
    source.z - rspPosition.z,
  );
}

function interpolateAt(targetHz, freqsHz, splDb) {
  if (targetHz <= freqsHz[0]) return splDb[0];
  if (targetHz >= freqsHz[freqsHz.length - 1]) return splDb[splDb.length - 1];
  let upper = 1;
  while (upper < freqsHz.length && freqsHz[upper] < targetHz) upper += 1;
  const lower = upper - 1;
  const span = freqsHz[upper] - freqsHz[lower];
  const ratio = span > 0 ? (targetHz - freqsHz[lower]) / span : 0;
  return splDb[lower] + ratio * (splDb[upper] - splDb[lower]);
}

function runState(reference, sources, options) {
  const transfer = computeNormalizedRoomTransfer({
    roomDims: reference.roomDims,
    rspPosition: reference.rspPosition,
    seatingPositions: [],
    subsForSimulation: sources,
    physicsOptions: options,
    pointsPerOctave: 96,
  });
  const freqsHz = transfer.rspCurve.map((point) => point.frequency);
  const splDb = transfer.rspCurve.map((point) => point.spl);
  return {
    status: transfer.status,
    freqsHz,
    splDb,
  };
}

export function runB7RewRoom5FourSubFixture(
  optionOverrides = {},
  referenceOverrides = {},
) {
  const reference = {
    ...B7_REW_ROOM5_FOUR_SUB_CASE,
    ...referenceOverrides,
    roomDims: referenceOverrides.roomDims || B7_REW_ROOM5_FOUR_SUB_CASE.roomDims,
    rspPosition: referenceOverrides.rspPosition || B7_REW_ROOM5_FOUR_SUB_CASE.rspPosition,
    sources: referenceOverrides.sources || B7_REW_ROOM5_FOUR_SUB_CASE.sources,
    alignedMarkers:
      referenceOverrides.alignedMarkers || B7_REW_ROOM5_FOUR_SUB_CASE.alignedMarkers,
    unalignedControl:
      referenceOverrides.unalignedControl || B7_REW_ROOM5_FOUR_SUB_CASE.unalignedControl,
  };
  const options = { ...ROOM5_BASE_OPTIONS, ...optionOverrides };
  const unalignedSources = reference.sources.map((source) => ({
    ...source,
    tuning: { ...source.tuning, delayMs: 0 },
  }));
  const alignedSources = alignSubsToRSP(unalignedSources, reference.rspPosition);
  const distancesM = unalignedSources.map((source) =>
    distanceM(source, reference.rspPosition)
  );
  const distanceErrorsM = distancesM.map(
    (distance, index) => distance - reference.reportedSourceDistancesM[index],
  );
  const actualAlignmentDelaysMs = alignedSources.map(
    (source) => source.tuning.delayMs,
  );
  const alignmentDelayErrorsMs = actualAlignmentDelaysMs.map(
    (delayMs, index) => delayMs - reference.reportedAlignmentDelaysMs[index],
  );
  const alignedArrivalsMs = alignedSources.map(
    (source, index) => distancesM[index] / 343 * 1000 + source.tuning.delayMs,
  );
  const alignedArrivalSpreadMs =
    Math.max(...alignedArrivalsMs) - Math.min(...alignedArrivalsMs);

  const unalignedState = runState(reference, unalignedSources, options);
  const alignedState = runState(reference, alignedSources, options);
  const alignedScore = scoreB7Markers(
    reference.alignedMarkers,
    alignedState.freqsHz,
    alignedState.splDb,
  );
  const controlHz = reference.unalignedControl.hz;
  const alignedAtControlDb = interpolateAt(
    controlHz,
    alignedState.freqsHz,
    alignedState.splDb,
  );
  const unalignedAtControlDb = interpolateAt(
    controlHz,
    unalignedState.freqsHz,
    unalignedState.splDb,
  );
  const modelAlignmentBenefitDb = alignedAtControlDb - unalignedAtControlDb;

  return {
    caseId: reference.id,
    options,
    distancesM,
    distanceErrorsM,
    actualAlignmentDelaysMs,
    reportedAlignmentDelaysMs: reference.reportedAlignmentDelaysMs,
    alignmentDelayErrorsMs,
    alignedArrivalSpreadMs,
    aligned: {
      status: alignedState.status,
      ...alignedScore,
    },
    unalignedControl: {
      status: unalignedState.status,
      hz: controlHz,
      rewDb: reference.unalignedControl.db,
      alignedRewDb: 91.1,
      rewAlignmentBenefitDb: reference.rewAlignmentBenefitDb,
      alignedPredictedDb: alignedAtControlDb,
      unalignedPredictedDb: unalignedAtControlDb,
      modelAlignmentBenefitDb,
      alignmentBenefitErrorDb:
        modelAlignmentBenefitDb - reference.rewAlignmentBenefitDb,
    },
  };
}

if (globalThis.process?.env?.B7_REW_ROOM5_FOUR_SCORE === "1") {
  const report = runB7RewRoom5FourSubFixture();
  console.log(JSON.stringify({
    distancesM: report.distancesM,
    distanceErrorsM: report.distanceErrorsM,
    actualAlignmentDelaysMs: report.actualAlignmentDelaysMs,
    reportedAlignmentDelaysMs: report.reportedAlignmentDelaysMs,
    alignmentDelayErrorsMs: report.alignmentDelayErrorsMs,
    alignedArrivalSpreadMs: report.alignedArrivalSpreadMs,
    aligned: {
      status: report.aligned.status,
      shapeRmsDb: report.aligned.shapeRmsDb,
      shapeMaxDb: report.aligned.shapeMaxDb,
      meanDeltaDb: report.aligned.meanDeltaDb,
      rows: report.aligned.rows.map(({ hz, db, predictedDb, shapeDeltaDb }) => ({
        hz,
        rewDb: db,
        predictedDb,
        shapeDeltaDb,
      })),
    },
    unalignedControl: report.unalignedControl,
  }, null, 2));
}
