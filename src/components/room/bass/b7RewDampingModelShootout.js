import {
  computeRoomModesLocal,
  estimateModeQLocal,
} from "@/bass/core/modalCalculations";
import {
  B7_REW_REFERENCE_CASE,
  runB7RewReferenceFixture,
} from "./b7RewParityReferenceFixture";
import {
  B7_REW_ROOM2_CASE,
  runB7RewRoom2Fixture,
} from "./b7RewParityRoom2Fixture";
import { REW_SOURCE_CURVES } from "./rewSourceCurves";

const SPEED_OF_SOUND_MPS = 343;
const MODE_BANK_MAX_HZ = 200;

function clampQ(value) {
  return Math.max(1, Math.min(80, Number(value) || 1));
}

function buildTopologySabineModes(reference) {
  return computeRoomModesLocal({
    ...reference.roomDims,
    fMax: MODE_BANK_MAX_HZ,
    c: SPEED_OF_SOUND_MPS,
  }).map((mode) => ({
    ...mode,
    qValue: estimateModeQLocal({
      roomDims: reference.roomDims,
      surfaceAbsorption: reference.surfaceAbsorption,
      f0: mode.freq,
      mode,
    }),
  }));
}

function buildGlobalSabineModes(reference) {
  return computeRoomModesLocal({
    ...reference.roomDims,
    fMax: MODE_BANK_MAX_HZ,
    c: SPEED_OF_SOUND_MPS,
  }).map((mode) => ({
    ...mode,
    qValue: estimateModeQLocal({
      roomDims: reference.roomDims,
      surfaceAbsorption: reference.surfaceAbsorption,
      f0: mode.freq,
    }),
  }));
}

function buildGlobalEyringModes(reference) {
  const { widthM, lengthM, heightM } = reference.roomDims;
  const volumeM3 = widthM * lengthM * heightM;
  const surfaces = [
    { areaM2: widthM * heightM, alpha: reference.surfaceAbsorption.front },
    { areaM2: widthM * heightM, alpha: reference.surfaceAbsorption.back },
    { areaM2: lengthM * heightM, alpha: reference.surfaceAbsorption.left },
    { areaM2: lengthM * heightM, alpha: reference.surfaceAbsorption.right },
    { areaM2: lengthM * widthM, alpha: reference.surfaceAbsorption.floor },
    { areaM2: lengthM * widthM, alpha: reference.surfaceAbsorption.ceiling },
  ];
  const totalAreaM2 = surfaces.reduce((sum, surface) => sum + surface.areaM2, 0);
  const areaWeightedAlpha = surfaces.reduce(
    (sum, surface) => sum + surface.areaM2 * surface.alpha,
    0,
  ) / Math.max(totalAreaM2, 1e-9);
  const equivalentAbsorptionM2 =
    -totalAreaM2 * Math.log(Math.max(1e-6, 1 - areaWeightedAlpha));
  const rt60Seconds = 0.161 * volumeM3 / Math.max(equivalentAbsorptionM2, 1e-9);
  const amplitudeTauSeconds = rt60Seconds / 13.815;

  return computeRoomModesLocal({
    ...reference.roomDims,
    fMax: MODE_BANK_MAX_HZ,
    c: SPEED_OF_SOUND_MPS,
  }).map((mode) => ({
    ...mode,
    qValue: clampQ(2 * Math.PI * mode.freq * amplitudeTauSeconds),
  }));
}

// Boundary-encounter decay for a rectangular standing wave. Each axis loses
// pressure according to the two wall reflection coefficients encountered per
// round trip, weighted by the mode's directional wave-number component.
function buildBoundaryReflectionModes(reference) {
  const { widthM, lengthM, heightM } = reference.roomDims;
  const sa = reference.surfaceAbsorption;
  const pairLoss = {
    x: -Math.log(Math.max(
      1e-9,
      Math.sqrt(1 - sa.left) * Math.sqrt(1 - sa.right),
    )),
    y: -Math.log(Math.max(
      1e-9,
      Math.sqrt(1 - sa.front) * Math.sqrt(1 - sa.back),
    )),
    z: -Math.log(Math.max(
      1e-9,
      Math.sqrt(1 - sa.floor) * Math.sqrt(1 - sa.ceiling),
    )),
  };

  return computeRoomModesLocal({
    ...reference.roomDims,
    fMax: MODE_BANK_MAX_HZ,
    c: SPEED_OF_SOUND_MPS,
  }).map((mode) => {
    const kx = mode.nx * Math.PI / widthM;
    const ky = mode.ny * Math.PI / lengthM;
    const kz = mode.nz * Math.PI / heightM;
    const kSquared = kx * kx + ky * ky + kz * kz;
    const decayTerm =
      (Math.abs(kx) * pairLoss.x / widthM) +
      (Math.abs(ky) * pairLoss.y / lengthM) +
      (Math.abs(kz) * pairLoss.z / heightM);
    return {
      ...mode,
      qValue: clampQ(kSquared / Math.max(decayTerm, 1e-9)),
    };
  });
}

const CANDIDATES = Object.freeze([
  Object.freeze({ id: "production_soft_cap", buildModes: null }),
  Object.freeze({ id: "topology_sabine_uncapped", buildModes: buildTopologySabineModes }),
  Object.freeze({ id: "global_sabine", buildModes: buildGlobalSabineModes }),
  Object.freeze({ id: "global_eyring", buildModes: buildGlobalEyringModes }),
  Object.freeze({ id: "boundary_reflection_decay", buildModes: buildBoundaryReflectionModes }),
]);

function summarize(report) {
  return {
    shapeRmsDb: report.shapeRmsDb,
    shapeMaxDb: report.shapeMaxDb,
    meanDeltaDb: report.meanDeltaDb,
    rows: report.rows.map(({ hz, db, predictedDb, shapeDeltaDb }) => ({
      hz,
      rewDb: db,
      predictedDb,
      shapeDeltaDb,
    })),
  };
}

export function runB7RewDampingModelShootout() {
  return CANDIDATES.map((candidate) => {
    const room1Modes = candidate.buildModes?.(B7_REW_REFERENCE_CASE);
    const room2Modes = candidate.buildModes?.(B7_REW_ROOM2_CASE);
    const room1Overrides = room1Modes ? { precomputedModes: room1Modes } : {};
    const room2Overrides = room2Modes ? { precomputedModes: room2Modes } : {};
    const room1 = runB7RewReferenceFixture(
      room1Overrides,
      REW_SOURCE_CURVES.flat_rew_reference,
    );
    const room2 = runB7RewRoom2Fixture(room2Overrides);
    return {
      id: candidate.id,
      room1: summarize(room1),
      room2: summarize(room2),
      combinedShapeRmsDb: Math.sqrt(
        (room1.shapeRmsDb ** 2 + room2.shapeRmsDb ** 2) / 2,
      ),
      worstShapeMaxDb: Math.max(room1.shapeMaxDb, room2.shapeMaxDb),
    };
  });
}

if (globalThis.process?.env?.B7_REW_DAMPING_SHOOTOUT === "1") {
  console.log(JSON.stringify(runB7RewDampingModelShootout(), null, 2));
}
