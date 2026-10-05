/**
 * p17SeatEvidenceAuthority.js
 * ---------------------------
 * READ-ONLY P17 (surround/wide/overhead timbre) seat evidence.
 *
 * P17 grades the seat's surround/wide/overhead response variance against the
 * RSP. Two different things can decide the final level, and until now the two
 * were indistinguishable on screen:
 *
 *   1. RAW VARIANCE — the seat-versus-RSP response difference itself.
 *   2. COVERAGE CAP — when a speaker sits beyond its model's −3 dB coverage
 *      window, the existing engine caps the level at Level 2 regardless of the
 *      variance. The cap is a property of the speaker's angular coverage, not of
 *      the variance.
 *
 * This module resolves, from evidence that already exists, which of the two
 * decided each seat's level — and names the exact limiting speaker, the seat and
 * the angles involved.
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
 * Which evidence decided the level: raw variance, or the model coverage cap.
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
        evidenceAvailable: false,
      });
      continue;
    }

    const limiting = resolveLimitingEntry(p17);
    const beyondLimit = resolveBeyondLimit(p17);
    const rawVarianceDb = num(p17.rawVarianceDb) ?? num(p17.value);
    const level = p17.level ?? null;

    // The published evidence stores the graded level; the cause is re-derived
    // from the same authority so a saved version is read with the same rule.
    const cause = resolveP17Cause({ rawVarianceDb, level });
    const coverageLimitDeg = num(p17.coverageLimitDeg)
      ?? num(limiting?.coverageLimitDeg)
      ?? readModelCoverageLimitDeg(limiting?.model, { overhead: isOverheadP17Role(limiting?.role ?? p17.worstRole) });

    rows.push({
      seatId,
      seatLabel: seat?.label || formatSeatLabel(seatId),
      level,
      rawVarianceDb,
      uncappedLevel: cause.uncappedLevel ?? level,
      capApplied: cause.capApplied,
      cause: cause.cause,
      limitingRole: limiting?.role ?? p17.worstRole ?? null,
      limitingModel: limiting?.model ?? null,
      limitingPosition: limiting?.position ?? null,
      seatAngleDeg: num(limiting?.angleDeg) ?? num(p17.worstAngleDeg),
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
    return {
      ...row,
      limitingModel: model,
      coverageLimitDeg: row.coverageLimitDeg
        ?? readModelCoverageLimitDeg(model, { overhead: isOverheadP17Role(row.limitingRole) }),
    };
  });
}

/** The seats that decide the room's P17 position: the worst (lowest) level first. */
export function selectP17LimitingRows(rows = []) {
  return rows
    .filter((row) => row.evidenceAvailable && readLevelNumber(row.level) != null)
    .slice()
    .sort((a, b) => {
      const levelDiff = readLevelNumber(a.level) - readLevelNumber(b.level);
      if (levelDiff !== 0) return levelDiff;
      return (num(b.rawVarianceDb) ?? -1) - (num(a.rawVarianceDb) ?? -1);
    });
}