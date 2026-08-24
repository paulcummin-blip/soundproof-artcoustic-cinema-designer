import { resolveRp22DesignValue } from "@/components/utils/rp22/resolveRp22DesignValue";
import { buildComplianceBassPresentation } from "@/components/room/bass/bassCompliancePresentation";
import { buildP19SeatRows, p19LowestSeat, p19RspResult } from "@/components/room/bass/p19SeatPresentation";
import { buildP20SeatRows, p20WorstSeat, p20BestPrimarySeat } from "@/components/room/bass/p20SeatPresentation";
import { formatP14Capability, formatP14BasisLabel, normalizeP14TargetBasis } from "@/components/utils/p14CapabilityAuthority";
import { assessP18Extension, formatP18TargetBasisDetail, normalizeP18TargetBasis } from "@/components/utils/p18ExtensionAuthority";

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
    // P14 pill reports the USER-SELECTED target level and target dB. Available
    // capability is separate and shown in the detail line, never as the level.
    const resultText = `${grade}${value ? ` · ${value}` : ""}`;
    return { label: "P14 Bass SPL", resultText, text: `P14 Bass SPL ${resultText}`, level: grade, detail: parameter.targetBasisDetail || null };
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
 * P19 is a SEAT-scoped RP22 parameter (Room/Seat = Seat):
 *   P19 main pill: RSP headline result (the calibration reference), e.g.
 *     "L3 · ±2.86 dB" — per-seat results in the P19 — All Seats grid below.
 * P20 is a SEAT-scoped parameter:
 *   P20 main pill: "SEAT" — per-seat results in seat grids below.
 *   RSP (p19Rsp) and Best Primary (p20BestPrimary) are retained as
 *   diagnostic fields in the return value.
 *
 * @param {object} completedBassAuthority - from useCompletedBassAuthority(scopeId)
 * @param {object} lifecycle - controller lifecycle snapshot
 * @param {Array} seatingPositions - appState.seatingPositions for seat priority
 * @param {number} nowMs - current timestamp for elapsed timer
 * @param {object} displayBasis - current P14/P18 grading bases
 */
export function formatOfficialBassResults(completedBassAuthority, lifecycle = null, seatingPositions = [], nowMs = Date.now(), noP14TargetSelected = false, displayBasis = {}) {
  const presentation = buildComplianceBassPresentation({ completedBassAuthority });
  const { publicationVerified, parameters } = presentation;
  const contract = completedBassAuthority?.contract || null;
  const activeP14Basis = normalizeP14TargetBasis(
    displayBasis?.p14TargetBasis || contract?.productAnalysis?.parameters?.p14?.targetBasis,
  );
  const activeP18Basis = normalizeP18TargetBasis(
    displayBasis?.p18TargetBasis || contract?.productAnalysis?.parameters?.p18?.targetBasis,
  );

  const authorityStatus = completedBassAuthority?.authorityStatus || "UNCALCULATED";
  const lifecycleStatus = lifecycle?.status || "idle";
  const isCalculating = ["calculating", "running", "queued", "stale"].includes(lifecycleStatus);
  const timerStart = lifecycle?.startedAtMs ?? lifecycle?.queuedAtMs;
  const elapsedSeconds = secondsSince(timerStart, nowMs);

  // ── UNSELECTED state — takes precedence over all other states. ──
  // When P14 is genuinely unselected, no calculation is running, pending,
  // or failed. Show a neutral "Select Bass Target" state — never
  // "Calculating…", "NOT VERIFIED", or "FAIL". Old completed authority from
  // a previous target selection is NOT surfaced as current.
  if (noP14TargetSelected) {
    const unselectedPill = (label) => ({
      label,
      resultText: "Select Bass Target",
      text: `${label} Select Bass Target`,
      level: "—",
      detail: null,
    });
    // P19/P20 are SEAT-scoped — show "SEAT" neutral, not "Select Bass Target".
    const seatPill = (label) => ({
      label,
      resultText: "SEAT",
      text: `${label} SEAT`,
      level: "—",
      detail: null,
    });
    return {
      pills: {
        p14: unselectedPill("P14 Bass SPL"),
        p18: unselectedPill("P18 Extension"),
        p19: unselectedPill("P19 Response Fit"),
        p20: seatPill("P20 Seat Consistency"),
      },
      statusText: "Select Bass Target",
      isReady: false,
      isUpdating: false,
      isNotVerified: false,
      isUnselected: true,
      elapsedSeconds: 0,
      selectedMode: contract?.selectedMode || "balanced",
      parameterValues: { p14: null, p18: null, p19: null, p20: null },
      resultFingerprint: null,
      selectedCandidateId: null,
      perSeatP19Results: [],
      perSeatP20Results: [],
      p19Rows: [],
      p20Rows: [],
      p19Rsp: null,
      p19Lowest: null,
      p20BestPrimary: null,
      p20Lowest: null,
      publicationVerified: false,
    };
  }

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
  const p19Rsp = isAuthoritative ? p19RspResult(contract?.productAnalysis?.parameters?.p19) : null;
  const p19Lowest = isAuthoritative ? p19LowestSeat(p19Rows) : null;

  // P20 compact: Best Primary + Lowest Seat
  const p20BestPrimary = isAuthoritative ? p20BestPrimarySeat(p20Rows) : null;
  const p20Lowest = isAuthoritative ? p20WorstSeat(p20Rows) : null;

  const pills = {};

  // P14 — USER-SELECTED target level and target dB (authoritative). Available
  // capability is shown separately in the detail line. The capability never
  // overwrites the user's selected target.
  if (isAuthoritative) {
    const source = contract?.productAnalysis?.parameters?.p14;
    const selectedLevel = source?.selectedLevel ?? source?.level;
    const selectedTargetDb = source?.selectedTargetDb ?? source?.requestedTargetDb ?? source?.value;
    const availableCapabilityDb = source?.achievedCapabilityDb ?? source?.availableCapabilityDb ?? null;
    const targetAchievable = source?.pass === true;

    const levelText = Number.isFinite(selectedLevel) && selectedLevel > 0 ? `L${selectedLevel}` : "—";
    const valueText = isFiniteNumber(selectedTargetDb) ? formatBassParameterValue("p14", selectedTargetDb) : "—";
    const resultText = valueText !== "—" ? `${levelText} · ${valueText}` : "—";

    const detailParts = [];
    if (source?.targetBasis) detailParts.push(`Target basis: ${formatP14BasisLabel(source.targetBasis)}`);
    if (isFiniteNumber(availableCapabilityDb)) detailParts.push(`Available: ${formatP14Capability(availableCapabilityDb)}`);
    if (targetAchievable === false && isFiniteNumber(availableCapabilityDb)) detailParts.push("Target not achievable");
    const detail = detailParts.join(" · ");

    pills.p14 = {
      label: "P14 Bass SPL",
      resultText,
      text: `P14 Bass SPL ${resultText}`,
      level: valueText !== "—" ? levelText : "—",
      detail,
    };
  } else {
    pills.p14 = { label: "P14 Bass SPL", resultText: officialStateText(authorityStatus, isCalculating), text: `P14 Bass SPL ${officialStateText(authorityStatus, isCalculating)}`, level: "—" };
  }

  // P18 — dynamically regrade the achieved extension for the current display
  // basis without changing fingerprints, workers, authority or cached curves.
  if (isAuthoritative) {
    const source = contract?.productAnalysis?.parameters?.p18;
    const achievedValue = isFiniteNumber(source?.value) ? Number(source.value) : null;
    const assessment = assessP18Extension(achievedValue, activeP18Basis);
    const levelText = assessment.levelLabel || "FAIL";
    const valueText = formatBassParameterValue("p18", achievedValue);
    const resultText = valueText ? `${levelText} · ${valueText}` : "—";
    pills.p18 = {
      label: "P18 Extension",
      resultText,
      text: `P18 Extension ${resultText}`,
      level: valueText ? levelText : "—",
      detail: formatP18TargetBasisDetail(activeP18Basis),
    };
  } else {
    pills.p18 = { label: "P18 Extension", resultText: officialStateText(authorityStatus, isCalculating), text: `P18 Extension ${officialStateText(authorityStatus, isCalculating)}`, level: "—" };
  }

  // P19 — SEAT-scoped RP22 parameter (Room/Seat = Seat). Main pill shows the
  // RSP headline result (the calibration reference); per-seat grades are in the
  // P19 — All Seats panel below. Every seat is graded against the same house
  // target using the same RSP-derived EQ/trim — no independent seat EQ.
  if (isAuthoritative && p19Rsp) {
    const resultText = `${p19Rsp.level} · ${p19Rsp.displayValue}`;
    pills.p19 = {
      label: "P19 Response Fit",
      resultText,
      text: `P19 Response Fit ${resultText}`,
      level: p19Rsp.level,
      detail: "RSP reference · per-seat below",
    };
  } else {
    pills.p19 = { label: "P19 Response Fit", resultText: officialStateText(authorityStatus, isCalculating), text: `P19 Response Fit ${officialStateText(authorityStatus, isCalculating)}`, level: "—" };
  }

  // P20 — SEAT-scoped parameter. Main pill ALWAYS shows "SEAT" in every
  // lifecycle state (unselected, calculating, ready). Per-seat results are
  // presented in the seat grids below. Calculation status ("Calculating…")
  // appears in the statusText detail area, never as the main pill. Best
  // Primary is retained as a diagnostic field (p20BestPrimary) but never as
  // the main pill result — a "best primary" headline hides poor seats.
  pills.p20 = { label: "P20 Seat Consistency", resultText: "SEAT", text: "P20 Seat Consistency SEAT", level: "—", detail: null };

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