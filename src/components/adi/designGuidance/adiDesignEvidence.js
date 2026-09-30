// adiDesignEvidence.js
// ---------------------------------------------------------------------------
// ARTCOUSTIC DESIGN INTELLIGENCE (ADI)
// Canonical design evidence for the ADI limiting-factor engine.
//
// ADI does not calculate anything. This adapter reads the ONE canonical
// engineering summary (engineeringSummaryAuthority) and restates it as the
// evidence shape the limiting-factor engine reasons over: per-parameter grades,
// per-seat values, per-row progression, bass results and evaluation
// completeness.
//
// Every value here is copied from existing authority. No threshold, grade,
// floor, average or rating is recalculated. Where a caller holds additional
// context that the summary does not carry (room dimensions, subwoofer count,
// speaker inventory, seating geometry) it is passed in through `extras` and
// merged without altering any engineering value.
//
// PURE: no React, no side effects, no stores.
// ---------------------------------------------------------------------------

/** Seat-scope parameters ADI reasons over per seat. */
export const ADI_SEAT_SCOPE_KEYS = Object.freeze([
  "p1", "p4", "p5", "p6", "p9", "p10", "p16", "p17", "p19", "p20",
]);

/** Room-scope parameters ADI reasons over. */
export const ADI_ROOM_SCOPE_KEYS = Object.freeze([
  "p2", "p3", "p7", "p11", "p12", "p13", "p14", "p18",
]);

/**
 * Parameters that are permanent design assumptions rather than measured design
 * outcomes (P8 upfiring allowance, P15 noise floor, P21 early reflections).
 * They can never be the limiting factor: nothing the designer changes in the
 * geometry or the speaker selection moves them.
 */
export const ADI_ASSUMPTION_KEYS = Object.freeze(["p8", "p15", "p21"]);

/** Bass parameters whose result must be settled before ADI can rank them. */
export const ADI_BASS_KEYS = Object.freeze(["p14", "p18", "p19", "p20"]);

export function normalizeAdiLevel(level) {
  if (level == null) return null;
  const value = String(level).trim().toUpperCase();
  if (value === "FAIL" || value === "FAILED" || value === "BELOW L1") return "FAIL";
  if (/^L[1-4]$/.test(value)) return value;
  return null;
}

/** 0 = FAIL, 1..4 = L1..L4, null = not assessable. */
export function adiLevelRank(level) {
  const normalized = normalizeAdiLevel(level);
  if (!normalized) return null;
  return normalized === "FAIL" ? 0 : Number(normalized.slice(1));
}

/** Short RP22 level label used in ADI prose. */
export function adiLevelLabel(level) {
  const normalized = normalizeAdiLevel(level);
  if (!normalized) return "not calculated";
  return normalized === "FAIL" ? "a FAIL" : normalized;
}

export function adiParameterNumber(key) {
  const match = String(key || "").match(/^(?:p)?(\d+)$/i);
  return match ? Number(match[1]) : null;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function worstSeatEntry(seats) {
  return (Array.isArray(seats) ? seats : []).reduce((worst, seat) => {
    if (!seat || !isFiniteNumber(seat.value)) return worst;
    if (!worst) return seat;
    return Math.abs(seat.value) > Math.abs(worst.value) ? seat : worst;
  }, null);
}

function rowLevels(byRow) {
  return (Array.isArray(byRow) ? byRow : [])
    .map((row) => adiLevelRank(row?.worstLevel))
    .filter((rank) => rank != null);
}

// ── Seat identity (row / column / priority) ──────────────────────────────

/**
 * Build seatId → { row, column, isPrimary } from the canonical per-seat report
 * rows, falling back to seat objects supplied by the caller.
 */
function buildSeatIdentity(reportCounts, extraSeats) {
  const identity = {};
  const resultsByParameter = reportCounts?.seatResultsByParameter || {};

  for (const results of Object.values(resultsByParameter)) {
    for (const result of Array.isArray(results) ? results : []) {
      const seatId = result?.seatId;
      if (!seatId || identity[seatId]) continue;
      identity[seatId] = {
        seatId,
        row: numericOrNull(result.row),
        column: numericOrNull(result.column),
        isPrimary: result.isPrimary !== false,
      };
    }
  }

  for (const seat of Array.isArray(extraSeats) ? extraSeats : []) {
    const seatId = seat?.id;
    if (!seatId) continue;
    const fallback = String(seatId).match(/^seat-r(\d+)-c(\d+)$/);
    identity[seatId] = {
      seatId,
      row: numericOrNull(seat.row ?? seat.rowNumber) ?? numericOrNull(fallback?.[1]),
      column: numericOrNull(seat.indexInRow ?? seat.column) ?? numericOrNull(fallback?.[2]),
      isPrimary: seat.isPrimary === true || String(seat.priority || "").toLowerCase() !== "secondary",
    };
  }

  return identity;
}

// ── Parameter extraction ─────────────────────────────────────────────────

function buildSeatParameter(key, parameter, reportCounts, identity) {
  const number = adiParameterNumber(key);
  const seatsAuthority = parameter?.seats || {};
  const hudResults = reportCounts?.seatResultsByParameter?.[key] || [];
  const hudBySeat = {};
  for (const result of hudResults) {
    if (result?.seatId) hudBySeat[String(result.seatId)] = result;
  }

  const seatIds = Array.from(new Set([
    ...Object.keys(seatsAuthority),
    ...Object.keys(hudBySeat),
  ]));

  const seats = seatIds.map((seatId) => {
    const authority = seatsAuthority[seatId] || null;
    const hud = hudBySeat[seatId] || null;
    const who = identity[seatId] || {};
    return {
      seatId,
      row: who.row ?? numericOrNull(hud?.row),
      column: who.column ?? numericOrNull(hud?.column),
      isPrimary: who.isPrimary ?? (hud?.isPrimary !== false),
      state: authority?.state || hud?.status || "missing",
      level: normalizeAdiLevel(authority?.level ?? hud?.level),
      value: numericOrNull(authority?.rawValue ?? hud?.value),
      worstFrequencyHz: numericOrNull(hud?.worstFrequencyHz),
    };
  });

  const scored = seats.filter((seat) => seat.state === "scored" && seat.level);
  const levels = scored.map((seat) => adiLevelRank(seat.level)).filter((rank) => rank != null);
  const lowestRank = levels.length ? Math.min(...levels) : null;

  // Per-row progression — the evidence behind "the design collapses front to
  // rear". Rows are ordered front (lowest row number) to rear.
  const rowMap = new Map();
  for (const seat of seats) {
    const row = seat.row;
    if (row == null) continue;
    if (!rowMap.has(row)) rowMap.set(row, []);
    rowMap.get(row).push(seat);
  }
  const byRow = Array.from(rowMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([row, rowSeats]) => {
      const ranks = rowSeats
        .map((seat) => adiLevelRank(seat.level))
        .filter((rank) => rank != null);
      const values = rowSeats
        .map((seat) => seat.value)
        .filter((value) => isFiniteNumber(value));
      const valuesAreMagnitudes = key === "p19" || key === "p20" || key === "p16" || key === "p17";
      const worstIndex = values.length
        ? values.reduce(
            (worst, value, index) => (
              Math.abs(value) > Math.abs(values[worst]) ? index : worst
            ),
            0,
          )
        : -1;
      return {
        row,
        seats: rowSeats,
        worstRank: ranks.length ? Math.min(...ranks) : null,
        bestRank: ranks.length ? Math.max(...ranks) : null,
        worstLevel: ranks.length ? lowestLabel(rowSeats) : null,
        assessedCount: ranks.length,
        meanValue: valuesAreMagnitudes && values.length
          ? Math.max(...values.map((value) => Math.abs(value)))
          : (values.length ? values[worstIndex] : null),
        valueRangeDb: valuesAreMagnitudes && values.length > 1
          ? Math.max(...values.map(Math.abs)) - Math.min(...values.map(Math.abs))
          : null,
      };
    });

  const limitingSeats = scored
    .filter((seat) => adiLevelRank(seat.level) === lowestRank)
    .map((seat) => ({ seatId: seat.seatId, row: seat.row, level: seat.level, value: seat.value }));

  const worstSeat = worstSeatEntry(scored);
  const worstValueSeat = worstSeatEntry(seats.filter((seat) => isFiniteNumber(seat.value)));

  return {
    key,
    number,
    scope: "seat",
    state: parameter?.state || (scored.length ? "scored" : "provisional"),
    level: lowestRank == null || !scored.length ? null : lowestLabel(scored),
    assessedCount: scored.length,
    seatCount: seats.length,
    seats,
    scoredSeats: scored,
    limitingSeats,
    worstSeatId: worstSeat?.seatId || worstValueSeat?.seatId || null,
    worstValue: worstValueSeat?.value ?? null,
    byRow,
    distribution: reportCounts?.seatParameterDistributions?.[key] || null,
  };
}

function lowestLabel(seats) {
  const ranked = seats
    .map((seat) => seat.level)
    .filter(Boolean)
    .sort((a, b) => adiLevelRank(a) - adiLevelRank(b));
  return ranked[0] || null;
}

function buildRoomParameter(key, parameter, roomResults) {
  const number = adiParameterNumber(key);
  const published = roomResults?.[number] ?? roomResults?.[String(number)] ?? null;
  const state = parameter?.state || published?.state || "provisional";
  return {
    key,
    number,
    scope: "room",
    state,
    level: state === "scored" ? normalizeAdiLevel(parameter?.level ?? published?.level) : null,
    value: numericOrNull(parameter?.rawValue ?? published?.value),
    seats: [],
    scoredSeats: [],
    byRow: [],
  };
}

function buildBassEvidence(parameters, reportCounts) {
  const bass = {};
  for (const key of ["p14", "p18", "p19", "p20"]) {
    const parameter = parameters[key] || { key, number: adiParameterNumber(key), state: "provisional" };
    const scoredSeats = Array.isArray(parameter.scoredSeats) ? parameter.scoredSeats : [];
    const deviations = scoredSeats
      .map((seat) => (isFiniteNumber(seat.value) ? Math.abs(seat.value) : null))
      .filter((value) => value != null);
    const allValues = (Array.isArray(parameter.seats) ? parameter.seats : [])
      .map((seat) => (isFiniteNumber(seat.value) ? Math.abs(seat.value) : null))
      .filter((value) => value != null);

    bass[key] = {
      ...parameter,
      settled: parameter.state === "scored",
      provisional: parameter.state !== "scored" && parameter.state !== "na",
      failingSeats: scoredSeats.filter((seat) => adiLevelRank(seat.level) === 0).length,
      worstSeatDb: deviations.length ? Math.max(...deviations) : null,
      worstSeatDbProvisional: !deviations.length && allValues.length ? Math.max(...allValues) : null,
      spreadDb: deviations.length > 1 ? Math.max(...deviations) - Math.min(...deviations) : null,
      distribution: reportCounts?.seatParameterDistributions?.[key] || null,
    };
  }
  return bass;
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Build the canonical ADI design evidence.
 *
 * @param {Object} engineeringSummary — the ONE canonical engineering summary.
 * @param {Object} [extras]
 * @param {Array}  [extras.seats]    — canonical seating positions (row/priority)
 * @param {Object} [extras.geometry] — { roomDims, listeningAreaDepthM, rearWallDistanceM }
 * @param {Object} [extras.system]   — { subwooferCount, hasMultipleSubs, speakerCounts, hasFrontWides, hasRears }
 * @returns {Object} ADI design evidence
 */
export function buildAdiDesignEvidence(engineeringSummary, extras = {}) {
  const empty = {
    available: false,
    parameters: {},
    areas: {},
    bass: {},
    seats: [],
    evaluation: {
      incomplete: true,
      bassIncomplete: true,
      missingParameters: [],
      unassessedCount: 0,
      reason: "missing-engineering-summary",
    },
    geometry: extras.geometry || {},
    system: extras.system || {},
  };
  if (!engineeringSummary || typeof engineeringSummary !== "object") return empty;

  const parameterAuthority = engineeringSummary.parameterAuthority || {};
  const reportCounts = engineeringSummary.project?.reportCounts || {};
  const roomResults = engineeringSummary.roomResultsByParameter || {};
  const identity = buildSeatIdentity(reportCounts, extras.seats);

  const parameters = {};
  for (const [key, parameter] of Object.entries(parameterAuthority)) {
    if (!parameter || typeof parameter !== "object") continue;
    if (parameter.scope === "seat") {
      parameters[key] = buildSeatParameter(key, parameter, reportCounts, identity);
    } else {
      parameters[key] = buildRoomParameter(key, parameter, roomResults);
    }
  }
  // Seat parameters present in report counts but absent from the authority are
  // still real evidence (bass parameters can publish independently).
  for (const key of ADI_SEAT_SCOPE_KEYS) {
    if (!parameters[key] && reportCounts?.seatResultsByParameter?.[key]) {
      parameters[key] = buildSeatParameter(key, null, reportCounts, identity);
    }
  }

  const bass = buildBassEvidence(parameters, reportCounts);

  const seatIds = Array.from(identity ? Object.keys(identity) : []);
  const seats = seatIds.map((seatId) => ({ id: seatId, ...identity[seatId] }));

  const categories = engineeringSummary.project?.categories || [];
  const areaFloor = (label) => {
    const category = categories.find((entry) => entry?.label === label);
    return category
      ? {
          label,
          floorLevel: normalizeAdiLevel(category.floorLevel),
          hasFail: category.hasFail === true,
          limitingParams: (category.limitingParams || []).map((entry) => entry?.key).filter(Boolean),
        }
      : null;
  };
  const areas = {
    spatial: areaFloor("Spatial Resolution"),
    dynamicRange: areaFloor("Dynamic Range"),
    timbre: areaFloor("Timbre Matching"),
    screen: areaFloor("Screen / Viewing Geometry"),
  };

  // ── Evaluation completeness ──────────────────────────────────────────
  const missingParameters = [];
  for (const [key, parameter] of Object.entries(parameters)) {
    const number = parameter.number;
    if (number != null && (ADI_ASSUMPTION_KEYS.includes(key) || key === "p7")) continue;
    if (parameter.state === "provisional") {
      missingParameters.push({ key, number, reason: "not-settled" });
    }
  }
  const bassIncomplete = ADI_BASS_KEYS.some((key) => bass[key]?.provisional === true);
  const assessableParameters = Object.values(parameters).filter(
    (parameter) => parameter.state === "scored" && parameter.level,
  );

  return {
    available: true,
    parameters,
    areas,
    bass,
    seats,
    evaluation: {
      incomplete: assessableParameters.length === 0 || bassIncomplete,
      bassIncomplete,
      missingParameters,
      unassessedCount: missingParameters.length,
      reason: assessableParameters.length === 0 ? "no-assessable-parameters" : null,
    },
    geometry: extras.geometry || {},
    system: extras.system || {},
  };
}

export default buildAdiDesignEvidence;