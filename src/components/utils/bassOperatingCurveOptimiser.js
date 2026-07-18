import { calculateDesignEqCurve } from "@/components/utils/designEqCalibration";
import { computeParam14LfeCapability, computeParam18BassExtension, computeP19DeviationBelowSchroeder } from "@/components/utils/rp22BassMetrics";
import { getSystemSourceCapability } from "@/components/utils/subwooferCapability";

const LEVELS = ["L1", "L2", "L3", "L4"];
const number = (value) => Number.isFinite(Number(value));
const levelValue = (value) => LEVELS.indexOf(value) + 1;
const levelLabel = (value) => value > 0 ? `L${value}` : "FAIL";

function houseOffset(frequency) {
  const anchors = [[15, 6], [30, 6], [40, 5], [50, 4], [63, 3], [80, 2.5], [100, 2], [120, 1.5], [150, 1.2], [200, 0.8]];
  if (frequency <= anchors[0][0]) return anchors[0][1];
  for (let index = 1; index < anchors.length; index += 1) {
    const [highHz, highDb] = anchors[index];
    const [lowHz, lowDb] = anchors[index - 1];
    if (frequency <= highHz) return lowDb + ((frequency - lowHz) / (highHz - lowHz)) * (highDb - lowDb);
  }
  return 0;
}

function median(values) {
  const sorted = values.filter(number).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function capabilityRanges(frequencies) {
  const values = [...new Set(frequencies.filter(number).map((value) => Math.round(value * 10) / 10))].sort((a, b) => a - b);
  const groups = [];
  values.forEach((frequency) => {
    const group = groups[groups.length - 1];
    if (group && frequency - group.endHz <= 0.51) group.endHz = frequency;
    else groups.push({ startHz: frequency, endHz: frequency });
  });
  return groups.map(({ startHz, endHz }) => startHz === endHz ? `${Math.round(startHz)} Hz` : `${Math.round(startHz)}–${Math.round(endHz)} Hz`);
}

function rank(candidate, mode) {
  const levels = [candidate.achievedP14Level, candidate.achievedP18Level, candidate.achievedP19Level];
  const lowest = Math.min(...levels);
  const spread = Math.max(...levels) - lowest;
  const total = levels.reduce((sum, value) => sum + value, 0);
  if (mode === "spl") return [candidate.achievedP14Level, candidate.achievedP14Db, -candidate.achievedP18FrequencyHz, -candidate.achievedP19VariationDb];
  if (mode === "extension") return [candidate.achievedP18Level, -candidate.achievedP18FrequencyHz, candidate.achievedP14Level, -candidate.achievedP19VariationDb];
  if (mode === "accuracy") return [candidate.achievedP19Level, -candidate.achievedP19VariationDb, -candidate.achievedP18FrequencyHz, candidate.achievedP14Db];
  return [lowest, -spread, total, -candidate.achievedP19VariationDb, candidate.achievedP14Db];
}

function select(candidates, mode) {
  return [...candidates].sort((a, b) => {
    const aRank = rank(a, mode);
    const bRank = rank(b, mode);
    for (let index = 0; index < aRank.length; index += 1) {
      if (aRank[index] !== bRank[index]) return bRank[index] - aRank[index];
    }
    return 0;
  })[0] || null;
}

function buildCandidate({ rawCurve, activeSubs, usableLfHz, transitionHz, operatingTargetDb }) {
  const reference = median(rawCurve.filter((point) => point.frequency >= 150 && point.frequency <= 200).map((point) => point.spl));
  const gainToTargetDb = number(reference) ? operatingTargetDb - reference : 0;
  const operatingCurve = rawCurve.map((point) => ({ ...point, spl: point.spl + gainToTargetDb }));
  const eq = calculateDesignEqCurve(operatingCurve, usableLfHz, activeSubs, { requestedSystemOutputDb: operatingTargetDb });
  const capabilityLimitedFrequencies = [];
  const finalPostEqCurve = eq.curve.map((point) => {
    const capabilityDb = getSystemSourceCapability(activeSubs, point.frequency);
    const spl = number(capabilityDb) ? Math.min(point.spl, capabilityDb) : point.spl;
    if (number(capabilityDb) && point.spl > capabilityDb) capabilityLimitedFrequencies.push(point.frequency);
    return { frequency: point.frequency, spl };
  });
  const freqsHz = finalPostEqCurve.map((point) => point.frequency);
  const splDb = finalPostEqCurve.map((point) => point.spl);
  const p14 = computeParam14LfeCapability(finalPostEqCurve, false);
  const p18 = computeParam18BassExtension(finalPostEqCurve, p14);
  const p19 = computeP19DeviationBelowSchroeder({
    freqsHz,
    splDb,
    targetDb: freqsHz.map((frequency) => operatingTargetDb + houseOffset(frequency)),
    schroederHz: transitionHz,
  });
  const achievedP14Db = p14?.value ?? null;
  const achievedP14Level = levelValue(p14?.level);
  const achievedP18Level = levelValue(p18?.level);
  const achievedP18FrequencyHz = p18?.value ?? null;
  const achievedP19VariationDb = p19?.resultDb ?? null;
  const achievedP19Level = achievedP19VariationDb == null ? 0 : achievedP19VariationDb <= 2 ? 4 : achievedP19VariationDb <= 3 ? 3 : achievedP19VariationDb <= 4 ? 2 : achievedP19VariationDb <= 5 ? 1 : 0;
  const allAtLeastL1 = achievedP14Level >= 1 && achievedP18Level >= 1 && achievedP19Level >= 1;
  const rejectionReason = [
    achievedP14Level < 1 && "P14 is below 114 dB",
    achievedP18Level < 1 && "P18 does not meet the 30 Hz L1 extension limit",
    achievedP19Level < 1 && "P19 exceeds the ±5 dB house-curve tolerance",
  ].filter(Boolean).join("; ");
  return { operatingTargetDb, requestedTargetSpl: operatingTargetDb, requestedP14Level: `Target ${operatingTargetDb.toFixed(1)} dB`, achievedP14Db, achievedP14Level, achievedP18Level, achievedP18FrequencyHz, achievedP19Level, achievedP19VariationDb, generatedFilterBank: eq.filters, finalPostEqCurve, capabilityLimitedFrequencies, capabilityLimitedRanges: capabilityRanges(capabilityLimitedFrequencies), allAtLeastL1, rejectionReason };
}

function meaningfulCandidates(validCandidates, selected) {
  const distinct = [];
  validCandidates.forEach((candidate) => {
    const key = [candidate.achievedP14Level, candidate.achievedP18Level, candidate.achievedP19Level].join("-");
    if (!distinct.some((entry) => entry.key === key)) distinct.push({ key, candidate });
  });
  const candidates = distinct.map((entry) => entry.candidate);
  if (selected && !candidates.includes(selected)) candidates.push(selected);
  return candidates.sort((a, b) => b.operatingTargetDb - a.operatingTargetDb);
}

export function optimiseBassSystem({ rawCurve = [], activeSubs = [], usableLfHz = null, transitionHz = 120, priorityMode = "balanced" }) {
  const selectedMode = ["balanced", "spl", "extension", "accuracy"].includes(priorityMode) ? priorityMode : "balanced";
  if (!rawCurve.length || !activeSubs.length) return { selectedMode, achievedP14Level: "FAIL", achievedP14Db: null, achievedP18Level: "FAIL", achievedP18FrequencyHz: null, achievedP19Level: "FAIL", achievedP19VariationDb: null, selectedFilters: [], finalPostEqCurve: [], candidates: [], displayCandidates: [], rejectedCandidates: [], warningCode: "MISSING_BASS_INPUT", warningMessage: "A raw response curve and at least one active subwoofer are required." };
  const capabilityBand = rawCurve.filter((point) => point.frequency >= 20 && point.frequency <= 120).map((point) => getSystemSourceCapability(activeSubs, point.frequency)).filter(number);
  const maximumCredibleTargetDb = capabilityBand.length ? Math.max(114, Math.min(123, Math.floor(Math.min(...capabilityBand) * 2) / 2)) : 123;
  const targets = [];
  for (let target = maximumCredibleTargetDb; target >= 114; target -= 0.5) targets.push(Math.round(target * 2) / 2);
  const candidates = targets.map((operatingTargetDb) => buildCandidate({ rawCurve, activeSubs, usableLfHz, transitionHz, operatingTargetDb }));
  const validCandidates = candidates.filter((candidate) => candidate.allAtLeastL1);
  const selectedByMode = Object.fromEntries(["balanced", "spl", "extension", "accuracy"].map((mode) => [mode, select(validCandidates, mode)]));
  const selected = selectedByMode[selectedMode];
  const highestInvalidCandidate = candidates.find((candidate) => !candidate.allAtLeastL1) || null;
  if (!selected) return { selectedMode, selectedP14TargetDb: null, achievedP14Level: "FAIL", achievedP14Db: null, achievedP18Level: "FAIL", achievedP18FrequencyHz: null, achievedP19Level: "FAIL", achievedP19VariationDb: null, selectedFilters: [], finalPostEqCurve: [], candidates, displayCandidates: [], rejectedCandidates: candidates, highestInvalidCandidate, selectedByMode, warningCode: "NO_VALID_OPERATING_CURVE", warningMessage: "No calibrated operating curve meets Level 1 for P14, P18, and P19 after searching from the credible maximum down to 114 dB." };
  return { selectedMode, selectedP14TargetDb: selected.operatingTargetDb, achievedP14Level: levelLabel(selected.achievedP14Level), achievedP14Db: selected.achievedP14Db, achievedP18Level: levelLabel(selected.achievedP18Level), achievedP18FrequencyHz: selected.achievedP18FrequencyHz, achievedP19Level: levelLabel(selected.achievedP19Level), achievedP19VariationDb: selected.achievedP19VariationDb, selectedFilters: selected.generatedFilterBank, finalPostEqCurve: selected.finalPostEqCurve, capabilityLimitedFrequencies: selected.capabilityLimitedFrequencies, capabilityLimitedRanges: selected.capabilityLimitedRanges, selectedCandidate: selected, candidates, displayCandidates: meaningfulCandidates(validCandidates, selected), rejectedCandidates: candidates.filter((candidate) => !candidate.allAtLeastL1), highestInvalidCandidate, selectedByMode, warningCode: null, warningMessage: null };
}