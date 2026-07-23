import { formatP20Deviation } from "@/components/utils/rp22/levels";
import { p20SummaryFromResults } from "@/components/room/bass/p20SeatPresentation";

const PARAM_KEYS = ["p14", "p18", "p19", "p20"];

const isFiniteNumber = (value) => Number.isFinite(Number(value));
const secondsSince = (startedAtMs, nowMs) => Number.isFinite(startedAtMs)
  ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1000))
  : 0;

function readyMatchesCurrent(result) {
  const requested = result?.job?.currentJobFingerprint;
  const completed = result?.job?.resultFingerprint;
  return !!requested && completed === requested && !!result?.selectedCandidate;
}

const normalizeIntegerNoise = (value) => {
  const number = Number(value);
  const nearestInteger = Math.round(number);
  return Math.abs(number - nearestInteger) <= 1e-8 ? nearestInteger : number;
};

export function formatBassParameterValue(key, value) {
  if (!isFiniteNumber(value)) return "";
  const number = normalizeIntegerNoise(value);
  if (key === "p14") return `${Math.floor(number + 1e-8)} dBC`;
  if (key === "p18") return `${Math.floor(number)} Hz`;
  if (key === "p19") return `±${Math.floor(Math.abs(number))} dB`;
  if (key === "p20") return formatP20Deviation(number);
  return `${number.toFixed(1)} dB`;
}

function parameterLabel(key, result) {
  if (key === "p14") return "Estimated LFE Capability";
  if (key === "p18") return "Bass Extension";
  if (key === "p19") return "Seat Consistency";
  if (key === "p20") return "Worst Seat Performance";
  return key.toUpperCase();
}

function readyPill(key, parameter, result) {
  const label = parameterLabel(key, result);
  if (parameter?.status === "not_applicable") return { text: `${label} N/A`, level: "N/A" };
  if (key === "p20") {
    const worst = p20SummaryFromResults(result?.selectedCandidate?.perSeatP20Results);
    return worst ? { text: `Worst Seat Performance · ${worst.level} · ${worst.displayVariationDb}`, level: worst.level } : { text: "Worst Seat Performance —", level: "—" };
  }
  if (parameter?.status === "error") return { text: `${label} error`, level: "—" };
  if (parameter?.level == null) return { text: `${label} —`, level: "—" };
  const grade = parameter.level === 0 ? "FAIL" : `L${parameter.level}`;
  const value = formatBassParameterValue(key, parameter.value);
  const basis = key === "p14" && parameter.targetBasis
    ? ` — ${parameter.targetBasis === "recommended" ? "Recommended" : "Minimum"} target`
    : "";
  return {
    text: `${label} ${grade}${value ? ` · ${value}` : ""}${basis}`,
    level: grade,
    detail: key === "p14" ? parameter.targetBasisDetail : null,
  };
}

export function formatBassResults(result, nowMs = Date.now(), seatId = null) {
  const status = result?.job?.status || "idle";
  const timerStart = result?.job?.startedAtMs ?? result?.job?.queuedAtMs;
  const elapsedSeconds = secondsSince(timerStart, nowMs);
  const isQueued = status === "queued";
  const isUpdating = ["stale", "calculating", "running"].includes(status) ||
    (["ready", "complete"].includes(status) && !readyMatchesCurrent(result));
  const isReady = ["ready", "complete"].includes(status) && readyMatchesCurrent(result);
  const parameters = result?.productAnalysis?.parameters || {};
  const pills = Object.fromEntries(PARAM_KEYS.map((key) => {
    const label = parameterLabel(key, result);
    if (isQueued) return [key, { text: `${label} Queued`, level: "—" }];
    if (isUpdating) return [key, { text: `${label} Updating · ${elapsedSeconds} s`, level: "—" }];
    if (status === "error") return [key, { text: `${label} error`, level: "—" }];
    if (!isReady) return [key, { text: `${label} —`, level: "—" }];
    return [key, readyPill(key, parameters[key], result)];
  }));

  let statusText = "Waiting for complete design";
  if (isQueued) statusText = "Analysis queued";
  if (isUpdating) statusText = `Updating bass analysis · ${elapsedSeconds} s`;
  if (isReady) statusText = result?.job?.cacheStatus === "hit" ? "Restored from cache" : "Analysis ready";
  if (status === "error") statusText = result?.job?.errorMessage || "Analysis failed · Retry";

  return {
    pills,
    statusText,
    isReady,
    isUpdating,
    elapsedSeconds,
    selectedMode: result?.selectedMode || "balanced",
    parameterValues: Object.fromEntries(PARAM_KEYS.map((key) => [key, parameters[key]?.value ?? null])),
    resultFingerprint: result?.job?.resultFingerprint || null,
    selectedCandidateId: result?.selectedCandidateId || null,
  };
}

export const engineeringDetailsVisible = (includeDiagnostics) => includeDiagnostics === true;