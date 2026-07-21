import { computeNormalizedRoomTransfer } from "./normalizedRoomTransferEngine";
import { buildNormalizedPhysicsOptions, buildPreviewPhysicsOptions } from "./normalizedPhysicsOptionsBuilder";
import { alignPreviewAndRefinement, buildPreviewRefinementDeltaTable } from "./previewRefinementComparison";
import { buildNormalizedSeries } from "./normalizedSeriesBuilder";

const roomDims = { widthM: 6, lengthM: 8, heightM: 2.8 };
const rspPosition = { x: 3, y: 5.5, z: 1.2 };
const seatingPositions = [{ id: "seat-1", x: 2.5, y: 5, z: 1.2 }];
const subsForSimulation = [{ id: "sub-1", x: 1.5, y: 1, z: 0.3, tuning: { gainDb: 0, delayMs: 0, polarity: 0 } }];
const physics = buildNormalizedPhysicsOptions({
  surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 },
  qStrategy: "ab_corrected", enableRewCoreReflections: false, roomDamping: 20, axialQ: 4,
  modalSourceReferenceMode: "existing", modalGainScalar: 1, modalDistanceBlend: 0,
  modalStorageMode: "constant", propagationPhaseScale: 0, rewParityFieldMode: "full_field",
  reflectionGainScale: 1, modalCoherenceMode: "standard", highOrderAxialScale: 1, rewModalBandwidthScale: 1,
});

export function runPreviewRefinementComparisonFixtures() {
  const common = { roomDims, rspPosition, seatingPositions, subsForSimulation };
  const preview = computeNormalizedRoomTransfer({ ...common, physicsOptions: buildPreviewPhysicsOptions(physics), pointsPerOctave: 8 });
  const refined = computeNormalizedRoomTransfer({ ...common, physicsOptions: physics });
  const aligned = alignPreviewAndRefinement(preview.rspCurve, refined.rspCurve);
  const rows = buildPreviewRefinementDeltaTable(preview.rspCurve, refined.rspCurve);
  const labels = ["none", "sixth", "third"];
  const checks = [
    { name: "All display smoothing modes compared", passed: rows.length === 3 && rows.every((row, index) => row.smoothingMode === labels[index]) },
    { name: "Preview and refinement use an identical aligned frequency grid", passed: aligned.preview.length > 0 && JSON.stringify(aligned.preview.map((point) => point.frequency)) === JSON.stringify(aligned.refined.map((point) => point.frequency)) },
    { name: "Every comparison reports a deterministic maximum", passed: rows.every((row) => Number.isFinite(row.maximumDeltaDb) && Number.isFinite(row.frequencyHz)) },
    { name: "Every comparison reports movement width", passed: rows.every((row) => Number.isFinite(row.halfMaximumWidthOctaves)) },
    { name: "1/6-octave maximum does not exceed unsmoothed maximum", passed: rows[1].maximumDeltaDb <= rows[0].maximumDeltaDb },
    { name: "1/3-octave maximum does not exceed unsmoothed maximum", passed: rows[2].maximumDeltaDb <= rows[0].maximumDeltaDb },
    { name: "Every comparison classifies transition shape", passed: rows.every((row) => ["narrow null", "broad response movement"].includes(row.movement)) },
    { name: "Preview graph state label restored", passed: buildNormalizedSeries(preview.rspCurve, "preview", false).label === "Preview" },
    { name: "Refining graph state label restored", passed: buildNormalizedSeries(preview.rspCurve, "preview", true).label === "Refining…" },
    { name: "Refined graph state label restored", passed: buildNormalizedSeries(refined.rspCurve, "refined", false).label === "Refined" },
  ];
  return { rows, results: checks, passed: checks.filter((check) => check.passed).length, total: checks.length, allPassed: checks.every((check) => check.passed) };
}