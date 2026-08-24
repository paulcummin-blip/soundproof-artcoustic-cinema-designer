import { computeCalibrationFingerprint } from "./bassAnalysisFingerprints.js";
import { buildP14TargetCombinations, computeBaseDesignFingerprint } from "./p14TargetDefinitions.js";
import { BASS_RESULT_SCHEMA_VERSION } from "./bassOptimiserWorkerProtocol.js";

function baseInputs() {
  return {
    roomDims: { widthM: 4, lengthM: 6, heightM: 2.7 },
    rspPosition: { x: 2, y: 3, z: 1.2 },
    seatingPositions: [{ id: "seat-1", x: 2, y: 3, z: 1.2 }],
    sources: [{ id: "sub-1", modelKey: "SUB2-12", x: 1, y: 0.5, z: 0.3 }],
    selectedP14TargetDb: 112,
    p14TargetBasis: "minimum",
    p14TargetLevel: 2,
    p18TargetBasis: "minimum",
    selectedP18RequiredExtensionHz: 35,
    assessmentStartHz: 20,
    assessmentEndHz: 200,
    optimisationTransitionHz: 120,
    usableLfHz: 20,
    eqConstraints: { maxBoostDb: 6, maxCutDb: 15, maxPerFilterBoostDb: 6, maxPerFilterCutDb: 15 },
  };
}

export function runP14TargetLifecycleFixtures() {
  const checks = [];
  const check = (name, passed, actual = null) => checks.push({ name, passed: passed === true, actual });

  const minimumView = baseInputs();
  const recommendedView = {
    ...baseInputs(),
    p18TargetBasis: "recommended",
    selectedP18RequiredExtensionHz: 30,
  };
  check(
    "P18 grading view does not change calibration fingerprint",
    computeCalibrationFingerprint(minimumView) === computeCalibrationFingerprint(recommendedView),
  );
  check(
    "P18 grading view does not change base-design fingerprint",
    computeBaseDesignFingerprint(minimumView) === computeBaseDesignFingerprint(recommendedView),
  );

  const changedRoom = { ...baseInputs(), roomDims: { widthM: 4.2, lengthM: 6, heightM: 2.7 } };
  check(
    "Acoustic room change invalidates base-design fingerprint",
    computeBaseDesignFingerprint(minimumView) !== computeBaseDesignFingerprint(changedRoom),
  );

  const targets = buildP14TargetCombinations();
  const keys = targets.map((target) => target.key);
  const expectedKeys = [
    "minimum-L1", "minimum-L2", "minimum-L3", "minimum-L4",
    "recommended-L1", "recommended-L2", "recommended-L3", "recommended-L4",
  ];
  check("Canonical target family contains exactly eight unique targets",
    targets.length === 8 && new Set(keys).size === 8, keys);
  check("Canonical target family keys are complete",
    expectedKeys.every((key) => keys.includes(key)), keys);
  const selectedTargetKey = "minimum-L2";
  const backgroundQueue = targets.filter((target) => target.key !== selectedTargetKey);
  check("Selected target is excluded until foreground completion; seven remain",
    backgroundQueue.length === 7 && backgroundQueue.every((target) => target.key !== selectedTargetKey),
    backgroundQueue.map((target) => target.key));
  check("Cached worker contracts use display-independent P18 identity",
    targets.every((target) => target.p18TargetBasis === "minimum"));
  check("Base fingerprint carries v31 result schema",
    BASS_RESULT_SCHEMA_VERSION === 31 && computeBaseDesignFingerprint(minimumView).endsWith("|rs:31"),
    computeBaseDesignFingerprint(minimumView));

  const passed = checks.filter((item) => item.passed).length;
  return { checks, passed, total: checks.length, allPassed: passed === checks.length };
}
