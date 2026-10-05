/**
 * p17SeatEvidenceAuthority.js
 * ---------------------------
 * READ-ONLY P17 (surround/wide/overhead timbre) seat evidence.
 *
 * P17 IS A DESIGN GUIDE BASED ON OFF-AXIS SUITABILITY, NOT A POLAR SIMULATION.
 *
 * Each speaker model carries coverage windows — the angle at which it is
 * approximately 1.5 dB / 3 dB / 4 dB down over the relevant octave band. Those
 * windows are derived from measured polar data where the model has it, and are
 * declared/estimated otherwise. A seat is graded from the EFFECTIVE OFF-AXIS
 * ANGLE of the channel that covers it:
 *
 *   L4 = within the 1.5 dB window
 *   L3 = within the 3 dB window
 *   L2 = outside 3 dB, still inside the usable (4 dB) window
 *   L1 = outside the usable coverage window
 *
 * Raw measured polar deviation is NEVER the seat's P17 score; it survives here
 * as read-only diagnostics only, so a product is not punished for having more
 * detailed data than its neighbour.
 *
 * This module resolves, from evidence that already exists, which seat is limiting,
 * which speaker and angle decided it, which window that angle falls in — and it
 * never grades anything itself. The level the engine already produced is reported
 * verbatim.
 *
 * NO CALCULATION IS PERFORMED HERE and nothing is written. The level the engine
 * already produced is reported verbatim; the uncapped level is re-derived from
 * the same P17 level authority (`levelP17_wsFR` + `numericRp22Level`) purely so
 * the cap can be identified as decisive or not.
 *
 * Pure: no React, no SDK, no writes, no side effects.
 */

import { levelP17_wsFR, numericRp22Level } from "@/components/utils/rp22/levels";
import { formatSeatLabel } from "@/components/utils/seatLabel";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import {
  P17_EVIDENCE_TYPE,
  P17_WINDOW_CAUSE_LABEL,
  resolveP17Windows,
} from "@/components/utils/rp22/p17CoverageWindows";

/** The RP22 P17 coverage cap: a speaker beyond its −3 dB window caps the level here. */
export const P17_COVERAGE_CAP_LEVEL = 2;

/** Generic fallback half-window used by the engine when a model publishes no −3 dB data. */
export const P17_COVERAGE_FALLBACK_DEG = 41;

/** Overhead roles: the only P17 roles where speaker height affects the angle. */
const OVERHEAD_ROLE = /^T(F|M|R)(L|R|C)?$/;

export function isOverheadP17Role(role) {
  return OVERHEAD_ROLE.test(String(role || "").trim().toUpperCase());
}

const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** Level label ("L3") → number (3). Returns null when unreadable. */
export function readLevelNumber(level) {
  const match = String(level ?? "").trim().toUpperCase().match(/^L([1-4])$/);
  return match ? Number(match[1]) : null;
}

/**
 * The model's −3 dB coverage half-window in degrees, read from the speaker model
 * registry — the same number the engine thresholds the off-axis angle against.
 * Registry dispersion values are already half-angles (the engine's own
 * `halfDispersionDeg` does not divide them again). Overheads threshold on the
 * wider of the horizontal and vertical −3 dB windows, exactly as the engine does.
 * Null when the model publishes none — the limit is never invented.
 */
export function readModelCoverageLimitDeg(modelKey, { overhead = false } = {}) {
  if (!modelKey) return null;
  const meta = getSpeakerModelMeta(modelKey);
  const disp = meta?.dispersion;
  const read = (window) => {
    const value = window?.minus3dB ?? window?.minus3;
    return Number.isFinite(value) ? Math.ceil(value) : null;
  };
  const horizontal = read(disp?.horizontal);
  if (!overhead) return horizontal;
  const vertical = read(disp?.vertical);
  if (horizontal != null && vertical != null) return Math.max(horizontal, vertical);
  return horizontal ?? vertical;
}

/**
 * The coverage windows behind a seat's grade: the record's own evidence when the
 * publication carries it, else the limiting speaker model's own windows read from
 * the registry (a product property — measured-derived where the model has polar
 * data, declared/estimated otherwise). Null when the model is unknown.
 */
function resolveRowWindows(p17, limitingModel, limitingRole) {
  if (p17?.windows && typeof p17.windows === "object") return p17.windows;
  if (!limitingModel) return null;
  return resolveP17Windows(limitingModel, null, { overhead: isOverheadP17Role(limitingRole) });
}

/**
 * The P17 design-guide basis behind a seat's grade. A record carrying a window
 * level was graded by the coverage-window method; one that does not predates it
 * (its stored level came from the earlier variance basis) and is reported as such
 * rather than silently re-graded.
 */
function resolveRowBasis(p17) {
  const windowLevel = /^L[1-4]$/.test(String(p17?.windowLevel || "")) ? p17.windowLevel : null;
  if (windowLevel) {
    return {
      basis: "coverage_window",
      windowLevel,
      windowLevelNumber: readLevelNumber(windowLevel),
      windowCause: p17.cause || null,
    };
  }
  return { basis: "earlier_variance_basis", windowLevel: null, windowLevelNumber: null, windowCause: null };
}

/** The cause text shown for a row, in the panel's own plain language. */
function causeLabelFor({ basis, windowCause, evidenceAvailable }) {
  if (!evidenceAvailable) return "Missing evidence";
  if (basis !== "coverage_window") return "Graded on the earlier variance basis";
  return P17_WINDOW_CAUSE_LABEL[windowCause] || "Missing evidence";
}

/**
 * Which evidence decided the level: raw variance, or the model coverage cap.
 *
 * LEGACY (read-only): this rule graded P17 before the design-guide method. It is
 * kept so a saved publication from that era is still explained in its own terms.
 *
 * The uncapped level is re-derived from the same authority the engine uses, so
 * the answer matches the produced level exactly.
 */
export function resolveP17Cause({ rawVarianceDb, level } = {}) {
  const variance = num(rawVarianceDb);
  if (variance == null) {
    return { uncappedLevel: null, level: level ?? null, capApplied: false, cause: null };
  }
  const uncappedLevel = numericRp22Level(levelP17_wsFR(variance));
  const reportedLevel = level ?? uncappedLevel;
  const capApplied = readLevelNumber(reportedLevel) !== readLevelNumber(uncappedLevel)
    && readLevelNumber(reportedLevel) === P17_COVERAGE_CAP_LEVEL;
  return {
    uncappedLevel,
    level: reportedLevel,
    capApplied,
    cause: capApplied ? "coverage_cap" : "raw_variance",
  };
}

/**
 * Every speaker evaluated at the seat, worst delta first — the evidence behind the
 * seat's single limiting row. A live result and a saved publication carry the same
 * per-speaker shape; a field the record does not carry stays null and renders as
 * unavailable. Nothing is inferred.
 */
function readSeatSpeakers(p17) {
  const list = Array.isArray(p17?.perSpeaker) ? p17.perSpeaker : [];
  return list
    .map((entry) => ({
      role: entry?.role ?? null,
      model: entry?.model ?? null,
      angleDeg: num(entry?.angleDeg) ?? num(entry?.rawAngleDeg),
      rspAngleDeg: num(entry?.rspAngleDeg),
      // Raw seat-versus-RSP response delta — read-only legacy diagnostic.
      lossDb: num(entry?.lossDb),
      beyondLimit: entry?.isBeyondNonLcrLimit === true,
      // ── P17 design-guide evidence for this speaker at this seat ──
      windowDb: num(entry?.windowDb),
      windowLevel: entry?.windowLevel ?? null,
      windowLevelNumber: num(entry?.windowLevelNumber),
      windows: entry?.windows ?? null,
      evidenceType: entry?.evidenceType ?? null,
      windowCause: entry?.cause ?? null,
      // ── Acoustic-axis evidence (read-only): the geometric ceiling angle, the product's
      // built-in tilt, and the axis the effective angle is measured from. ──
      geometricAngleDeg: num(entry?.geometricAngleDeg),
      rspGeometricAngleDeg: num(entry?.rspGeometricAngleDeg),
      builtInTiltDeg: num(entry?.builtInTiltDeg),
      axisBasis: entry?.axisBasis ?? null,
    }))
    .sort((a, b) => {
      const levelDiff = (b.windowLevelNumber ?? -1) - (a.windowLevelNumber ?? -1);
      if (levelDiff !== 0) return levelDiff;
      return (b.angleDeg ?? -1) - (a.angleDeg ?? -1);
    });
}

/** The speaker entry that set the seat's variance — live evidence, else the saved worst role. */
function resolveLimitingEntry(p17) {
  if (p17?.limiting && typeof p17.limiting === "object") return p17.limiting;
  const list = Array.isArray(p17?.perSpeaker) ? p17.perSpeaker : [];
  if (!list.length) return null;
  const byRole = list.find((entry) => entry?.role === p17?.worstRole);
  if (byRole) return byRole;
  return list
    .slice()
    .sort((a, b) => (num(b?.lossDb) ?? -1) - (num(a?.lossDb) ?? -1))[0] || null;
}

/** Speakers beyond their model's −3 dB window (saved evidence keeps a per-speaker flag). */
function resolveBeyondLimit(p17) {
  if (Array.isArray(p17?.beyondLimit) && p17.beyondLimit.length) return p17.beyondLimit;
  const list = Array.isArray(p17?.perSpeaker) ? p17.perSpeaker : [];
  return list.filter((entry) => entry?.isBeyondNonLcrLimit === true);
}

/**
 * One read-only evidence row per seat, from either live or saved P17 evidence.
 *
 * Fields the evidence does not carry are null and reported as unavailable — they
 * are never inferred.
 *
 * @param {object} params
 * @param {Array} params.seats - ordered seating positions ({id, label?})
 * @param {object} params.p17BySeatId - seatId → P17 metric (live or published)
 */
export function buildP17SeatEvidenceRows({ seats = [], p17BySeatId = {} } = {}) {
  const ordered = Array.isArray(seats) ? seats : [];
  const rows = [];

  for (const seat of ordered) {
    const seatId = seat?.id || `seat-${seat?.x}-${seat?.y}`;
    const p17 = p17BySeatId?.[seatId] || null;
    if (!p17) {
      rows.push({
        seatId,
        seatLabel: seat?.label || formatSeatLabel(seatId),
        level: null,
        // ── P17 design-guide basis (the graded result) ──
        basis: "none",
        windowLevel: null,
        windowLevelNumber: null,
        windows: null,
        evidenceType: P17_EVIDENCE_TYPE.MISSING,
        windowCause: null,
        windowCauseLabel: P17_WINDOW_CAUSE_LABEL.missing_evidence,
        effectiveAngleDeg: null,
        // ── acoustic-axis evidence (absent until a channel is evaluated here) ──
        geometricAngleDeg: null,
        rspGeometricAngleDeg: null,
        builtInTiltDeg: null,
        axisBasis: null,
        // ── read-only legacy diagnostics ──
        rawVarianceDb: null,
        uncappedLevel: null,
        capApplied: false,
        cause: null,
        limitingRole: null,
        limitingModel: null,
        limitingPosition: null,
        seatAngleDeg: null,
        rspAngleDeg: null,
        seatLossDb: null,
        rspLossDb: null,
        coverageLimitDeg: null,
        hasNaAngles: false,
        beyondLimit: [],
        speakers: [],
        evidenceAvailable: false,
      });
      continue;
    }

    const limiting = resolveLimitingEntry(p17);
    const beyondLimit = resolveBeyondLimit(p17);
    const rawVarianceDb = num(p17.rawVarianceDb) ?? num(p17.value);
    const level = p17.level ?? null;

    // ── P17 design-guide basis: what actually graded this seat ──
    const grade = resolveRowBasis(p17);
    const limitingModel = limiting?.model ?? null;
    const limitingRole = limiting?.role ?? p17.worstRole ?? null;
    const windows = resolveRowWindows(p17, limitingModel, limitingRole);
    const evidenceType = p17.evidenceType
      || windows?.evidenceType
      || P17_EVIDENCE_TYPE.MISSING;
    const effectiveAngleDeg = num(limiting?.angleDeg) ?? num(p17.worstAngleDeg);

    // LEGACY (read-only): the variance-versus-cap reading, kept so a saved
    // publication from before the design-guide method is still explained.
    const cause = resolveP17Cause({ rawVarianceDb, level });
    const coverageLimitDeg = num(p17.coverageLimitDeg)
      ?? num(limiting?.coverageLimitDeg)
      ?? readModelCoverageLimitDeg(limitingModel, { overhead: isOverheadP17Role(limitingRole) });

    rows.push({
      seatId,
      seatLabel: seat?.label || formatSeatLabel(seatId),
      level,
      // ── P17 design-guide basis (the graded result) ──
      basis: grade.basis,
      windowLevel: grade.windowLevel,
      windowLevelNumber: grade.windowLevelNumber,
      windows,
      evidenceType,
      windowCause: grade.windowCause,
      windowCauseLabel: causeLabelFor({ basis: grade.basis, windowCause: grade.windowCause, evidenceAvailable: true }),
      effectiveAngleDeg,
      // ── acoustic-axis evidence for the deciding channel (read-only, never graded) ──
      geometricAngleDeg: num(limiting?.geometricAngleDeg) ?? num(p17.geometricAngleDeg),
      rspGeometricAngleDeg: num(limiting?.rspGeometricAngleDeg) ?? num(p17.rspGeometricAngleDeg),
      builtInTiltDeg: num(limiting?.builtInTiltDeg) ?? num(p17.builtInTiltDeg),
      axisBasis: limiting?.axisBasis ?? p17.axisBasis ?? null,
      // ── read-only legacy diagnostics ──
      rawVarianceDb,
      uncappedLevel: cause.uncappedLevel ?? level,
      capApplied: cause.capApplied,
      cause: cause.cause,
      limitingRole,
      limitingModel,
      limitingPosition: limiting?.position ?? null,
      seatAngleDeg: effectiveAngleDeg,
      rspAngleDeg: num(limiting?.rspAngleDeg),
      seatLossDb: num(limiting?.lossAtSeat),
      rspLossDb: num(limiting?.lossAtRsp),
      coverageLimitDeg,
      hasNaAngles: p17.p17HasNaAngles === true,
      beyondLimit: beyondLimit.map((entry) => ({
        role: entry?.role ?? null,
        model: entry?.model ?? null,
        angleDeg: num(entry?.angleDeg),
        coverageLimitDeg: num(entry?.coverageLimitDeg),
      })),
      speakers: readSeatSpeakers(p17),
      evidenceAvailable: true,
    });
  }

  return rows;
}

/** Convenience adapter: the P17 metric per seat from a published engineering summary. */
export function p17MetricsFromEngineeringSummary(engineeringSummary) {
  const hud = engineeringSummary?.seatHudById || {};
  const out = {};
  for (const [seatId, metrics] of Object.entries(hud)) {
    const p17 = metrics?.rp22?.p17;
    if (p17) out[seatId] = p17;
  }
  return out;
}

/** role → model, from a saved version's own design state (read-only). */
export function speakersByRoleFromDesignState(designState) {
  const list = Array.isArray(designState?.selected_speakers) ? designState.selected_speakers : [];
  const out = {};
  for (const speaker of list) {
    const role = String(speaker?.role || "").toUpperCase();
    if (role && speaker?.model) out[role] = speaker.model;
  }
  return out;
}

/**
 * Fill the limiting speaker's model (and its −3 dB coverage limit) on saved rows
 * from the version's own model selection. Saved publications never persisted the
 * model, so it is read from the version's design state — never guessed.
 */
export function applySavedSpeakerModels(rows = [], speakersByRole = {}) {
  return rows.map((row) => {
    if (!row.evidenceAvailable || row.limitingModel) return row;
    const model = speakersByRole[String(row.limitingRole || "").toUpperCase()] || null;
    if (!model) return row;
    const overhead = isOverheadP17Role(row.limitingRole);
    // The windows are a property of the product, so they can be read from the
    // version's own model selection — never invented for a model we do not know.
    const windows = row.windows ?? resolveP17Windows(model, null, { overhead });
    return {
      ...row,
      limitingModel: model,
      windows,
      evidenceType: row.evidenceType && row.evidenceType !== P17_EVIDENCE_TYPE.MISSING
        ? row.evidenceType
        : (windows?.evidenceType ?? P17_EVIDENCE_TYPE.MISSING),
      coverageLimitDeg: row.coverageLimitDeg
        ?? readModelCoverageLimitDeg(model, { overhead }),
    };
  });
}

/**
 * The seats that decide the room's P17 position: the worst (lowest) level first,
 * then — within a level — the seat sitting furthest off axis, i.e. closest to the
 * edge of the window that decided it.
 */
export function selectP17LimitingRows(rows = []) {
  return rows
    .filter((row) => row.evidenceAvailable && readLevelNumber(row.level) != null)
    .slice()
    .sort((a, b) => {
      const levelDiff = readLevelNumber(a.level) - readLevelNumber(b.level);
      if (levelDiff !== 0) return levelDiff;
      const angleDiff = (num(b.effectiveAngleDeg) ?? -1) - (num(a.effectiveAngleDeg) ?? -1);
      if (angleDiff !== 0) return angleDiff;
      return (num(b.rawVarianceDb) ?? -1) - (num(a.rawVarianceDb) ?? -1);
    });
}