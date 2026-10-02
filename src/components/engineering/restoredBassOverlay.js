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
 * A summary that already states its bass results is returned untouched, so this
 * can never change a value that was already published.
 */

import { getCompletedBassAuthority } from "@/components/room/bass/completedBassResultStore";
import { buildComplianceBassPresentation } from "@/components/room/bass/bassCompliancePresentation";
import { statesBassResultEntry } from "@/components/engineering/versionedEngineeringAuthority";

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

  // ── Parameter authority levels (so the grid shows the restored level) ─────
  const parameterAuthority = { ...(summary.parameterAuthority || {}) };
  for (const id of BASS_PARAM_IDS) {
    const key = `p${id}`;
    const parameter = parameters[key];
    const existing = parameterAuthority[key];
    if (!overlaidIds.has(id) || !parameter || !existing) continue;
    const scored = hasLevel(parameter.level);
    parameterAuthority[key] = {
      ...existing,
      state: scored ? "scored" : existing.state,
      level: scored ? parameter.level : existing.level,
      rawValue: parameter.rawValue ?? existing.rawValue ?? null,
      restoredFromSavedBassAuthority: true,
    };
  }

  // ── P20 per-seat rows (assessed seat by seat) ────────────────────────────
  // The saved summary holds placeholder rows when its own bass was not
  // restored; the per-seat results come from the restored contract through the
  // same presentation authority the Room Designer reads.
  let project = summary.project;
  const reportCounts = summary.project?.reportCounts;
  const savedRows = reportCounts?.seatResultsByParameter?.p20;
  const perSeat = presentation?.perSeatP20Results;
  if (Array.isArray(savedRows) && Array.isArray(perSeat) && perSeat.length) {
    const bySeatId = new Map();
    for (const seat of perSeat) {
      if (seat?.seatId != null) bySeatId.set(String(seat.seatId), seat);
    }
    if (bySeatId.size) {
      const restoreRow = (row) => {
        // Preserve a genuinely scored zero; only replace unscored placeholder
        // rows such as the old ±0.0 dB report rows.
        if (row?.status === "scored"
          && statesBassResultEntry({ value: row?.value, formatted: row?.valueFormatted })) {
          return row;
        }
        const seat = bySeatId.get(String(row?.seatId));
        const raw = Number(seat?.variationDbRaw);
        if (!seat || !Number.isFinite(raw)) return row;
        overlaid = true;
        return {
          ...row,
          valueFormatted: `±${raw.toFixed(1)} dB`,
          level: Number.isFinite(Number(seat.level)) ? `L${Math.max(1, Number(seat.level))}` : row.level,
          value: raw,
          status: "scored",
          worstFrequencyHz: seat.worstFrequencyHz ?? row.worstFrequencyHz ?? null,
          restoredFromSavedBassAuthority: true,
        };
      };
      project = {
        ...summary.project,
        reportCounts: {
          ...reportCounts,
          seatResultsByParameter: {
            ...reportCounts.seatResultsByParameter,
            p20: savedRows.map(restoreRow),
          },
        },
      };
    }
  }

  if (!overlaid) return summary;

  return {
    ...summary,
    roomResultsByParameter: roomResults,
    parameterAuthority,
    project,
    // Provenance: consumers and diagnostics can see these bass values came from
    // the restored durable bass authority rather than the saved summary.
    bassAuthoritySource: "restored-durable-bass-authority",
  };
}

export default applyRestoredBassAuthority;