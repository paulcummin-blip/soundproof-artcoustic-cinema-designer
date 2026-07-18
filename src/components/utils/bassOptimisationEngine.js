import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";
import { calculateDesignEqCurve } from "@/components/utils/designEqCalibration";
import { getSystemSourceCapability } from "@/components/utils/subwooferCapability";

const P14_TARGETS = [
  { level: "L1", value: 1, spl: 114, extensionHz: 30 },
  { level: "L2", value: 2, spl: 117, extensionHz: 25 },
  { level: "L3", value: 3, spl: 120, extensionHz: 18 },
  { level: "L4", value: 4, spl: 123, extensionHz: 15 },
];
const P19_TOLERANCES = [5, 4, 3, 2];
const isNumber = (value) => Number.isFinite(Number(value));

function median(values) {
  const sorted = values.filter(isNumber).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function interpolate(curve, frequency) {
  if (!curve.length) return null;
  if (frequency <= curve[0].frequency) return curve[0].spl;
  if (frequency >= curve[curve.length - 1].frequency) return curve[curve.length - 1].spl;
  const highIndex = curve.findIndex((point) => point.frequency >= frequency);
  const low = curve[highIndex - 1];
  const high = curve[highIndex];
  const ratio = (frequency - low.frequency) / (high.frequency - low.frequency);
  return low.spl + ((high.spl - low.spl) * ratio);
}

function houseOffset(frequency) {
  const anchors = [[15, 6], [30, 6], [40, 5], [50, 4], [63, 3], [80, 2.5], [100, 2], [120, 1.5], [150, 1.2], [200, 0.8]];
  if (frequency <= anchors[0][0]) return anchors[0][1];
  for (let index = 1; index < anchors.length; index += 1) {
    const [highHz, highDb] = anchors[index];
    const [lowHz, lowDb] = anchors[index - 1];
    if (frequency <= highHz) return lowDb + (((frequency - lowHz) / (highHz - lowHz)) * (highDb - lowDb));
  }
  return 0;
}

function levelForP14(value) {
  return [...P14_TARGETS].reverse().find((target) => value >= target.spl)?.value || 0;
}

function levelForP19(variationDb) {
  return P19_TOLERANCES.findIndex((tolerance) => variationDb <= tolerance) + 1 || 0;
}

function levelLabel(value) {
  return value > 0 ? `L${value}` : "FAIL";
}

function extensionResult(curve) {
  let best = null;
  P14_TARGETS.forEach((target) => {
    const cutoff = target.spl - 3;
    const firstValid = curve.find((point) => point.frequency >= 10 && point.spl >= cutoff);
    if (firstValid && firstValid.frequency <= target.extensionHz) best = { ...target, frequencyHz: firstValid.frequency };
  });
  return best ? { level: best.value, frequencyHz: best.frequencyHz } : { level: 0, frequencyHz: null };
}

function rankCandidate(candidate, mode) {
  const levels = [candidate.achievedP14Level, candidate.achievedP18Level, candidate.achievedP19Level];
  const lowestLevel = Math.min(...levels);
  const totalLevel = levels.reduce((sum, level) => sum + level, 0);
  if (mode === "spl") return [candidate.achievedP14Level, candidate.achievedP14Db ?? -Infinity, candidate.requestedTargetSpl];
  if (mode === "extension") return [candidate.achievedP18Level, -(candidate.achievedP18FrequencyHz ?? Infinity), candidate.achievedP14Level];
  if (mode === "accuracy") return [candidate.achievedP19Level, -(candidate.achievedP19VariationDb ?? Infinity), candidate.achievedP14Level];
  return [lowestLevel, totalLevel, candidate.achievedP14Level, candidate.achievedP14Db ?? -Infinity];
}

function compareCandidates(a, b, mode) {
  const aRank = rankCandidate(a, mode);
  const bRank = rankCandidate(b, mode);
  for (let index = 0; index < aRank.length; index += 1) {
    if (aRank[index] !== bRank[index]) return bRank[index] - aRank[index];
  }
  return 0;
}

function buildCandidate({ rawCurve, activeSubs, usableLfHz, transitionHz, target, priorityMode }) {
  const eq = calculateDesignEqCurve(rawCurve, usableLfHz, activeSubs, { requestedSystemOutputDb: target.spl });
  const reference = median(eq.curve.filter((point) => point.frequency >= 150 && point.frequency <= 200).map((point) => point.spl));
  const gainToTargetDb = isNumber(reference) ? target.spl - reference : 0;
  const capabilityLimitedFrequencies = [];
  const finalPostEqCurve = eq.curve.map((point) => {
    const requestedSpl = point.spl + gainToTargetDb;
    const capabilityDb = getSystemSourceCapability(activeSubs, point.frequency);
    const spl = isNumber(capabilityDb) ? Math.min(requestedSpl, capabilityDb) : requestedSpl;
    if (isNumber(capabilityDb) && requestedSpl > capabilityDb) capabilityLimitedFrequencies.push(point.frequency);
    return { frequency: point.frequency, spl };
  });
  const smoothed = applyBassSmoothing(finalPostEqCurve, "third");
  const p14Band = smoothed.filter((point) => point.frequency >= 30 && point.frequency <= 120);
  const achievedP14Db = p14Band.length ? Math.min(...p14Band.map((point) => point.spl)) : null;
  const achievedP14Level = isNumber(achievedP14Db) ? levelForP14(achievedP14Db) : 0;
  const p18 = extensionResult(smoothed);
  const p19Band = smoothed.filter((point) => point.frequency >= 15 && point.frequency <= transitionHz);
  const p19VariationDb = p19Band.length ? Math.max(...p19Band.map((point) => Math.abs(point.spl - (target.spl + houseOffset(point.frequency))))) : null;
  const achievedP19Level = isNumber(p19VariationDb) ? levelForP19(p19VariationDb) : 0;
  const allAtLeastL1 = achievedP14Level >= 1 && p18.level >= 1 && achievedP19Level >= 1;
  const rejectionReason = allAtLeastL1 ? null : [
    achievedP14Level < 1 && "P14 cannot maintain 114 dB through the L1 bass range",
    p18.level < 1 && "P18 cannot achieve the L1 30 Hz extension requirement",
    achievedP19Level < 1 && "P19 exceeds the ±5 dB house-curve tolerance",
  ].filter(Boolean).join("; ");
  return {
    requestedP14Level: target.level,
    requestedTargetSpl: target.spl,
    achievedP14Db,
    achievedP14Level,
    achievedP18Level: p18.level,
    achievedP18FrequencyHz: p18.frequencyHz,
    achievedP19Level,
    achievedP19VariationDb: p19VariationDb,
    generatedFilterBank: eq.filters,
    finalPostEqCurve,
    capabilityLimitedFrequencies,
    allAtLeastL1,
    rejectionReason,
    priorityMode,
  };
}

export function optimiseBassSystem({ rawCurve = [], activeSubs = [], usableLfHz = null, transitionHz = 120, priorityMode = "balanced" }) {
  const selectedMode = ["balanced", "spl", "extension", "accuracy"].includes(priorityMode) ? priorityMode : "balanced";
  if (!rawCurve.length || !activeSubs.length) {
    return { selectedMode, selectedP14TargetDb: null, achievedP14Level: "FAIL", achievedP14Db: null, achievedP18Level: "FAIL", achievedP18FrequencyHz: null, achievedP19Level: "FAIL", achievedP19VariationDb: null, selectedFilters: [], finalPostEqCurve: [], capabilityLimitedFrequencies: [], candidates: [], rejectedCandidates: [], warningCode: "MISSING_BASS_INPUT", warningMessage: "A raw response curve and at least one active subwoofer are required." };
  }
  const candidates = P14_TARGETS.map((target) => buildCandidate({ rawCurve, activeSubs, usableLfHz, transitionHz, target, priorityMode: selectedMode }));
  const validCandidates = candidates.filter((candidate) => candidate.allAtLeastL1);
  const pool = selectedMode === "balanced" ? validCandidates : candidates;
  const selected = [...pool].sort((a, b) => compareCandidates(a, b, selectedMode))[0] || null;
  const rejectedCandidates = candidates.filter((candidate) => !candidate.allAtLeastL1);
  if (!selected) {
    return { selectedMode, selectedP14TargetDb: null, achievedP14Level: "FAIL", achievedP14Db: null, achievedP18Level: "FAIL", achievedP18FrequencyHz: null, achievedP19Level: "FAIL", achievedP19VariationDb: null, selectedFilters: [], finalPostEqCurve: [], capabilityLimitedFrequencies: [], candidates, rejectedCandidates, warningCode: "NO_L1_BALANCED_SOLUTION", warningMessage: "No credible calibration reaches Level 1 for P14, P18, and P19 together." };
  }
  return {
    selectedMode,
    selectedP14TargetDb: selected.requestedTargetSpl,
    achievedP14Level: levelLabel(selected.achievedP14Level),
    achievedP14Db: selected.achievedP14Db,
    achievedP18Level: levelLabel(selected.achievedP18Level),
    achievedP18FrequencyHz: selected.achievedP18FrequencyHz,
    achievedP19Level: levelLabel(selected.achievedP19Level),
    achievedP19VariationDb: selected.achievedP19VariationDb,
    selectedFilters: selected.generatedFilterBank,
    finalPostEqCurve: selected.finalPostEqCurve,
    capabilityLimitedFrequencies: selected.capabilityLimitedFrequencies,
    selectedCandidate: selected,
    candidates,
    rejectedCandidates,
    warningCode: selected.allAtLeastL1 ? null : "PRIORITY_MODE_BELOW_L1",
    warningMessage: selected.allAtLeastL1 ? null : "The selected manual priority leaves one or more bass parameters below Level 1.",
  };
}