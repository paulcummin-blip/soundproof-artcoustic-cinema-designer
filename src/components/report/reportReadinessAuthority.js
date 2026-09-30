/**
 * reportReadinessAuthority
 * ------------------------
 * The single canonical readiness vocabulary for every client-facing report.
 *
 * States
 *   not-ready  required project data or assessments are missing. The report
 *              explains exactly what is missing and what to do next.
 *   preparing  generation is actively running. Bounded: it always resolves to
 *              a definite state instead of waiting indefinitely.
 *   ready      the report is complete and reflects the current saved project.
 *   failed     generation failed. A reason is shown, with Retry and Return.
 *   stale      a report exists but the project has changed since it was
 *              generated. Viewing only; regeneration is required before export.
 *
 * Derivation only — this module produces no report content and recalculates
 * no engineering value.
 */

export const REPORT_STATE = {
  NOT_READY: "not-ready",
  PREPARING: "preparing",
  READY: "ready",
  FAILED: "failed",
  STALE: "stale",
};

/**
 * The plain-English missing-item checklist. `action` is the next required
 * action for that item, shown beneath it so the dealer always knows what to do.
 */
export const REPORT_MISSING_ITEM = {
  ROOM: {
    key: "room",
    label: "Room layout incomplete",
    action: "Open the Room Designer and confirm the room dimensions.",
  },
  SPEAKERS: {
    key: "speakers",
    label: "Speaker layout incomplete",
    action: "Place the loudspeakers in the Room Designer.",
  },
  RP22: {
    key: "rp22",
    label: "RP22 assessment not run",
    action: "Complete the RP22 assessment in the Room Designer.",
  },
  BASS: {
    key: "bass",
    label: "Bass assessment not complete",
    action: "Run the bass assessment in the Room Designer and accept the result.",
  },
  PRICING: {
    key: "pricing",
    label: "Pricing/products incomplete",
    action: "Complete the product selection or price schedule for this project.",
  },
  IMAGES: {
    key: "images",
    label: "Images missing",
    action: "Upload the project images this report type requires.",
  },
};

/**
 * Preparing may only hold for this long. After it, the report resolves to a
 * definite state (Not Ready or Failed) rather than waiting indefinitely.
 */
export const PREPARING_BOUND_SECONDS = 25;

function roomIsReady(roomDims) {
  return Number(roomDims?.widthM) > 0 && Number(roomDims?.lengthM) > 0;
}

function speakersAreReady(placedSpeakers) {
  return Array.isArray(placedSpeakers) && placedSpeakers.length > 0;
}

/**
 * Resolve the canonical report state.
 *
 * @param {object}   input
 * @param {boolean}  input.hydrating            project data still loading
 * @param {object}   input.roomDims             { widthM, lengthM }
 * @param {Array}    input.placedSpeakers
 * @param {object}   input.engineeringSummary   published RP22 engineering summary
 * @param {object}   input.bassPerformance      published bass authority (null = not assessed)
 * @param {object}   input.pricingStatus        'ok' | 'incomplete' | 'unknown'
 * @param {boolean}  input.requiresImages
 * @param {boolean}  input.hasImages
 * @param {boolean}  input.bassCalculating      bass analysis actively running
 * @param {number}   input.elapsedSeconds       seconds spent in the current state
 * @param {boolean}  input.failed
 * @param {string}   input.failedReason
 * @param {boolean}  input.stale
 * @param {string}   input.staleReason
 * @returns {{state: string, missing: Array, nextAction: string|null, reason: string|null, canExport: boolean}}
 */
export function deriveReportReadiness({
  hydrating = false,
  roomDims = null,
  placedSpeakers = null,
  engineeringSummary = null,
  bassPerformance = null,
  pricingStatus = "unknown",
  requiresImages = false,
  hasImages = true,
  bassCalculating = false,
  elapsedSeconds = 0,
  failed = false,
  failedReason = null,
  stale = false,
  staleReason = null,
} = {}) {
  // ── Terminal states first ──
  if (failed) {
    return {
      state: REPORT_STATE.FAILED,
      missing: [],
      nextAction: "Retry the report, or return to the project.",
      reason: failedReason || "The report could not be generated.",
      canExport: false,
    };
  }

  if (stale) {
    return {
      state: REPORT_STATE.STALE,
      missing: [],
      nextAction: "Regenerate the report before exporting.",
      reason: staleReason || "The project has changed since this report was generated.",
      canExport: false,
    };
  }

  // ── Missing-item checklist ──
  const missing = [];
  if (!roomIsReady(roomDims)) missing.push(REPORT_MISSING_ITEM.ROOM);
  if (!speakersAreReady(placedSpeakers)) missing.push(REPORT_MISSING_ITEM.SPEAKERS);
  if (!engineeringSummary) missing.push(REPORT_MISSING_ITEM.RP22);
  if (!bassPerformance) missing.push(REPORT_MISSING_ITEM.BASS);
  if (pricingStatus === "incomplete") missing.push(REPORT_MISSING_ITEM.PRICING);
  if (requiresImages && !hasImages) missing.push(REPORT_MISSING_ITEM.IMAGES);

  if (missing.length > 0) {
    // Still arriving: hydration, or the bass assessment actively running.
    const waitingOnRuntime = hydrating
      || (bassCalculating && missing.every((item) => item.key === "bass"));
    const withinBound = elapsedSeconds < PREPARING_BOUND_SECONDS;

    if (waitingOnRuntime && withinBound) {
      return {
        state: REPORT_STATE.PREPARING,
        missing,
        nextAction: null,
        reason: null,
        canExport: false,
      };
    }

    return {
      state: REPORT_STATE.NOT_READY,
      missing,
      nextAction: missing[0]?.action || null,
      reason: "This project has not been fully assessed yet.",
      canExport: false,
    };
  }

  return {
    state: REPORT_STATE.READY,
    missing: [],
    nextAction: null,
    reason: null,
    canExport: true,
  };
}

/** Short canonical description of a report state. */
export function describeReportState(state) {
  switch (state) {
    case REPORT_STATE.NOT_READY:
      return "Not ready";
    case REPORT_STATE.PREPARING:
      return "Preparing";
    case REPORT_STATE.READY:
      return "Ready";
    case REPORT_STATE.FAILED:
      return "Failed";
    case REPORT_STATE.STALE:
      return "Out of date";
    default:
      return "Unknown";
  }
}