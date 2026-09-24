import { buildComplianceBassPresentation } from "@/components/room/bass/bassCompliancePresentation";
import { p19LowestSeat, p19RspResult } from "@/components/room/bass/p19SeatPresentation";
import { buildP20SeatRows, p20WorstSeat, p20BestPrimarySeat } from "@/components/room/bass/p20SeatPresentation";
import { formatP14Capability, formatP14BasisLabel, normalizeP14TargetBasis } from "@/components/utils/p14CapabilityAuthority";
import { assessP18Extension, formatP18TargetBasisDetail, normalizeP18TargetBasis } from "@/components/utils/p18ExtensionAuthority";
import { seatScopeHeadlinePill } from "@/components/utils/rp22ParameterPresentation";
import { formatBassParameterValue } from "@/components/room/bass/bassParameterValueFormatter";
import { BASS_LIFECYCLE_STATE, BASS_LIFECYCLE_COPY, isBassLifecycleCalculating } from "./bassCalculationLifecycle";

// Re-export so existing consumers (bassResultsPresentationFixtures, seatHudPresentation)
// can still import formatBassParameterValue from this module without changes.
export { formatBassParameterValue };

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

function parameterLabel(key, result) {
  if (key === "p14") return "Estimated LFE Capability";
  if (key === "p18") return "Bass Extension";
  if (key === "p19") return "P19 Response Fit";
  if (key === "p20") return "Seat Consistency";
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
 * Persistent visibility: during calculation with a published result, the
 * last published values remain visible (greyed via isCalculatingWithPublishedResult)
 * and the status shows "Calculating updated result…". Only when there is no
 * published result (first-ever calculation) do pills show "Calculating…".
 *
 * P19 headline is the canonical RSP result against stored Reference EQ.
 * Per-seat P19 diagnostics remain in the P19 — All Seats grid below.
 * P20 is a SEAT-scoped parameter:
 *   P20 main pill: "SEAT" — per-seat results in the P20 — All Seats grid below.
 *   Coverage summary ("Primary Seats L{X} · No seat lower than L{Y}") appears
 *   above the grid — no "worst seat" headline. Seat results are the only P20 results.
 *
 * @param {object} completedBassAuthority - from useCompletedBassAuthority(scopeId)
 * @param {object} lifecycle - controller lifecycle snapshot
 * @param {Array} seatingPositions - appState.seatingPositions for seat priority
 * @param {number} nowMs - current timestamp for elapsed timer
 * @param {object} displayBasis - current P14/P18 grading bases
 * @param {object|null} p19SeatAuthority - published canonical P19 seat authority
 */
export function formatOfficialBassResults(completedBassAuthority, lifecycle = null, seatingPositions = [], nowMs = Date.now(), noP14TargetSelected = false, displayBasis = {}, p19SeatAuthority = null, bassLifecycleState = null) {
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
  // Unified lifecycle — when provided, it is the sole authority for the
  // calculation state. When not provided (legacy callers/fixtures), fall
  // back to the raw controller status.
  const isCalculating = bassLifecycleState != null
    ? isBassLifecycleCalculating(bassLifecycleState)
    : ["calculating", "running", "queued", "stale"].includes(lifecycleStatus);
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
    return {
      pills: {
        p14: unselectedPill("P14 Bass SPL"),
        p18: unselectedPill("P18 Extension"),
        p19: seatScopeHeadlinePill("P19 Response Fit"),
        p20: seatScopeHeadlinePill("P20 Seat Consistency"),
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
      p19SeatAuthority: null,
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
  const isStale = bassLifecycleState != null
    ? bassLifecycleState === BASS_LIFECYCLE_STATE.STALE_NEEDS_RECALCULATION
    : authorityStatus === "STALE";
  const isBlocked = authorityStatus === "BLOCKED";
  const isError = bassLifecycleState != null
    ? bassLifecycleState === BASS_LIFECYCLE_STATE.FAILED
    : authorityStatus === "ERROR";
  const isUncalculated = authorityStatus === "UNCALCULATED" && !isCalculating;
  // LIMITED: P14 capability below the requested target. The calculation is
  // terminal (not pending), but P18/P19/P20 were not evaluated. Treat like
  // p14Failed for downstream gating, but with a distinct status label.
  const isLimited = authorityStatus === "LIMITED";

  // P14 FAIL → P18/P19/P20 not evaluated at the requested operating point.
  // Declared early — used by per-seat gating below. A LIMITED contract also
  // has P14 pass === false, so include it in the p14Failed gating.
  const p14Failed = (isAuthoritative || isLimited) && contract?.productAnalysis?.parameters?.p14?.pass === false;

  // Per-seat arrays are publication-gated AND suppressed while calculating.
  // When a calculation is in progress, old results must NOT be presented as
  // current — the pills and per-seat grids show "Calculating…" instead.
  // Persistent visibility: during calculation, the last published result
  // remains visible (greyed) rather than being replaced with "Calculating…".
  // Only show "Calculating…" when there is NO published result (first-ever).
  const hasPublishedResult = isAuthoritative && !p14Failed;
  const isCalculatingWithPublished = isCalculating && hasPublishedResult;
  const resultsVisible = hasPublishedResult;
  const publishedP19SeatAuthority = resultsVisible ? p19SeatAuthority : null;
  const perSeatP19Results = publishedP19SeatAuthority?.seats || [];
  const perSeatP20Results = resultsVisible ? (presentation.perSeatP20Results || []) : [];
  const p19Rows = publishedP19SeatAuthority?.rows || [];
  const p20Rows = resultsVisible ? buildP20SeatRows(seatingPositions, perSeatP20Results) : [];

  // P19 compact: RSP + lowest seat (internal authority — presented as coverage summary)
  const p19Rsp = resultsVisible ? p19RspResult(contract?.productAnalysis?.parameters?.p19) : null;
  const p19Lowest = resultsVisible ? p19LowestSeat(p19Rows) : null;

  // P20 compact: best Primary + lowest seat (internal authority — presented as coverage summary)
  const p20BestPrimary = resultsVisible ? p20BestPrimarySeat(p20Rows) : null;
  const p20Lowest = resultsVisible ? p20WorstSeat(p20Rows) : null;

  const pills = {};

  // P14 — USER-SELECTED target level and target dB (authoritative or LIMITED).
  // Available capability is shown separately in the detail line. The capability
  // never overwrites the user's selected target. When the target is NOT
  // achievable, the pill shows strict FAIL + Available max — never a downgraded
  // level. A LIMITED contract also has P14 data (pass === false) and should
  // display the same FAIL pill.
  if (isAuthoritative || isLimited) {
    const source = contract?.productAnalysis?.parameters?.p14;
    const selectedLevel = source?.selectedLevel ?? source?.level;
    const selectedTargetDb = source?.selectedTargetDb ?? source?.requestedTargetDb ?? source?.value;
    const availableCapabilityDb = source?.achievedCapabilityDb ?? source?.availableCapabilityDb ?? null;
    const targetAchievable = source?.pass === true;

    const detailParts = [];
    if (source?.targetBasis) detailParts.push(`Target basis: ${formatP14BasisLabel(source.targetBasis)}`);

    if (targetAchievable === false) {
      // P14 FAIL — strict: show FAIL, not a downgraded level. Available max
      // is shown so the designer knows what the system can actually achieve.
      if (isFiniteNumber(availableCapabilityDb)) detailParts.push(`Available: ${formatP14Capability(availableCapabilityDb)}`);
      pills.p14 = {
        label: "P14 Bass SPL",
        resultText: "FAIL",
        text: "P14 Bass SPL FAIL",
        level: "FAIL",
        detail: detailParts.join(" · "),
      };
    } else {
      // P14 PASS — show the selected level and target dB.
      const levelText = Number.isFinite(selectedLevel) && selectedLevel > 0 ? `L${selectedLevel}` : "—";
      const valueText = isFiniteNumber(selectedTargetDb) ? formatBassParameterValue("p14", selectedTargetDb) : "—";
      const resultText = valueText !== "—" ? `${levelText} · ${valueText}` : "—";
      if (isFiniteNumber(availableCapabilityDb)) detailParts.push(`Available: ${formatP14Capability(availableCapabilityDb)}`);
      pills.p14 = {
        label: "P14 Bass SPL",
        resultText,
        text: `P14 Bass SPL ${resultText}`,
        level: valueText !== "—" ? levelText : "—",
        detail: detailParts.join(" · "),
      };
    }
  } else {
    pills.p14 = { label: "P14 Bass SPL", resultText: officialStateText(authorityStatus, isCalculating), text: `P14 Bass SPL ${officialStateText(authorityStatus, isCalculating)}`, level: "—" };
  }

  const notEvaluatedText = "Not evaluated at requested operating point";

  // P18 — dynamically regrade the achieved extension for the current display
  // basis without changing fingerprints, workers, authority or cached curves.
  // A bounded result (response still above -3 dB at the product validity floor)
  // is displayed as "≤{floor} Hz" — not a fake exact crossing below valid data.
  // LIMITED contracts have no P18 data (P14 failed → P18 not evaluated).
  if (resultsVisible) {
    const source = contract?.productAnalysis?.parameters?.p18;
    const achievedValue = isFiniteNumber(source?.value) ? Number(source.value) : null;
    const bounded = source?.achievedExtensionBounded === true;
    const assessment = assessP18Extension(achievedValue, activeP18Basis);
    const levelText = assessment.levelLabel || "FAIL";
    const valueText = isFiniteNumber(achievedValue)
      ? `${bounded ? "≤" : ""}${formatBassParameterValue("p18", achievedValue)}`
      : "";
    const resultText = valueText ? `${levelText} · ${valueText}` : "—";
    pills.p18 = {
      label: "P18 Extension",
      resultText,
      text: `P18 Extension ${resultText}`,
      level: valueText ? levelText : "—",
      detail: formatP18TargetBasisDetail(activeP18Basis),
    };
  } else if (p14Failed) {
    // P14 FAIL (or LIMITED) → P18 FAIL. Internally P18 was not evaluated because
    // the selected P14 operating target is unattainable; the dealer-facing
    // pill shows strict FAIL, not "Not evaluated".
    pills.p18 = { label: "P18 Extension", resultText: "FAIL", text: "P18 Extension FAIL", level: "FAIL", detail: isLimited ? "Not evaluated — P14 target unattainable" : null };
  } else {
    pills.p18 = { label: "P18 Extension", resultText: officialStateText(authorityStatus, isCalculating), text: `P18 Extension ${officialStateText(authorityStatus, isCalculating)}`, level: "—" };
  }

  // P19 — SEAT-scoped parameter. The headline always displays "SEAT" — no
  // RSP/aggregate headline. When calculating, show "Calculating…" — never
  // old results. When P14 fails (or LIMITED), P19 is not evaluated.
  pills.p19 = (isCalculating && !hasPublishedResult)
    ? { label: "P19 Response Fit", resultText: "Calculating…", text: "P19 Response Fit Calculating…", level: "—" }
    : p14Failed
      ? { label: "P19 Response Fit", resultText: "FAIL", text: "P19 Response Fit FAIL", level: "FAIL", detail: isLimited ? "Not evaluated — P14 target unattainable" : null }
      : seatScopeHeadlinePill("P19 Response Fit");

  // P20 — SEAT-scoped parameter. The headline always displays "SEAT" — no
  // "worst seat" headline, no aggregate level. When calculating, show
  // "Calculating…" — never old results. When P14 fails (or LIMITED), P20
  // is not evaluated.
  pills.p20 = (isCalculating && !hasPublishedResult)
    ? { label: "P20 Seat Consistency", resultText: "Calculating…", text: "P20 Seat Consistency Calculating…", level: "—" }
    : p14Failed
      ? { label: "P20 Seat Consistency", resultText: "FAIL", text: "P20 Seat Consistency FAIL", level: "FAIL", detail: isLimited ? "Not evaluated — P14 target unattainable" : null }
      : seatScopeHeadlinePill("P20 Seat Consistency");

  // Status text
  let statusText = "Waiting for complete design";
  if (isCalculatingWithPublished) statusText = "Analysing updated design…";
  else if (isCalculating) statusText = `Calculating… · ${elapsedSeconds} s`;
  else if (isError) statusText = completedBassAuthority?.errorMessage || "Analysis failed";
  else if (isStale) statusText = "Needs recalculation";
  else if (isNotVerified) statusText = "NOT VERIFIED";
  else if (isBlocked) statusText = "Waiting for complete design";
  else if (isLimited) statusText = "P14 capability below target";
  else if (isAuthoritative) statusText = contract?.job?.message || (contract?.job?.cacheStatus === "hit" ? "Restored from cache" : "Performance is current.");
  else if (isUpdating) statusText = `Calculating… · ${elapsedSeconds} s`;

  return {
    pills,
    statusText,
    isReady: isAuthoritative,
    isUpdating: isUpdating || isCalculating,
    isNotVerified,
    isStale,
    isLimited,
    elapsedSeconds,
    selectedMode: contract?.selectedMode || "balanced",
    parameterValues: Object.fromEntries(PARAM_KEYS.map((key) => [key, parameters[key]?.rawValue ?? parameters[key]?.value ?? null])),
    resultFingerprint: contract?.job?.resultFingerprint || null,
    selectedCandidateId: contract?.selectedCandidateId || null,
    perSeatP19Results,
    perSeatP20Results,
    p19SeatAuthority: publishedP19SeatAuthority,
    p19Rows,
    p20Rows,
    p19Rsp,
    p19Lowest,
    p20BestPrimary,
    p20Lowest,
    publicationVerified,
    isCalculatingWithPublishedResult: isCalculatingWithPublished,
  };
}

function officialStateText(authorityStatus, isCalculating) {
  if (isCalculating) return "Calculating…";
  if (authorityStatus === "STALE") return "Needs recalculation";
  if (authorityStatus === "NOT_VERIFIED") return "NOT VERIFIED";
  if (authorityStatus === "ERROR") return "Error";
  if (authorityStatus === "BLOCKED") return "Waiting…";
  if (authorityStatus === "LIMITED") return "Below Target";
  return "Calculating…";
}

export const engineeringDetailsVisible = (includeDiagnostics) => includeDiagnostics === true;