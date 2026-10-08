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
import {
  REPORT_RSP_STYLE,
  REPORT_TARGET_STYLE,
  reportSeatStyle,
} from "./reportBassSeriesStyle";

/** The graph's own axis policy — the same 70–140 dB window the app graph locks. */
export const REPORT_BASS_GRAPH_Y_DOMAIN = [70, 140];
export const REPORT_BASS_GRAPH_X_DOMAIN = [15, 200];
export const REPORT_BASS_GRAPH_X_DOMAIN_WIDE = [15, 300];

/** The P19 page's two traces — the corrected RSP response and the target. */
export const P19_RSP_LABEL = "RSP post-EQ response";
export const P19_TARGET_LABEL = "Target";

/**
 * The P19 page's explanatory paragraph. P19 is the corrected (post-EQ) response
 * at the Reference Seating Position measured against the target across the P19
 * assessment band. It is that comparison — never the room/layout response.
 */
export const P19_RSP_EXPLANATION = "This graph plots the predicted corrected (post-EQ) low-frequency response at the Reference Seating Position (RSP) against the target curve, across the P19 assessment band. P19 is assessed at the reference seating position only; seat-to-seat consistency is assessed separately under P20.";

/** Colour-independent caps so the page stays readable. */
export const REPORT_PRIMARY_SEAT_LIMIT = 8;

/** The display smoothing the Expert Curve View opens with (1/3 octave). */
export const REPORT_GRAPH_SMOOTHING = "third";

const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

/** The series the report plots, chosen by kind from the app's own builder output.
 *  The P19 page plots exactly the two curves the P19 metric compares: the
 *  corrected (post-EQ) response at the reference seat and the house-curve
 *  target. The room/layout response is a different quantity and is never drawn
 *  as the P19 result. */
const P19_RSP_KINDS = ["post-eq", "house-curve"];
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
 * The P19 page's frequency range: the P19 assessment band, never the whole
 * axis. P19 is assessed below the room transition frequency, so the page shows
 * that band. The window still starts at the report's own floor so no curve is
 * clipped flat onto the left border, and falls back to the standard axis when
 * the saved contract states no band.
 */
function resolveP19XDomain(assessmentBand) {
  const start = REPORT_BASS_GRAPH_X_DOMAIN[0];
  const end = finite(assessmentBand?.endHz) ? Math.ceil(Number(assessmentBand.endHz)) : null;
  return end && end > start ? [start, end] : REPORT_BASS_GRAPH_X_DOMAIN;
}

/**
 * The P19 bass response graph — the ONE P19 evidence presentation, shared by the
 * Technical Report's P19 page and the Visual Report's P19 page.
 *
 * It plots exactly the two curves the P19 metric compares: the corrected
 * (post-EQ) response at the Reference Seating Position and the house-curve
 * target, across the P19 assessment band. Nothing is recalculated, and the
 * room/layout response is never substituted for the post-EQ result. When the
 * saved post-EQ curve and target are not available it reports not-ready, so a
 * consumer states that plainly instead of drawing an unrelated curve.
 *
 * @param {object} params
 * @param {object|null} params.contract - the saved completed bass contract
 * @param {boolean} [params.authoritative] - the store's own authority flag
 * @param {object|null} [params.roomDims] - { widthM, lengthM, heightM }, for the marker
 * @returns {object} { ready, reason, series, xDomain, yDomain, markers, assessmentBand }
 */
export function buildP19RspGraph({ contract = null, authoritative = false, roomDims = null } = {}) {
  const empty = (reason) => ({
    ready: false,
    reason,
    series: [],
    xDomain: REPORT_BASS_GRAPH_X_DOMAIN,
    yDomain: REPORT_BASS_GRAPH_Y_DOMAIN,
    markers: {},
    assessmentBand: { startHz: null, endHz: null },
  });
  if (authoritative !== true) return empty("no-current-bass-authority");
  if (!hasGraphPayload(contract)) return empty("no-graph-payload");

  const optimisationResult = buildFinishedGraphOptimisationResult(contract);
  const finalResponse = optimisationResult?.finalOptimisedBassResponse;
  if (!optimisationResult || !finalResponse?.postEqRspCurve?.length) return empty("no-finished-graph");

  const graphPayload = contract.graphPayload || {};
  const operatingLevelOffsetDb = finite(graphPayload.operatingLevelOffsetDb)
    ? Number(graphPayload.operatingLevelOffsetDb)
    : 0;
  const roomResponseCurve = Array.isArray(graphPayload.roomResponseCurve) ? graphPayload.roomResponseCurve : [];
  const built = buildBassGraphSeries({
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

  const markers = buildRp22GraphMarkers(finalResponse, null);
  const assessmentBand = {
    startHz: finite(markers.p19StartHz) ? Number(markers.p19StartHz) : null,
    endHz: finite(markers.p19EndHz) ? Number(markers.p19EndHz) : null,
  };
  const series = pickSeries(built, P19_RSP_KINDS).map((entry) => (entry.kind === "house-curve"
    ? { ...entry, label: P19_TARGET_LABEL, ...REPORT_TARGET_STYLE }
    : { ...entry, label: P19_RSP_LABEL, ...REPORT_RSP_STYLE }));

  return {
    ready: series.length > 0,
    reason: series.length ? null : "no-curves",
    series,
    xDomain: resolveP19XDomain(assessmentBand),
    yDomain: REPORT_BASS_GRAPH_Y_DOMAIN,
    markers: {
      transitionHz: resolveOptimisationTransitionHz(roomDims),
      assessmentBand,
      limitingFrequencyHz: finite(markers.p19WorstFrequencyHz) ? Number(markers.p19WorstFrequencyHz) : null,
    },
    assessmentBand,
  };
}

/**
 * Build the Technical Report's bass response graphs.
 *
 * @param {object} params
 * @param {object|null} params.contract - the saved completed bass contract
 * @param {boolean} [params.authoritative] - the store's own authority flag
 * @param {Array} [params.seats] - project seating positions (priority lives here)
 * @param {object|null} [params.roomDims] - { widthM, lengthM, heightM }, for the marker
 * @returns {object} { ready, reason, p19, primary } — series, markers and domains
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

  // ── P19 scope: the corrected RSP response against the target, built by the
  // shared P19 authority so the Visual and Technical Reports cannot diverge. ──
  const p19 = buildP19RspGraph({ contract, authoritative, roomDims });
  const rspCorrected = p19.series.find((entry) => entry?.kind === "post-eq") || null;

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
  // Style by seat order, so a plotted Primary seat keeps its own colour and dash
  // pattern whatever order the builders return its curve in.
  const seatOrder = new Map(plottedIds.map((seatId, index) => [String(seatId), index]));
  const styledSeats = seatSeries
    .filter((entry) => entry.kind === "post-eq" && entry.seatId !== "rsp")
    .map((entry, index) => ({
      ...entry,
      ...reportSeatStyle(seatOrder.has(String(entry.seatId)) ? seatOrder.get(String(entry.seatId)) : index),
    }));
  const styledTarget = seatSeries
    .filter((entry) => entry.kind === "house-curve")
    .slice(0, 1)
    .map((entry) => ({ ...entry, ...REPORT_TARGET_STYLE }));

  const primarySeries = [
    ...(reference ? [{ ...reference, ...REPORT_RSP_STYLE }] : []),
    ...styledSeats,
    ...styledTarget,
  ];

  // The canonical seat label the bass graph itself uses (seat-r1-c1 → R1S1).
  const primarySeatLabel = (seatId) => formatSeatPillLabel(seatId);

  // A page is drawn from whatever curve it actually has: a saved contract
  // without the post-EQ RSP curve must not hide the Primary Seats page.
  const hasAnyCurve = p19.series.length > 0 || primarySeries.length > 0;

  return {
    ready: hasAnyCurve,
    reason: hasAnyCurve ? null : "no-curves",
    p19,
    transitionHz,
    limitingFrequencyHz: finite(markers.p19WorstFrequencyHz) ? Number(markers.p19WorstFrequencyHz) : null,
    p18FrequencyHz: finite(markers.p18FrequencyHz) ? Number(markers.p18FrequencyHz) : null,
    assessmentBand: {
      startHz: finite(markers.p19StartHz) ? Number(markers.p19StartHz) : null,
      endHz: finite(markers.p19EndHz) ? Number(markers.p19EndHz) : null,
    },
    yDomain: REPORT_BASS_GRAPH_Y_DOMAIN,
    primary: {
      xDomain: resolveXDomain(primarySeries.length ? primarySeries : p19.series),
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