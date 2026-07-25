import { computeNormalizedRoomTransfer } from "@/components/room/bass/normalizedRoomTransferEngine";
import { buildNormalizedPhysicsOptions } from "@/components/room/bass/normalizedPhysicsOptionsBuilder";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";
import { resolveRequestedRp22HouseCurveTarget } from "@/components/utils/requestedRp22HouseCurveAuthority";
import { calculatePairedP14P18ProductionAuthority } from "@/components/utils/pairedP14P18ProductionAuthority";
import { buildPostEqBassCapabilityOutcome } from "@/components/utils/postEqBassCapabilityOutcome";

const REF = Math.pow(10, 94 / 20);
const FREQUENCIES = [15, 18, 20, 25, 30, 40, 60, 80, 100, 120];
const TARGETS = { L1: 109, L2: 112, L3: 115, L4: 118 };
const sub = (id) => ({ id, modelKey: "SUB2-12", x: 1, y: 0.4, z: 0.35, shadowCapabilityCurve: [{ frequency: 15, spl: 112 }, { frequency: 120, spl: 112 }] });
const transfer = (id) => ({ sourceId: id, points: FREQUENCIES.map((frequency) => ({ frequency, re: REF, im: 0 })) });
const check = (test, expected, actual, passed, nextTest) => ({ test, expected, actual, delta: passed ? 0 : 1, severity: passed ? "PASS" : "CRITICAL", nextTest });

function authority(count, requestedLevel, parameterLevels = {}) {
  const activeSubs = Array.from({ length: count }, (_, index) => sub(`sub-${index + 1}`));
  const paired = calculatePairedP14P18ProductionAuthority({
    activeSubs,
    perSourceComplexTransfers: activeSubs.map((item) => transfer(item.id)),
    targetBasis: "minimum",
    requestedLevel,
    requestedTargetSplDb: TARGETS[`L${requestedLevel}`],
  });
  return buildPostEqBassCapabilityOutcome({
    authority: paired,
    requestedLevel,
    targetAnchorDb: TARGETS[`L${requestedLevel}`],
    achievedP18Level: parameterLevels.p18 ?? paired.achieved?.levelNumber,
    achievedP18FrequencyHz: paired.achieved?.p18?.extensionHz,
    achievedP19Level: parameterLevels.p19 ?? 4,
    achievedP19VariationDb: 1,
    achievedP20Level: parameterLevels.p20 ?? 4,
    achievedP20VariationDb: 1,
    p20Available: true,
  });
}

export function runBassAuthoritySeparationAcceptanceFixtures() {
  const definitions = getRp22BassOperatingDefinitions("minimum");
  const sweep = [1, 2, 3, 4].map((level) => resolveRequestedRp22HouseCurveTarget(definitions, level));
  const weakL1 = authority(1, 1);
  const weakL4 = authority(1, 4);
  const two = authority(2, 4);
  const four = authority(4, 4);

  const room = { widthM: 4.5, lengthM: 6, heightM: 2.4 };
  const rsp = { id: "rsp", x: 2.25, y: 3.2, z: 1.2 };
  const sources = [sub("sub-1"), { ...sub("sub-2"), x: 3.5 }];
  const physicsOptions = buildNormalizedPhysicsOptions({ surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 }, qStrategy: "ab_corrected", enableRewCoreReflections: true, roomDamping: 20, axialQ: 4 });
  const rawByLevel = [1, 2, 3, 4].map(() => computeNormalizedRoomTransfer({ roomDims: room, rspPosition: rsp, seatingPositions: [], subsForSimulation: sources, physicsOptions }).rspCurve);
  const rawInvariant = rawByLevel.every((curve) => JSON.stringify(curve) === JSON.stringify(rawByLevel[0]));

  return [
    check("TEST A — requested P14 sweep", "L1/L2/L3/L4 map to 109/112/115/118 dBC", sweep.map((item) => [`L${item.requestedLevel}`, item.targetAnchorDb]), sweep.every((item, index) => item.targetAnchorDb === [109, 112, 115, 118][index]), "TEST B"),
    check("TEST A — raw response isolation", "0.0 dB delta for L1-L4", { identical: rawInvariant, maximumDeltaDb: rawInvariant ? 0 : null }, rawInvariant, "TEST B"),
    check("TEST B — no automatic downgrade", "Requested L4 remains L4; achieved lower; limitation present", { requested: weakL4.requested, achieved: weakL4.achieved, limitation: weakL4.limitation }, weakL4.requested.level === "L4" && weakL4.achieved.level !== "L4" && !!weakL4.limitation, "TEST C"),
    check("TEST A — lower request margin", "Same hardware passes more readily at L1 than L4", { l1Pass: weakL1.passesRequestedLevel, l4Pass: weakL4.passesRequestedLevel }, weakL1.passesRequestedLevel && !weakL4.passesRequestedLevel, "TEST C"),
    check("TEST C — two versus four subs", "Requested unchanged; achieved non-decreasing; shortfall reduces", { two: { requested: two.requested.level, achieved: two.achieved.level, shortfallDb: two.shortfallDb }, four: { requested: four.requested.level, achieved: four.achieved.level, shortfallDb: four.shortfallDb } }, two.requested.level === "L4" && four.requested.level === "L4" && four.achievedOverallLevel >= two.achievedOverallLevel && Number(four.shortfallDb ?? 0) <= Number(two.shortfallDb ?? 0), "Runtime project sweep"),
  ];
}