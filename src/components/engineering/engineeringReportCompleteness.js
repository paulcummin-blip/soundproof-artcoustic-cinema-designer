/**
 * engineeringReportCompleteness.js
 * --------------------------------
 * One strict, read-only gate for Technical, Visual, Compliance and Proposal
 * outputs. A project may always reopen in Room Designer so unfinished work can
 * continue, but no report/proposal may be generated from a partial authority.
 *
 * "Complete" means every RP22 parameter P1-P21 is terminal (scored or genuinely
 * not applicable). Seat-scoped parameters must be terminal for every project
 * seat. Numeric zero remains a valid calculated result.
 */

export const REQUIRED_RP22_PARAMETER_KEYS = Object.freeze(
  Array.from({ length: 21 }, (_, index) => `p${index + 1}`),
);

const TERMINAL_STATES = new Set(["scored", "na", "not_applicable"]);

function normalizedState(value) {
  return String(value || "").trim().toLowerCase();
}

function isTerminal(entry) {
  return !!entry && TERMINAL_STATES.has(normalizedState(entry.state ?? entry.status));
}

function hasScoredLevel(entry) {
  if (normalizedState(entry?.state ?? entry?.status) !== "scored") return true;
  const level = entry?.level;
  if (level === 0 || level === "0") return true;
  return level !== null && level !== undefined && String(level).trim() !== "";
}

/**
 * Parameters whose terminality is carried by ONE published result instead of by
 * per-seat rows.
 *
 * P19 is RSP-scoped (the P19 RSP scope authority), so publications written
 * under the older per-seat P19 authority still label it "provisional" per seat
 * even when the summary they carry states a finished P19 RSP result. That
 * legacy label must not decide whether a completed project can open its report.
 */
const SINGLE_RESULT_PARAMETER_KEYS = new Set(["p19"]);

/** The summary's own published result for a parameter, or null. */
function publishedResultFor(summary, key) {
  const results = summary?.roomResultsByParameter || {};
  return results[key] ?? results[Number(String(key).slice(1))] ?? null;
}

/**
 * Does the summary's own published result for this parameter state a finished
 * assessment? Strict: a terminal state AND (for a scored result) a stated level.
 * A result that is missing, provisional or levelless is NOT terminal.
 */
function publishedResultIsTerminal(summary, key) {
  const result = publishedResultFor(summary, key);
  if (!result) return false;
  const state = normalizedState(result.state ?? result.status);
  if (state === "na" || state === "not_applicable") return true;
  if (state !== "scored" && state !== "complete") return false;
  const level = result.level;
  if (level === 0 || level === "0") return true;
  return level !== null && level !== undefined && String(level).trim() !== "";
}

function projectSeatIds(summary) {
  const ids = summary?.project?.seatIds;
  if (Array.isArray(ids) && ids.length) return ids.map(String);
  return Object.keys(summary?.seatHudById || {}).map(String);
}

/**
 * @returns {{complete:boolean, missingParameterKeys:string[], incompleteSeatParameterKeys:string[], reason:string|null}}
 */
export function assessEngineeringReportCompleteness(summary) {
  if (!summary || typeof summary !== "object") {
    return {
      complete: false,
      missingParameterKeys: [...REQUIRED_RP22_PARAMETER_KEYS],
      incompleteSeatParameterKeys: [],
      reason: "No saved engineering assessment is available.",
    };
  }

  const parameters = summary.parameterAuthority || {};
  const seatIds = projectSeatIds(summary);
  const missingParameterKeys = [];
  const incompleteSeatParameterKeys = [];

  for (const key of REQUIRED_RP22_PARAMETER_KEYS) {
    const parameter = parameters[key];
    if (!isTerminal(parameter)) {
      // A single-result parameter (P19) is complete when the summary's own
      // published result is finished — a legacy per-seat label left behind by an
      // older publication never blocks a report that carries the finished result.
      if (SINGLE_RESULT_PARAMETER_KEYS.has(key) && publishedResultIsTerminal(summary, key)) continue;
      missingParameterKeys.push(key);
      continue;
    }

    // P19 is RSP-scoped. Older publications labelled it seat-scoped, but the
    // restored authority normalises it to room/RSP before this gate runs.
    const isSeatScoped = parameter.scope === "seat" && key !== "p19";
    if (!isSeatScoped || normalizedState(parameter.state) !== "scored") {
      if (!hasScoredLevel(parameter)) missingParameterKeys.push(key);
      continue;
    }

    if (seatIds.length === 0) {
      incompleteSeatParameterKeys.push(key);
      continue;
    }

    const seats = parameter.seats || {};
    const allSeatsTerminal = seatIds.every((seatId) => {
      const seat = seats[seatId];
      return isTerminal(seat) && hasScoredLevel(seat);
    });
    if (!allSeatsTerminal) incompleteSeatParameterKeys.push(key);
  }

  // RP23/screen is required when the published authority includes it.
  if (parameters.screen) {
    const screen = parameters.screen;
    if (!isTerminal(screen)
      || (screen.scope === "seat"
        && normalizedState(screen.state) === "scored"
        && seatIds.some((seatId) => !isTerminal(screen?.seats?.[seatId]) || !hasScoredLevel(screen?.seats?.[seatId])))) {
      missingParameterKeys.push("screen");
    }
  }

  const complete = missingParameterKeys.length === 0 && incompleteSeatParameterKeys.length === 0;
  const labels = [...new Set([...missingParameterKeys, ...incompleteSeatParameterKeys])]
    .map((key) => key === "screen" ? "RP23 screen assessment" : key.toUpperCase());

  return {
    complete,
    missingParameterKeys,
    incompleteSeatParameterKeys,
    reason: complete
      ? null
      : `Complete the remaining assessment before generating reports or proposals: ${labels.join(", ")}.`,
  };
}

export function isEngineeringReportComplete(summary) {
  return assessEngineeringReportCompleteness(summary).complete;
}

export default assessEngineeringReportCompleteness;