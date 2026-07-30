// bassLifecycleFixture.js — Deterministic fixture for BassLifecycleTestBench.
//
// Builds the minimum AppState shape required by useAuthoritativeBassResponse
// using production adapters (normaliseLegacySubwoofers + bassInputAdapter).
// No physics, no candidate selection, no contract publication — just data.
//
// READ-ONLY: this module only constructs a static object. It does not call
// recordDiagStage, instantiate controllers, or trigger workers.

import { normaliseLegacySubwoofers, bassInputAdapter } from "@/components/utils/subwooferInstanceMigration";
import { INSTANCE_STATUS } from "@/components/utils/subwooferInstanceCompatibility";

export function buildBassLifecycleFixture() {
  const roomDims = { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };

  const frontSubsCfg = {
    model: "SUB2-12",
    count: 2,
    positions: [],
    orientation: "vertical",
    placementMode: "quarter",
  };

  const rearSubsCfg = {
    model: "SUB2-12",
    count: 0,
    positions: [],
    orientation: "vertical",
    placementMode: "default",
  };

  const instances = normaliseLegacySubwoofers(frontSubsCfg, rearSubsCfg, roomDims, null);
  const orientationMeta = {
    frontOrientation: frontSubsCfg.orientation,
    rearOrientation: rearSubsCfg.orientation,
  };
  const subwoofers = bassInputAdapter(instances, orientationMeta);

  const seatingPositions = [
    { id: "seat-1", x: 2.25, y: 3.0, z: 1.2, isPrimary: true },
  ];

  const mlpY_m = 3.0;

  const splConfig = {
    p14Mode: "minimum",
    bassTargetLevel: 1,
    selectedP14TargetBasis: "minimum",
    selectedP14Level: 1,
    globalEqHeadroomDb: 0,
    radiationMode: "half-space",
  };

  const appState = {
    roomDims,
    seatingPositions,
    subwoofers,
    frontSubsCfg,
    rearSubsCfg,
    splConfig,
    subwooferInstancesStatus: INSTANCE_STATUS.VALID,
    mlpY_m,
    designEqEnabled: true,
  };

  return { appState, roomDims, subwoofers, seatingPositions };
}