/**
 * restoredBassOverlay.js
 * ----------------------
 * Overlays the RESTORED DURABLE BASS AUTHORITY onto a saved engineering summary
 * that does not state its own bass results.
 *
 * Why this exists
 * ---------------
 * A saved engineering summary is written once per engineering fingerprint. A
 * summary published while the completed bass authority was not restored carries
 * the RP22 parameters but no P14/P18/P19 (and P20 placeholder rows). Reports
 * read summaries — so those reports rendered empty bass boxes even though the
 * bass result was saved in ProjectAnalysisCache all along.
 *
 * This module closes that gap at the single read seam every report already
 * shares. It reads the SAME restored completed bass authority the Room Designer
 * reads (hydrated from the database), never a live UI store, and never
 * recalculates anything: every value comes from the restored contract through
 * the shared bass presentation authority.
 *
 * Every bass field is repaired independently. Already-published values are
 * preserved, while missing P14/P18/P19 fields and placeholder P20 seat rows are
 * restored from the durable contract.
 */

import { getCompletedBassAuthority } from "@/components/room/bass/completedBassResultStore";
import { buildComplianceBassPresentation } from "@/components/room/bass/bassCompliancePresentation";
import { statesBassResultEntry } from "@/components/engineering/versionedEngineeringAuthority";
import { summariseEngineeringResults } from "@/components/engineering/engineeringSummaryAuthority";

/** The bass parameters the reports read (P19 is RSP-scoped, P20 is per seat). */
const BASS_PARAM_IDS = [14, 18, 19, 20];

const hasLevel = (level) => level != null && level !== "—" && level !== "";

export function applyRestoredBassAuthority(summary, { projectId, versionId, completedBassAuthority = null } = {}) {
  if (!summary || !projectId || !versionId) return summary;
  const authority = completedBassAuthority || getCompletedBassAuthority(projectId, versionId);
  if (!authority?.contract) return summary;

  let presentation = null;
  try {
    presentation = buildComplianceBassPresentation(
      { completedBassAuthority: authority },
      authority.errorMessage || null,
    );
  } catch (error) {
    return summary;
  }
  const parameters = presentation?.parameters || null;
  if (!parameters) return summary;

  // ── P14 / P18 / P19 / P20 room results ────────────────────────────────────
  const roomResults = { ...(summary.roomResultsByParameter || {}) };
  let overlaid = false;
  const overlaidIds = new Set();
  for (const id of BASS_PARAM_IDS) {
    const parameter = parameters[`p${id}`];
    const existing = roomResults[id] || roomResults[String(id)] || {};
    // Preserve each already-published result independently. A complete P14
    // must not prevent a missing P19 or placeholder P20 from being restored.
    if (statesBassResultEntry(existing)) continue;
    if (!statesBassResultEntry({ value: parameter?.rawValue, formatted: parameter?.valueText })) continue;
    roomResults[id] = {
      ...existing,
      ...parameter,
      status: parameter.status,
      value: parameter.rawValue ?? null,
      formatted: parameter.valueText,
      level: parameter.level ?? null,
      detail: parameter.detail ?? existing.detail ?? null,
      targetBasis: parameter.targetBasis ?? existing.targetBasis ?? null,
      restoredFromSavedBassAuthority: true,
    };
    overlaid = true;
    overlaidIds.add(id);
  }

  // ── Parameter authority levels (so every report sees a terminal result) ──
  const parameterAuthority = { ...(summary.parameterAuthority || {}) };
  const perSeat = Array.isArray(presentation?.perSeatP20Results)
    ? presentation.perSeatP20Results
    : [];

  // Repairing the parameter authority is a result in its own right: a summary
  // whose bass results were all present can still carry a stale parameter label
  // (for example a legacy per-seat P19 "provisional"). That repair must be
  // published, not discarded because no room result needed filling.
  let authorityRepaired = false;

  for (const id of BASS_PARAM_IDS) {
    const key = `p${id}`;
    const parameter = parameters[key];
    const existing = parameterAuthority[key];
    if (!parameter || !existing) continue;

    const scored = hasLevel(parameter.level);
    const next = {
      ...existing,
      state: scored ? "scored" : existing.state,
      level: scored ? parameter.level : existing.level,
      rawValue: parameter.rawValue ?? existing.rawValue ?? null,
      restoredFromSavedBassAuthority: overlaidIds.has(id) || existing.restoredFromSavedBassAuthority === true,
    };
    if (next.state !== existing.state || next.level !== existing.level) authorityRepaired = true;

    // P19 is one RSP result, not a per-seat assessment.
    if (id === 19 && overlaidIds.has(id)) {
      next.scope = "room";
      next.seats = null;
    }

    // P20 is seat-scoped. Restore the canonical seat grades as well as the
    // display rows so completeness/rating authority cannot remain provisional.
    if (id === 20 && perSeat.length) {
      const seats = { ...(existing.seats || {}) };
      for (const seat of perSeat) {
        const seatId = seat?.seatId == null ? null : String(seat.seatId);
        const raw = Number(seat?.variationDbRaw);
        if (!seatId || !Number.isFinite(raw)) continue;
        const previous = seats[seatId] || {};
        if (previous.state === "scored"
          && statesBassResultEntry({ value: previous.rawValue, formatted: previous.formatted })) {
          continue;
        }
        seats[seatId] = {
          ...previous,
          state: "scored",
          level: Number.isFinite(Number(seat.level)) ? `L${Math.max(1, Number(seat.level))}` : previous.level,
          rawValue: raw,
          reason: null,
          restoredFromSavedBassAuthority: true,
        };
        overlaid = true;
      }
      next.scope = "seat";
      next.state = "scored";
      next.seats = seats;
    }

    parameterAuthority[key] = next;
  }

  if (!overlaid && !authorityRepaired) return summary;

  // Rebuild only the derived rating/report views from the already-published
  // parameter grades. This is not a bass recalculation: it prevents an old
  // NOT_ASSESSED aggregate surviving after its saved bass grades are restored.
  const seatIds = Array.isArray(summary.project?.seatIds)
    ? summary.project.seatIds
    : Object.keys(summary.seatHudById || {});
  const primarySeatIds = new Set((summary.primary?.seatIds || []).map(String));
  const seats = seatIds.map((seatId) => ({
    id: seatId,
    isPrimary: primarySeatIds.has(String(seatId)),
    priority: primarySeatIds.has(String(seatId)) ? "primary" : "secondary",
  }));
  let rebuilt = null;
  try {
    rebuilt = summariseEngineeringResults({
      designRatingAuthority: { parameters: parameterAuthority, seatIds },
      seats,
      seatHudById: summary.seatHudById || {},
      roomResultsByParameter: roomResults,
      p19SeatAuthority: summary.p19SeatAuthority || null,
      perSeatRp23: {},
    });
  } catch {
    rebuilt = null;
  }

  let project = rebuilt?.project
    ? { ...summary.project, ...rebuilt.project }
    : summary.project;
  const reportCounts = project?.reportCounts;
  const savedRows = reportCounts?.seatResultsByParameter?.p20;

  // Preserve/restore limiting-frequency evidence on the rebuilt P20 rows.
  if (Array.isArray(savedRows) && perSeat.length) {
    const bySeatId = new Map(perSeat
      .filter((seat) => seat?.seatId != null)
      .map((seat) => [String(seat.seatId), seat]));
    project = {
      ...project,
      reportCounts: {
        ...reportCounts,
        seatResultsByParameter: {
          ...reportCounts.seatResultsByParameter,
          p20: savedRows.map((row) => {
            const seat = bySeatId.get(String(row?.seatId));
            const raw = Number(seat?.variationDbRaw);
            if (!seat || !Number.isFinite(raw)) return row;
            return {
              ...row,
              valueFormatted: `±${raw.toFixed(1)} dB`,
              level: Number.isFinite(Number(seat.level)) ? `L${Math.max(1, Number(seat.level))}` : row.level,
              value: raw,
              status: "scored",
              worstFrequencyHz: seat.worstFrequencyHz ?? row.worstFrequencyHz ?? null,
              restoredFromSavedBassAuthority: true,
            };
          }),
        },
      },
    };
  }

  return {
    ...summary,
    roomResultsByParameter: roomResults,
    parameterAuthority,
    parameterSummaries: rebuilt?.parameterSummaries || summary.parameterSummaries,
    primary: rebuilt?.primary ? { ...summary.primary, ...rebuilt.primary } : summary.primary,
    secondary: rebuilt?.secondary ? { ...summary.secondary, ...rebuilt.secondary } : summary.secondary,
    project,
    designRating: rebuilt?.designRating || summary.designRating,
    // Provenance: consumers and diagnostics can see these bass values came from
    // the restored durable bass authority rather than the saved summary.
    bassAuthoritySource: "restored-durable-bass-authority",
  };
}

export default applyRestoredBassAuthority;