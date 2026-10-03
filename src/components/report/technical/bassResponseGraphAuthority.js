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
// Smoothing: the report plots the authority curves unsmoothed. Fractional-octave
// smoothing is a live-graph display preference, not an engineering value, so the
// report shows the published curve exactly as it was published.
// ---------------------------------------------------------------------------

import { buildBassGraphSeries } from "@/components/room/bass/bassGraphDomainBuilder";
import {
  buildFinishedGraphOptimisationResult,
  hasGraphPayload,
} from "@/components/room/bass/finishedGraphAdapter";
import { buildRp22GraphMarkers } from "@/components/room/bass/rp22GraphMarkers";
import { resolveOptimisationTransitionHz } from "@/components/room/bass/optimisationTransitionAuthority";
import { getPrimarySeats } from "@/components/utils/seatPriorityAuthority";

/** The graph's own axis policy — the same 70–140 dB window the app graph locks. */
export const REPORT_BASS_GRAPH_Y_DOMAIN = [70, 140];
export const REPORT_BASS_GRAPH_X_DOMAIN = [15, 200];
export const REPORT_BASS_GRAPH_X_DOMAIN_WIDE = [15, 300];

/** The mandated note on the RSP page. */
export const RSP_GRAPH_NOTE = "RSP response is the reference bass response used for P19.";

/** Colour-independent caps so the page stays readable. */
export const REPORT_PRIMARY_SEAT_LIMIT = 8;

const finite = (value) => value !== null && value !== "" && Number.isFinite(Number(value));

/** The series the report plots, chosen by kind from the app's own builder output. */
const RSP_PAGE_KINDS = ["room-response", "post-eq", "house-curve"];
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
    smoothingMode: "none",
    operatingLevelOffsetDb,
  });
  const rspSeries = pickSeries(rspBuilt, RSP_PAGE_KINDS);
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
      smoothingMode: "none",
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

  const primarySeatLabel = (seatId) => {
    const seat = primarySeats.find((candidate) => candidate?.id === seatId);
    const row = seat?.row ?? seat?.rowNumber;
    const index = seat?.indexInRow ?? seat?.column;
    return row != null && index != null ? `R${row}S${index}` : seatId;
  };

  return {
    ready: rspSeries.length > 0,
    reason: rspSeries.length > 0 ? null : "no-curves",
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
      note: RSP_GRAPH_NOTE,
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