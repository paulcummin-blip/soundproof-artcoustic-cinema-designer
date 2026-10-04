// bassResponseGraphAuthority.js
// ---------------------------------------------------------------------------
// The Technical Report's bass response graph evidence.
//
// It reads the SAME frozen authorities the rest of the report reads, and builds
// its curves with the SAME builders the Subwoofer Design graph uses — so the
// report can never present a second interpretation of the bass maths:
//
//   saved completed bass contract (durable, hydrated from the database)
//        → buildFinishedGraphOptimisationResult   (finished graph payload)
//        → buildBassGraphSeries                   (identical curves/kinds)
//        → buildRp22GraphMarkers                  (limiting frequency, P18/P19 band)
//
// Nothing is recalculated, nothing is read from the live Bass UI, and no curve
// is invented. When no current graph payload exists the authority reports
// not-ready and the report renders nothing — a stale or absent result is never
// drawn as a current one.
//
// Smoothing: the report applies the SAME default display smoothing the Expert
// Curve View opens with (1/3 octave). It is a display transform only — no
// engineering value changes — and it is what makes the printed curve read like
// the curve the designer sees.
// ---------------------------------------------------------------------------

import { buildBassGraphSeries } from "@/components/room/bass/bassGraphDomainBuilder";
import {
  buildFinishedGraphOptimisationResult,
  hasGraphPayload,
} from "@/components/room/bass/finishedGraphAdapter";
import { buildRp22GraphMarkers } from "@/components/room/bass/rp22GraphMarkers";
import { resolveOptimisationTransitionHz } from "@/components/room/bass/optimisationTransitionAuthority";
import { getPrimarySeats } from "@/components/utils/seatPriorityAuthority";
import { formatSeatPillLabel } from "@/components/utils/seatLabel";

/** The graph's own axis policy — the same 70–140 dB window the app graph locks. */
export const REPORT_BASS_GRAPH_Y_DOMAIN = [70, 140];
export const REPORT_BASS_GRAPH_X_DOMAIN = [15, 200];
export const REPORT_BASS_GRAPH_X_DOMAIN_WIDE = [15, 300];

/** The RSP Room Response page's single legend entry — its only trace. */
export const RSP_ROOM_RESPONSE_LABEL = "RSP room response";

/** The mandated explanatory paragraph on the RSP Room Response page. */
// One sentence, and only one sentence: the page states what the trace is and
// stops there. The graph's own markers carry the transition-region detail, so
// the paragraph never repeats it.
export const RSP_ROOM_RESPONSE_EXPLANATION = "The RSP trace shows the predicted low-frequency response at the reference seating position.";

/** Colour-independent caps so the page stays readable. */
export const REPORT_PRIMARY_SEAT_LIMIT = 8;

/** The display smoothing the Expert Curve View opens with (1/3 octave). */
export const REPORT_GRAPH_SMOOTHING = "third";

const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

/** The series the report plots, chosen by kind from the app's own builder output.
 *  The RSP page is NOT a comparison page: it plots the room response at the
 *  reference seat and nothing else. The corrected (after-EQ) curve and the
 *  house-curve target belong to the Primary Seats page. */
const RSP_PAGE_KINDS = ["room-response"];
const PRIMARY_PAGE_KINDS = ["post-eq", "house-curve"];

function pickSeries(series, kinds) {
  const rows = Array.isArray(series) ? series : [];
  return kinds
    .map((kind) => rows.filter((entry) => entry?.kind === kind && Array.isArray(entry.data) && entry.data.length))
    .flat()
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      kind: entry.kind,
      color: entry.color,
      strokeWidth: entry.strokeWidth,
      strokeDasharray: entry.strokeDasharray,
      seatId: entry.seatId || (entry.kind === "post-eq" && entry.id === "rsp-eq" ? "rsp" : null),
      data: entry.data.map((point) => ({ frequency: Number(point.frequency), spl: Number(point.spl) })),
    }));
}

/** The x window widens only when a plotted curve genuinely runs past 200 Hz. */
function resolveXDomain(series) {
  const beyond = series.some((entry) => entry.data.some((point) => point.frequency > 200));
  return beyond ? REPORT_BASS_GRAPH_X_DOMAIN_WIDE : REPORT_BASS_GRAPH_X_DOMAIN;
}

/**
 * Build the Technical Report's bass response graphs.
 *
 * @param {object} params
 * @param {object|null} params.contract - the saved completed bass contract
 * @param {boolean} [params.authoritative] - the store's own authority flag
 * @param {Array} [params.seats] - project seating positions (priority lives here)
 * @param {object|null} [params.roomDims] - { widthM, lengthM, heightM }, for the marker
 * @returns {object} { ready, reason, rsp, primary } — series, markers and domains
 */
export function buildReportBassGraphs({
  contract = null,
  authoritative = false,
  seats = [],
  roomDims = null,
} = {}) {
  if (authoritative !== true) {
    return { ready: false, reason: "no-current-bass-authority", rsp: null, primary: null };
  }
  if (!hasGraphPayload(contract)) {
    return { ready: false, reason: "no-graph-payload", rsp: null, primary: null };
  }

  const optimisationResult = buildFinishedGraphOptimisationResult(contract);
  const finalResponse = optimisationResult?.finalOptimisedBassResponse;
  if (!optimisationResult || !finalResponse?.postEqRspCurve?.length) {
    return { ready: false, reason: "no-finished-graph", rsp: null, primary: null };
  }

  const transitionHz = resolveOptimisationTransitionHz(roomDims);
  const markers = buildRp22GraphMarkers(finalResponse, null);
  const graphPayload = contract.graphPayload || {};
  const operatingLevelOffsetDb = finite(graphPayload.operatingLevelOffsetDb)
    ? Number(graphPayload.operatingLevelOffsetDb)
    : 0;
  const roomResponseCurve = Array.isArray(graphPayload.roomResponseCurve) ? graphPayload.roomResponseCurve : [];

  // ── RSP scope: the reference response, its corrected form and the target ──
  const rspBuilt = buildBassGraphSeries({
    designEqEnabled: true,
    showHouseCurve: true,
    normalizedSeries: roomResponseCurve.length ? { data: roomResponseCurve } : null,
    rspRawCurve: [],
    optimisationResult,
    hasMatchingDetailedResult: true,
    multiSeries: [],
    selectedSeatIds: [],
    showRealSeatOverlays: false,
    smoothingMode: REPORT_GRAPH_SMOOTHING,
    operatingLevelOffsetDb,
  });
  // One trace only. The label is the page's own wording for that curve.
  const rspSeries = pickSeries(rspBuilt, RSP_PAGE_KINDS)
    .slice(0, 1)
    .map((entry) => ({ ...entry, label: RSP_ROOM_RESPONSE_LABEL }));
  const rspCorrected = rspBuilt.find((entry) => entry?.kind === "post-eq") || null;
  const targetSeries = rspBuilt.find((entry) => entry?.kind === "house-curve") || null;

  // ── Primary seats: only Primary seats, never Secondary ones ──
  const primarySeats = getPrimarySeats(seats);
  const primaryIds = primarySeats.map((seat) => seat?.id).filter(Boolean);
  const plottedIds = primaryIds.slice(0, REPORT_PRIMARY_SEAT_LIMIT);
  const seatBuilt = plottedIds.length
    ? buildBassGraphSeries({
      designEqEnabled: true,
      showHouseCurve: true,
      normalizedSeries: roomResponseCurve.length ? { data: roomResponseCurve } : null,
      rspRawCurve: [],
      optimisationResult,
      hasMatchingDetailedResult: true,
      multiSeries: [],
      selectedSeatIds: plottedIds,
      showRealSeatOverlays: false,
      smoothingMode: REPORT_GRAPH_SMOOTHING,
      operatingLevelOffsetDb,
    })
    : [];

  const seatSeries = pickSeries(seatBuilt, PRIMARY_PAGE_KINDS);
  // The RSP reference line is taken from the RSP scope itself, so the reference
  // is the identical curve — never a rebuilt approximation.
  const reference = rspCorrected
    ? pickSeries([{ ...rspCorrected, label: "RSP (reference)" }], ["post-eq"])[0]
    : null;
  const primarySeries = [
    ...(reference ? [reference] : []),
    ...seatSeries.filter((entry) => entry.kind === "post-eq" && entry.seatId !== "rsp"),
    ...seatSeries.filter((entry) => entry.kind === "house-curve").slice(0, 1),
  ];

  // The canonical seat label the bass graph itself uses (seat-r1-c1 → R1S1).
  const primarySeatLabel = (seatId) => formatSeatPillLabel(seatId);

  // A page is drawn from whatever curve it actually has: an older saved contract
  // without the room-response curve must not hide the Primary Seats page.
  const hasAnyCurve = rspSeries.length > 0 || primarySeries.length > 0;

  return {
    ready: hasAnyCurve,
    reason: hasAnyCurve ? null : "no-curves",
    transitionHz,
    limitingFrequencyHz: finite(markers.p19WorstFrequencyHz) ? Number(markers.p19WorstFrequencyHz) : null,
    p18FrequencyHz: finite(markers.p18FrequencyHz) ? Number(markers.p18FrequencyHz) : null,
    assessmentBand: {
      startHz: finite(markers.p19StartHz) ? Number(markers.p19StartHz) : null,
      endHz: finite(markers.p19EndHz) ? Number(markers.p19EndHz) : null,
    },
    yDomain: REPORT_BASS_GRAPH_Y_DOMAIN,
    rsp: {
      xDomain: resolveXDomain(rspSeries),
      yDomain: REPORT_BASS_GRAPH_Y_DOMAIN,
      series: rspSeries,
      // No second line of copy: the page's explanation already states what the
      // trace is, and this page carries no target or EQ to caption.
      note: null,
    },
    primary: {
      xDomain: resolveXDomain(primarySeries.length ? primarySeries : rspSeries),
      yDomain: REPORT_BASS_GRAPH_Y_DOMAIN,
      series: primarySeries.map((entry) => ({
        ...entry,
        label: entry.kind === "house-curve" ? "Target" : entry.seatId === "rsp" ? "RSP (reference)" : primarySeatLabel(entry.seatId),
      })),
      primarySeatCount: primaryIds.length,
      plottedSeatCount: plottedIds.length,
      capped: primaryIds.length > plottedIds.length,
      note: primaryIds.length > plottedIds.length
        ? `Showing ${plottedIds.length} of ${primaryIds.length} Primary seats for legibility. Secondary seats are not plotted on this page.`
        : "Primary seats only. Secondary seats are not plotted on this page.",
    },
  };
}