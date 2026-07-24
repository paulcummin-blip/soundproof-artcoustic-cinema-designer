import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { assessBassOperatingPoint } from "@/components/utils/bassOperatingPointAuthority";
import { buildCanonicalAbsoluteHouseCurveTarget } from "@/components/utils/houseCurveTargetAuthority";

const REFERENCE_AMPLITUDE = Math.pow(10, 94 / 20);
const FREQUENCIES = [15, 18, 20, 25, 30, 40, 60, 80, 100, 120];
const subs = (modelKey, count) => Array.from({ length: count }, (_, index) => ({
  id: `${modelKey}-${index + 1}`,
  modelKey,
}));

function transfers(activeSubs, roomTransferDb) {
  const scale = REFERENCE_AMPLITUDE * Math.pow(10, roomTransferDb / 20);
  return activeSubs.map((sub) => ({
    sourceId: sub.id,
    points: FREQUENCIES.map((frequency) => ({ frequency, re: scale, im: 0 })),
  }));
}

function assess(modelKey, count, roomTransferDb) {
  const activeSubs = subs(modelKey, count);
  return assessBassOperatingPoint({
    activeSubs,
    perSourceComplexTransfers: transfers(activeSubs, roomTransferDb),
    requestedLevel: 4,
  });
}

export function runBassOperatingPointAuthorityFixtures() {
  const checks = [];
  const check = (test, expected, actual, passed) => checks.push({ test, expected, actual, delta: passed ? 0 : 1, passed });
  const fourSub4 = assess("sub4-12", 4, -12);
  const oneSub2 = assess("sub2-12", 1, -5);
  const compactRoom = assess("sub2-12", 2, -4);
  const largeRoom = assess("sub2-12", 2, -10);

  check(
    "4 × SUB4-12 selects a high operating point",
    "L3/L4",
    `L${fourSub4.selectedOperatingLevel}`,
    fourSub4.selectedOperatingLevel >= 3,
  );
  check(
    "1 × SUB2-12 selects L1",
    "L1",
    `L${oneSub2.selectedOperatingLevel}`,
    oneSub2.selectedOperatingLevel === 1,
  );
  check(
    "Larger-room transfer loss cannot raise the operating point",
    `≤ L${compactRoom.selectedOperatingLevel}`,
    `L${largeRoom.selectedOperatingLevel}`,
    largeRoom.selectedOperatingLevel <= compactRoom.selectedOperatingLevel,
  );

  const target = buildCanonicalAbsoluteHouseCurveTarget({
    frequencyGrid: [20, 40, 80, 120, 200],
    targetAnchorDb: fourSub4.targetAnchorDb,
    correctionStartHz: 20,
    correctionEndHz: 200,
  });
  const shapePreserved = target.every((point) => (
    Math.abs((point.spl - fourSub4.targetAnchorDb) - artcousticHouseCurveOffsetAt(point.frequency)) < 1e-9
  ));
  check(
    "Canonical target preserves the Artcoustic shape at the selected anchor",
    true,
    shapePreserved,
    shapePreserved,
  );

  return {
    checks,
    results: { fourSub4, oneSub2, compactRoom, largeRoom },
    passed: checks.filter((item) => item.passed).length,
    total: checks.length,
    allPassed: checks.every((item) => item.passed),
  };
}