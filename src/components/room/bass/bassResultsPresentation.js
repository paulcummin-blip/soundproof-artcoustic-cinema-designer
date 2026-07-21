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

function displayValue(key, value) {
  if (!isFiniteNumber(value)) return "";
  const number = Number(value).toFixed(1);
  if (key === "p18") return `${number} Hz`;
  if (key === "p19" || key === "p20") return `±${number} dB`;
  return `${number} dB`;
}

function readyPill(key, parameter) {
  const label = key.toUpperCase();
  if (parameter?.status === "not_applicable") return { text: `${label} N/A`, level: "N/A" };
  if (parameter?.level == null) return { text: `${label} —`, level: "—" };
  const grade = parameter.level === 0 ? "FAIL" : `L${parameter.level}`;
  const value = displayValue(key, parameter.value);
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
    if (!isReady) return [key, { text: `${key.toUpperCase()} —`, level: "—" }];
    return [key, readyPill(key, parameters[key])];
  }));

  const isRsp = !seatId || seatId === "rsp" || seatId === "mlp";
  if (isReady && !isRsp) {
    const seat = result?.selectedCandidate?.perSeatDiagnostics?.find((item) => String(item.seatId) === String(seatId));
    pills.p19 = isFiniteNumber(seat?.maxAbsDeviationDb)
      ? { text: `Target · ±${Number(seat.maxAbsDeviationDb).toFixed(1)} dB`, level: "—", diagnostic: true }
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