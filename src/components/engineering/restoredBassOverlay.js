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

import {
  BASS_AUTHORITY_STATUS,
  bassContractMatchesRequestedP14,
  getCompletedBassAuthority,
} from "@/components/room/bass/completedBassResultStore";
import { buildComplianceBassPresentation } from "@/components/room/bass/bassCompliancePresentation";
import { statesBassResultEntry } from "@/components/engineering/versionedEngineeringAuthority";
import { summariseEngineeringResults } from "@/components/engineering/engineeringSummaryAuthority";
import { describeBassReconciliationStaleness } from "@/components/room/bass/bassReconciliationStatus";
import {
  LEVEL_MULTIPLIERS,
  PARAM_WEIGHTS,
} from "@/components/report/technical/artcousticSystemDesignRating";

/** The bass parameters the reports read (P19 is RSP-scoped, P20 is per seat). */
const BASS_PARAM_IDS = [14, 18, 19, 20];

const hasLevel = (level) => level != null && level !== "—" && level !== "";

const normaliseLevel = (level) => {
  const text = String(level ?? "").trim().toUpperCase();
  if (/^L[1-4]$/.test(text) || text === "FAIL") return text;
  const numeric = Number(level);
  return Number.isFinite(numeric) && numeric >= 1 && numeric <= 4
    ? `L${Math.round(numeric)}`
    : null;
};

export const SAVED_BASS_OUT_OF_DATE_MESSAGE =
  "Saved bass analysis is out of date. Update Bass Performance before generating reports.";

/**
 * Fail-closed currentness check for report/proposal use.
 *
 * The completed-bass store deliberately preserves the previous contract while
 * the active design is stale/updating so Bass UI can explain the old result.
 * Reports may use that contract only when the store has independently promoted
 * it to the current, reliable authority for the active fingerprint.
 */
export function assessRestoredBassAuthorityCurrentness(authority) {
  const contract = authority?.contract || null;
  if (!contract) {
    return { current: false, outOfDate: false, reason: "missing-completed-contract" };
  }

  const currentFingerprint = authority?.currentFingerprint || null;
  const resultFingerprint = contract?.job?.resultFingerprint || null;
  const currentJobFingerprint = contract?.job?.currentJobFingerprint || null;

  if (authority?.status !== "complete") {
    return { current: false, outOfDate: true, reason: `authority-status-${authority?.status || "unknown"}` };
  }
  if (authority?.authorityStatus !== BASS_AUTHORITY_STATUS.AUTHORITATIVE) {
    return { current: false, outOfDate: true, reason: `authority-${authority?.authorityStatus || "unknown"}` };
  }
  if (authority?.authoritative !== true || authority?.exportable !== true) {
    return { current: false, outOfDate: true, reason: "authority-not-reliable" };
  }
  // These flags are produced only by resolvePersistedBassAuthority(), which
  // applies the current cache/instance/metric schema checks and validates the
  // canonical metric-publication receipt. Reuse that one authority decision
  // instead of duplicating its physics/schema logic here.
  if (authority?.structurallyComplete !== true) {
    return { current: false, outOfDate: true, reason: "contract-incomplete-or-schema-unsupported" };
  }
  if (!["ready", "complete"].includes(contract?.job?.status)) {
    return { current: false, outOfDate: true, reason: "contract-job-not-complete" };
  }
  if (!currentFingerprint || !resultFingerprint || currentFingerprint !== resultFingerprint) {
    return { current: false, outOfDate: true, reason: "active-design-fingerprint-mismatch" };
  }
  if (!currentJobFingerprint || currentJobFingerprint !== currentFingerprint) {
    return { current: false, outOfDate: true, reason: "contract-job-fingerprint-mismatch" };
  }

  // v4+ calculation fingerprints include the selected P14 target identity.
  // When a caller also supplies the explicit requested identity, enforce the
  // existing contract-level comparison as a second, readable guard.
  if (authority?.requestedP14Identity
    && !bassContractMatchesRequestedP14(contract, authority.requestedP14Identity)) {
    return { current: false, outOfDate: true, reason: "selected-target-identity-mismatch" };
  }

  return { current: true, outOfDate: false, reason: null };
}

export function applyRestoredBassAuthority(summary, { projectId, versionId, completedBassAuthority = null } = {}) {
  if (!summary || !projectId || !versionId) return summary;
  const authority = completedBassAuthority || getCompletedBassAuthority(projectId, versionId);
  const currentness = assessRestoredBassAuthorityCurrentness(authority);
  if (!currentness.current) {
    if (!currentness.outOfDate) return summary;
    // Name what moved when reconciliation compared the rebuilt identity's inputs
    // with the saved ones — "out of date" alone gives the designer nothing to act
    // on.
    const moved = describeBassReconciliationStaleness(projectId, versionId);
    return {
      ...summary,
      bassAuthoritySource: "restored-durable-bass-authority-rejected",
      bassAuthorityCurrent: false,
      bassAuthorityRejectionReason: currentness.reason,
      bassAuthorityMessage: moved
        ? `${SAVED_BASS_OUT_OF_DATE_MESSAGE} Changed since this result: ${moved}.`
        : SAVED_BASS_OUT_OF_DATE_MESSAGE,
    };
  }

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

    const level = normaliseLevel(parameter.level);
    const scored = hasLevel(level);
    const mode = parameter.targetBasis || existing.mode || existing.targetBasis || null;
    const baseWeight = PARAM_WEIGHTS[key];
    const effectiveWeight = key === "p14" && mode === "recommended"
      ? baseWeight + 2
      : baseWeight;
    const next = {
      ...existing,
      state: scored ? "scored" : existing.state,
      level: scored ? level : existing.level,
      multiplier: scored ? (LEVEL_MULTIPLIERS[level] ?? existing.multiplier ?? 0) : existing.multiplier,
      effectiveWeight: Number.isFinite(effectiveWeight) ? effectiveWeight : existing.effectiveWeight,
      mode,
      rawValue: parameter.rawValue ?? existing.rawValue ?? null,
      restoredFromSavedBassAuthority: overlaidIds.has(id) || existing.restoredFromSavedBassAuthority === true,
    };
    if (next.state !== existing.state
      || next.level !== existing.level
      || next.multiplier !== existing.multiplier
      || next.effectiveWeight !== existing.effectiveWeight
      || next.mode !== existing.mode
      || next.rawValue !== existing.rawValue) {
      authorityRepaired = true;
    }

    // P19 is one RSP result, not a per-seat assessment. Repair legacy summaries
    // that already contain the result but still label it as seat-scoped; without
    // this repair the UI can display P19 while the canonical scorecard omits it.
    if (id === 19 && scored) {
      if (next.scope !== "room" || next.seats != null) authorityRepaired = true;
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
        const seatLevel = normaliseLevel(seat.level) || previous.level || null;
        const seatMultiplier = LEVEL_MULTIPLIERS[seatLevel] ?? previous.multiplier ?? 0;
        if (previous.state === "scored"
          && statesBassResultEntry({ value: previous.rawValue, formatted: previous.formatted })) {
          if (previous.level !== seatLevel || previous.multiplier !== seatMultiplier) {
            seats[seatId] = {
              ...previous,
              level: seatLevel,
              multiplier: seatMultiplier,
              restoredFromSavedBassAuthority: true,
            };
            authorityRepaired = true;
          }
          continue;
        }
        seats[seatId] = {
          ...previous,
          state: "scored",
          level: seatLevel,
          multiplier: seatMultiplier,
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
    bassAuthorityCurrent: true,
    bassAuthorityRejectionReason: null,
    bassAuthorityMessage: null,
  };
}

export default applyRestoredBassAuthority;