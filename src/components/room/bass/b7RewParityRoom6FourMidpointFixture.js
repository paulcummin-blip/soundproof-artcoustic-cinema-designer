import { computeNormalizedRoomTransfer } from "./normalizedRoomTransferEngine";
import { alignSubsToRSP } from "./alignSubsToRSP";
import { scoreB7Markers } from "./b7RewParityReferenceFixture";

// Sixth independent B7 REW reference, captured 2026-08-14. Geometry is
// reconstructed from the displayed room plan and the four source-to-main
// distances. Response markers are not used to choose the geometry.
export const B7_REW_ROOM6_FOUR_MIDPOINT_CASE = Object.freeze({
  id: "rew-6p1x5p2x2p2-four-wall-midpoint-aligned",
  roomDims: Object.freeze({ widthM: 5.20, lengthM: 6.10, heightM: 2.20 }),
  rspPosition: Object.freeze({ id: "rsp", x: 2.61, y: 4.03, z: 1.08 }),
  sources: Object.freeze([
    Object.freeze({
      id: "rew-room6-sub-1-front-midpoint",
      x: 2.60,
      y: 0.29,
      z: 0.17,
      tuning: Object.freeze({ gainDb: 0, delayMs: 0, polarity: 0 }),
    }),
    Object.freeze({
      id: "rew-room6-sub-2-rear-midpoint",
      x: 2.60,
      y: 5.81,
      z: 0.17,
      tuning: Object.freeze({ gainDb: 0, delayMs: 0, polarity: 0 }),
    }),
    Object.freeze({
      id: "rew-room6-sub-3-left-midpoint",
      x: 0.29,
      y: 3.05,
      z: 0.17,
      tuning: Object.freeze({ gainDb: 0, delayMs: 0, polarity: 0 }),
    }),
    Object.freeze({
      id: "rew-room6-sub-4-right-midpoint",
      x: 4.91,
      y: 3.05,
      z: 0.17,
      tuning: Object.freeze({ gainDb: 0, delayMs: 0, polarity: 0 }),
    }),
  ]),
  reportedSourceDistancesM: Object.freeze([3.85, 2.00, 2.68, 2.66]),
  reportedAlignmentDelaysMs: Object.freeze([0, 6.5, 3.9, 4.0]),
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
    Object.freeze({ hz: 20.0, db: 88.2 }),
    Object.freeze({ hz: 28.2, db: 95.2 }),
    Object.freeze({ hz: 30.2, db: 91.5 }),
    Object.freeze({ hz: 40.1, db: 82.3 }),
    Object.freeze({ hz: 50.0, db: 76.7 }),
    Object.freeze({ hz: 56.4, db: 89.6 }),
    Object.freeze({ hz: 60.2, db: 89.4 }),
    Object.freeze({ hz: 68.6, db: 69.4 }),
    Object.freeze({ hz: 80.1, db: 92.2 }),
  ]),
});

const ROOM6_BASE_OPTIONS = Object.freeze({
  enableReflections: false,
  enableModes: true,
  surfaceAbsorption: B7_REW_ROOM6_FOUR_MIDPOINT_CASE.surfaceAbsorption,
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

function arrivalsMs(sources, distancesM) {
  return sources.map(
    (source, index) => distancesM[index] / 343 * 1000 + source.tuning.delayMs,
  );
}

function spread(values) {
  return Math.max(...values) - Math.min(...values);
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
    ...scoreB7Markers(reference.alignedMarkers, freqsHz, splDb),
  };
}

export function runB7RewRoom6FourMidpointFixture(
  optionOverrides = {},
  referenceOverrides = {},
) {
  const reference = {
    ...B7_REW_ROOM6_FOUR_MIDPOINT_CASE,
    ...referenceOverrides,
    roomDims:
      referenceOverrides.roomDims || B7_REW_ROOM6_FOUR_MIDPOINT_CASE.roomDims,
    rspPosition:
      referenceOverrides.rspPosition ||
      B7_REW_ROOM6_FOUR_MIDPOINT_CASE.rspPosition,
    sources:
      referenceOverrides.sources || B7_REW_ROOM6_FOUR_MIDPOINT_CASE.sources,
    alignedMarkers:
      referenceOverrides.alignedMarkers ||
      B7_REW_ROOM6_FOUR_MIDPOINT_CASE.alignedMarkers,
  };
  const options = { ...ROOM6_BASE_OPTIONS, ...optionOverrides };
  const rawSources = reference.sources.map((source) => ({
    ...source,
    tuning: { ...source.tuning, delayMs: 0 },
  }));
  const geometricAlignedSources = alignSubsToRSP(
    rawSources,
    reference.rspPosition,
  );
  const rewReportedSources = rawSources.map((source, index) => ({
    ...source,
    tuning: {
      ...source.tuning,
      delayMs: reference.reportedAlignmentDelaysMs[index],
    },
  }));
  const distancesM = rawSources.map((source) =>
    distanceM(source, reference.rspPosition)
  );
  const distanceErrorsM = distancesM.map(
    (distance, index) => distance - reference.reportedSourceDistancesM[index],
  );
  const geometricAlignmentDelaysMs = geometricAlignedSources.map(
    (source) => source.tuning.delayMs,
  );
  const alignmentDelayErrorsMs = geometricAlignmentDelaysMs.map(
    (delay, index) => delay - reference.reportedAlignmentDelaysMs[index],
  );
  const geometricArrivalsMs = arrivalsMs(geometricAlignedSources, distancesM);
  const rewReportedArrivalsMs = arrivalsMs(rewReportedSources, distancesM);

  return {
    caseId: reference.id,
    options,
    distancesM,
    distanceErrorsM,
    geometricAlignmentDelaysMs,
    reportedAlignmentDelaysMs: reference.reportedAlignmentDelaysMs,
    alignmentDelayErrorsMs,
    geometricArrivalSpreadMs: spread(geometricArrivalsMs),
    rewReportedArrivalSpreadMs: spread(rewReportedArrivalsMs),
    geometricAligned: runState(
      reference,
      geometricAlignedSources,
      options,
    ),
    rewReportedAligned: runState(
      reference,
      rewReportedSources,
      options,
    ),
  };
}

if (globalThis.process?.env?.B7_REW_ROOM6_FOUR_SCORE === "1") {
  const report = runB7RewRoom6FourMidpointFixture();
  const compactState = (state) => ({
    status: state.status,
    shapeRmsDb: state.shapeRmsDb,
    shapeMaxDb: state.shapeMaxDb,
    meanDeltaDb: state.meanDeltaDb,
    rows: state.rows.map(({ hz, db, predictedDb, shapeDeltaDb }) => ({
      hz,
      rewDb: db,
      predictedDb,
      shapeDeltaDb,
    })),
  });
  console.log(JSON.stringify({
    distancesM: report.distancesM,
    distanceErrorsM: report.distanceErrorsM,
    geometricAlignmentDelaysMs: report.geometricAlignmentDelaysMs,
    reportedAlignmentDelaysMs: report.reportedAlignmentDelaysMs,
    alignmentDelayErrorsMs: report.alignmentDelayErrorsMs,
    geometricArrivalSpreadMs: report.geometricArrivalSpreadMs,
    rewReportedArrivalSpreadMs: report.rewReportedArrivalSpreadMs,
    geometricAligned: compactState(report.geometricAligned),
    rewReportedAligned: compactState(report.rewReportedAligned),
  }, null, 2));
}
