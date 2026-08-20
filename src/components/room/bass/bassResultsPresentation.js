import { resolveRp22DesignValue } from "@/components/utils/rp22/resolveRp22DesignValue";
import { buildComplianceBassPresentation } from "@/components/room/bass/bassCompliancePresentation";
import { buildP19SeatRows, p19LowestSeat, p19RspResult } from "@/components/room/bass/p19SeatPresentation";
import { buildP20SeatRows, p20WorstSeat, p20BestPrimarySeat } from "@/components/room/bass/p20SeatPresentation";

const PARAM_KEYS = ["p14", "p18", "p19", "p20"];

const isFiniteNumber = (value) => value !== null
  && value !== undefined
  && value !== ""
  && typeof value !== "boolean"
  && Number.isFinite(Number(value));
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
  if (key === "p19" || key === "p20") {
    const pid = key === "p19" ? 19 : 20;
    const designVal = resolveRp22DesignValue(pid, Math.abs(number));
    return `±${designVal} dB`;
  }
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
  if (parameter?.status === "not_applicable") return { label, resultText: "N/A", text: `${label} N/A`, level: "N/A" };
  if (parameter?.status === "error") return { label, resultText: "Error", text: `${label} error`, level: "—" };
  if (parameter?.level == null) return { label, resultText: "—", text: `${label} —`, level: "—" };
  const grade = parameter.level === 0 ? "FAIL" : `L${parameter.level}`;
  const value = formatBassParameterValue(key, parameter.value);
  if (key === "p14") {
    const basis = parameter.targetBasis === "recommended" ? "Recommended" : "Minimum";
    const basisAbbrev = basis === "Recommended" ? "Rec" : "Min";
    const selectedLevel = parameter.selectedLevel || Math.max(1, parameter.level || 1);

    // RULE 1: target achieved → P14 result = selected target level (design operating point).
    // Do not promote P14 above the selected level due to unused SPL capability.
    if (parameter.pass === true) {
      const resultText = `${basis} L${selectedLevel} · PASS`;
      return { label: "P14 Bass SPL", resultText, text: `P14 Bass SPL ${resultText}`, level: `L${selectedLevel}`, detail: null };
    }

    // RULE 2: target not achieved → P14 result = highest achievable level + FAIL.
    const achievedGrade = parameter.level === 0 ? "FAIL" : `L${parameter.level}`;
    const resultText = `${achievedGrade} · FAIL`;
    const detail = `Target: ${basisAbbrev} L${selectedLevel}`;
    return { label: "P14 Bass SPL", resultText, text: `P14 Bass SPL ${resultText}`, level: "FAIL", detail };
  }
  return {
    label,
    resultText: `${grade}${value ? ` · ${value}` : ""}`,
    text: `${label} ${grade}${value ? ` · ${value}` : ""}`,
    level: grade,
    detail: null,
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
    if (isQueued) return [key, { label, resultText: "Queued", text: `${label} Queued`, level: "—" }];
    if (isUpdating) return [key, { label, resultText: `Updating · ${elapsedSeconds} s`, text: `${label} Updating · ${elapsedSeconds} s`, level: "—" }];
    if (status === "error") return [key, { label, resultText: "Error", text: `${label} error`, level: "—" }];
    if (!isReady) return [key, { label, resultText: "—", text: `${label} —`, level: "—" }];
    return [key, readyPill(key, parameters[key], result)];
  }));

  let statusText = "Waiting for complete design";
  if (isQueued) statusText = "Analysis queued";
  if (isUpdating) statusText = `Updating bass analysis · ${elapsedSeconds} s`;
  if (isReady) statusText = result?.job?.message
    || (result?.job?.cacheStatus === "hit" ? "Restored from cache" : "Analysis ready");
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

/**
 * Official publication-gated bass result formatter.
 *
 * Only a canonically published completed result (metricPublication.
 * canonicalMetricPublicationValid === true AND authority AUTHORITATIVE)
 * may be presented as an official RP22 P14/P18/P19/P20 result.
 *
 * While calculating / updating / NOT_VERIFIED, pills show "Calculating…"
 * or "NOT VERIFIED" consistently — never preliminary live values.
 *
 * P19 and P20 are SEAT parameters:
 *   P19 compact: "RSP: Lx · ±y dB" / "Lowest Seat: Ly · ±z dB"
 *   P20 compact: "Best Primary: Lx · ±y dB" / "Lowest Seat: Ly · ±z dB"
 *
 * @param {object} completedBassAuthority - from useCompletedBassAuthority(scopeId)
 * @param {object} lifecycle - controller lifecycle snapshot
 * @param {Array} seatingPositions - appState.seatingPositions for seat priority
 * @param {number} nowMs - current timestamp for elapsed timer
 */
export function formatOfficialBassResults(completedBassAuthority, lifecycle = null, seatingPositions = [], nowMs = Date.now()) {
  const presentation = buildComplianceBassPresentation({ completedBassAuthority });
  const { publicationVerified, parameters, contract } = presentation;

  const authorityStatus = completedBassAuthority?.authorityStatus || "UNCALCULATED";
  const lifecycleStatus = lifecycle?.status || "idle";
  const isCalculating = ["calculating", "running", "queued", "stale"].includes(lifecycleStatus);
  const timerStart = lifecycle?.startedAtMs ?? lifecycle?.queuedAtMs;
  const elapsedSeconds = secondsSince(timerStart, nowMs);

  // Determine the display state
  const isAuthoritative = publicationVerified === true;
  const isNotVerified = authorityStatus === "NOT_VERIFIED";
  const isUpdating = ["UPDATING", "LOADING"].includes(authorityStatus) || isCalculating;
  const isBlocked = authorityStatus === "BLOCKED";
  const isError = authorityStatus === "ERROR";
  const isUncalculated = authorityStatus === "UNCALCULATED" && !isCalculating;

  // Per-seat arrays (publication-gated — empty when not verified)
  const perSeatP19Results = isAuthoritative
    ? (Array.isArray(contract?.selectedCandidate?.perSeatP19Results) ? contract.selectedCandidate.perSeatP19Results : [])
    : [];
  const perSeatP20Results = presentation.perSeatP20Results || [];

  // Build per-seat rows for expanded views
  const p19Rows = isAuthoritative ? buildP19SeatRows(seatingPositions, perSeatP19Results) : [];
  const p20Rows = isAuthoritative ? buildP20SeatRows(seatingPositions, perSeatP20Results) : [];

  // P19 compact: RSP + Lowest Seat
  const p19Rsp = isAuthoritative ? p19RspResult(parameters.p19) : null;
  const p19Lowest = isAuthoritative ? p19LowestSeat(p19Rows) : null;

  // P20 compact: Best Primary + Lowest Seat
  const p20BestPrimary = isAuthoritative ? p20BestPrimarySeat(p20Rows) : null;
  const p20Lowest = isAuthoritative ? p20WorstSeat(p20Rows) : null;

  const pills = {};

  // P14 — room parameter
  if (isAuthoritative) {
    const p = parameters.p14;
    pills.p14 = {
      label: "P14 Bass SPL",
      resultText: p.valueText || "—",
      text: `P14 Bass SPL ${p.valueText || "—"}`,
      level: p.level,
      detail: p.detail || null,
    };
  } else {
    pills.p14 = { label: "P14 Bass SPL", resultText: officialStateText(authorityStatus, isCalculating), text: `P14 Bass SPL ${officialStateText(authorityStatus, isCalculating)}`, level: "—" };
  }

  // P18 — room parameter
  if (isAuthoritative) {
    const p = parameters.p18;
    pills.p18 = {
      label: "P18 Extension",
      resultText: p.valueText || "—",
      text: `P18 Extension ${p.valueText || "—"}`,
      level: p.level,
      detail: p.detail || null,
    };
  } else {
    pills.p18 = { label: "P18 Extension", resultText: officialStateText(authorityStatus, isCalculating), text: `P18 Extension ${officialStateText(authorityStatus, isCalculating)}`, level: "—" };
  }

  // P19 — seat parameter (compact: RSP + Lowest Seat)
  if (isAuthoritative && p19Rsp) {
    const rspText = `RSP: ${p19Rsp.level} · ${p19Rsp.displayValue}`;
    const lowestText = p19Lowest ? `Lowest Seat: ${p19Lowest.level} · ${p19Lowest.displayVariationDb}` : null;
    pills.p19 = {
      label: "P19 Response Fit",
      resultText: rspText,
      text: `P19 Response Fit ${rspText}`,
      level: p19Rsp.level,
      detail: lowestText,
    };
  } else if (isAuthoritative) {
    pills.p19 = { label: "P19 Response Fit", resultText: "—", text: "P19 Response Fit —", level: "—", detail: null };
  } else {
    pills.p19 = { label: "P19 Response Fit", resultText: officialStateText(authorityStatus, isCalculating), text: `P19 Response Fit ${officialStateText(authorityStatus, isCalculating)}`, level: "—" };
  }

  // P20 — seat parameter (compact: Best Primary + Lowest Seat)
  if (isAuthoritative && p20BestPrimary) {
    const bestText = `Best Primary: ${p20BestPrimary.level} · ${p20BestPrimary.displayVariationDb}`;
    const lowestText = p20Lowest ? `Lowest Seat: ${p20Lowest.level} · ${p20Lowest.displayVariationDb}` : null;
    pills.p20 = {
      label: "P20 Seat Consistency",
      resultText: bestText,
      text: `P20 Seat Consistency ${bestText}`,
      level: p20BestPrimary.level,
      detail: lowestText,
    };
  } else if (isAuthoritative && p20Lowest) {
    // No Primary seats — fall back to Lowest Seat as headline
    const lowestText = `Lowest Seat: ${p20Lowest.level} · ${p20Lowest.displayVariationDb}`;
    pills.p20 = {
      label: "P20 Seat Consistency",
      resultText: lowestText,
      text: `P20 Seat Consistency ${lowestText}`,
      level: p20Lowest.level,
      detail: null,
    };
  } else if (isAuthoritative) {
    const p20Param = parameters.p20;
    if (p20Param?.status === "not_applicable") {
      pills.p20 = { label: "P20 Seat Consistency", resultText: "N/A", text: "P20 Seat Consistency N/A", level: "N/A", detail: null };
    } else {
      pills.p20 = { label: "P20 Seat Consistency", resultText: "—", text: "P20 Seat Consistency —", level: "—", detail: null };
    }
  } else {
    pills.p20 = { label: "P20 Seat Consistency", resultText: officialStateText(authorityStatus, isCalculating), text: `P20 Seat Consistency ${officialStateText(authorityStatus, isCalculating)}`, level: "—" };
  }

  // Status text
  let statusText = "Waiting for complete design";
  if (isCalculating) statusText = `Calculating… · ${elapsedSeconds} s`;
  else if (isError) statusText = completedBassAuthority?.errorMessage || "Analysis failed";
  else if (isNotVerified) statusText = "NOT VERIFIED";
  else if (isBlocked) statusText = "Waiting for complete design";
  else if (isAuthoritative) statusText = contract?.job?.message || (contract?.job?.cacheStatus === "hit" ? "Restored from cache" : "Analysis ready");
  else if (isUpdating) statusText = `Calculating… · ${elapsedSeconds} s`;

  return {
    pills,
    statusText,
    isReady: isAuthoritative,
    isUpdating: isUpdating || isCalculating,
    isNotVerified,
    elapsedSeconds,
    selectedMode: contract?.selectedMode || "balanced",
    parameterValues: Object.fromEntries(PARAM_KEYS.map((key) => [key, parameters[key]?.rawValue ?? parameters[key]?.value ?? null])),
    resultFingerprint: contract?.job?.resultFingerprint || null,
    selectedCandidateId: contract?.selectedCandidateId || null,
    perSeatP19Results,
    perSeatP20Results,
    p19Rows,
    p20Rows,
    p19Rsp,
    p19Lowest,
    p20BestPrimary,
    p20Lowest,
    publicationVerified,
  };
}

function officialStateText(authorityStatus, isCalculating) {
  if (isCalculating) return "Calculating…";
  if (authorityStatus === "NOT_VERIFIED") return "NOT VERIFIED";
  if (authorityStatus === "ERROR") return "Error";
  if (authorityStatus === "BLOCKED") return "Waiting…";
  return "Calculating…";
}

export const engineeringDetailsVisible = (includeDiagnostics) => includeDiagnostics === true;