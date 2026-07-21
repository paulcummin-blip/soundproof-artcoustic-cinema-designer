import { formatP20Deviation } from "@/components/utils/rp22/levels";

const PARAM_KEYS = ["p14", "p18", "p19", "p20"];

const isFiniteNumber = (value) => Number.isFinite(Number(value));
const secondsSince = (startedAtMs, nowMs) => Number.isFinite(startedAtMs)
  ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1000))
  : 0;

function readyMatchesCurrent(result) {
  const current = result?.fingerprints?.calibration;
  const completed = result?.job?.resultFingerprint;
  return !!current && completed === current && !!result?.selectedCandidate;
}

const normalizeIntegerNoise = (value) => {
  const number = Number(value);
  const nearestInteger = Math.round(number);
  return Math.abs(number - nearestInteger) <= 1e-8 ? nearestInteger : number;
};

export function formatBassParameterValue(key, value) {
  if (!isFiniteNumber(value)) return "";
  const number = normalizeIntegerNoise(value);
  if (key === "p14") return `${Math.ceil(number)} dB`;
  if (key === "p18") return `${Math.floor(number)} Hz`;
  if (key === "p19") return `±${Math.floor(Math.abs(number))} dB`;
  if (key === "p20") return formatP20Deviation(number);
  return `${number.toFixed(1)} dB`;
}

function readyPill(key, parameter) {
  const label = key.toUpperCase();
  if (parameter?.status === "not_applicable") return { text: `${label} N/A`, level: "N/A" };
  if (parameter?.status === "error") return { text: `${label} error`, level: "—" };
  if (parameter?.level == null) return { text: `${label} —`, level: "—" };
  const grade = parameter.level === 0 ? "FAIL" : `L${parameter.level}`;
  const value = formatBassParameterValue(key, parameter.value);
  return { text: `${label} ${grade}${value ? ` · ${value}` : ""}`, level: grade };
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
    if (isQueued) return [key, { text: `${key.toUpperCase()} Queued`, level: "—" }];
    if (isUpdating) return [key, { text: `${key.toUpperCase()} Updating · ${elapsedSeconds} s`, level: "—" }];
    if (status === "error" && key === "p20") return [key, { text: "P20 error", level: "—" }];
    if (!isReady) return [key, { text: `${key.toUpperCase()} —`, level: "—" }];
    return [key, readyPill(key, parameters[key])];
  }));

  const isRsp = !seatId || seatId === "rsp" || seatId === "mlp";
  if (isReady && !isRsp) {
    const seat = result?.selectedCandidate?.perSeatDiagnostics?.find((item) => String(item.seatId) === String(seatId));
    const seatDeviation = formatBassParameterValue("p19", seat?.maxAbsDeviationDb);
    pills.p19 = seatDeviation
      ? { text: `Target · ${seatDeviation}`, level: "—", diagnostic: true }
      : { text: "Target · —", level: "—", diagnostic: true };
  }

  let statusText = "Waiting for complete design";
  if (isQueued) statusText = "Analysis queued";
  if (isUpdating) statusText = `Updating bass analysis · ${elapsedSeconds} s`;
  if (isReady) statusText = result?.job?.cacheStatus === "hit" ? "Restored from cache" : "Analysis ready";
  if (status === "error") statusText = "Analysis failed · Retry";

  return { pills, statusText, isReady, isUpdating, elapsedSeconds, selectedMode: result?.selectedMode || "balanced" };
}

export const engineeringDetailsVisible = (includeDiagnostics) => includeDiagnostics === true;