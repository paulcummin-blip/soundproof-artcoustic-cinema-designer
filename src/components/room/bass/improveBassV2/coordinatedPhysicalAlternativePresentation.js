// coordinatedPhysicalAlternativePresentation.js
// ---------------------------------------------------------------------------
// P0-2: build a reproducible physical-configuration view for one coordinated
// search alternative, using ONLY the candidate's own persisted meta and
// evidence. No coordinates, tuning, cabinet feasibility or acoustic values
// are ever inferred from the installed layout.
//
// The presentation is a plain data object consumed by the React component
// (AdiCoordinatedPhysicalAlternatives.jsx). It carries:
//   - Subwoofer quantity, model and arrangement
//   - Actual evaluated positions (room-relative metres)
//   - Required cabinet / mounting configuration where known
//   - Seating movement and resulting RSP
//   - Associated crossover, phase, delay, gain and polarity settings
//   - P14, RSP P19 and Primary/Secondary P20 improvements and remaining
//     compromises
//
// When essential candidate-owned physical data is missing, the alternative is
// marked NOT reproducible (`reproducible: false`) with the specific missing
// fields listed — it is never presented as ready to implement.
//
// Pure: no React, no side effects, no stores.
// ---------------------------------------------------------------------------

const COORD_TOLERANCE_M = 0.001; // 1 mm

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatM(value) {
  const n = num(value);
  if (n == null) return null;
  return n.toFixed(2);
}

function formatDb(value) {
  const n = num(value);
  if (n == null) return null;
  return n.toFixed(1);
}

function formatHz(value) {
  const n = num(value);
  if (n == null) return null;
  return n.toFixed(0);
}

/**
 * Build the per-source tuning rows from the candidate's evidence or meta.
 * Each row carries delay, gain, phase and polarity with the candidate-owned
 * source identity.
 *
 * @param {object} option - a coordinated search option (from buildOption)
 * @returns {Array} tuning rows
 */
function buildTuningRows(option) {
  const tuning = Array.isArray(option?.meta?.tuning) ? option.meta.tuning
    : (Array.isArray(option?.evidence?.tuning) ? option.evidence.tuning : []);
  return tuning.map((t, i) => ({
    sourceIndex: i + 1,
    sourceId: t?.sourceId || null,
    delayMs: num(t?.delayMs),
    gainDb: num(t?.gainDb),
    phaseControlDeg: num(t?.phaseControlDeg ?? t?.phaseAdjust),
    polarity: num(t?.polarity),
  }));
}

/**
 * Identify which essential candidate-owned physical fields are missing.
 * An alternative with missing fields is not reproducible.
 *
 * @param {object} option
 * @returns {string[]} list of missing-field names
 */
function identifyMissingPhysicalData(option) {
  const missing = [];
  const meta = option?.meta || {};

  if (!num(meta.quantity) || meta.quantity <= 0) {
    missing.push("subwoofer quantity");
  }
  if (!Array.isArray(meta.coordinates) || meta.coordinates.length === 0) {
    missing.push("evaluated subwoofer coordinates");
  } else {
    for (let i = 0; i < meta.coordinates.length; i++) {
      const c = meta.coordinates[i] || {};
      if (num(c.x) == null || num(c.y) == null) {
        missing.push(`coordinate ${i + 1} (x or y)`);
      }
    }
  }
  if (!meta.selectedSubModel) {
    missing.push("subwoofer model");
  }
  if (!Array.isArray(meta.seatingPositions) || meta.seatingPositions.length === 0) {
    missing.push("proposed seating positions");
  }

  return missing;
}

/**
 * Build a compact per-seat P20 summary for the remaining-compromises section.
 *
 * @param {object} evidence
 * @returns {Array} per-seat rows
 */
function buildPerSeatP20Rows(evidence) {
  const seats = Array.isArray(evidence?.perSeatP20) ? evidence.perSeatP20 : [];
  return seats.map((seat) => ({
    seatId: seat.seatId || null,
    isPrimary: Boolean(seat.isPrimary),
    level: num(seat.level),
    variationDb: num(seat.variationDb),
    worstFrequencyHz: num(seat.worstFrequencyHz),
  }));
}

/**
 * Build the complete reproducible physical-configuration view for one
 * coordinated search alternative.
 *
 * @param {object} option - a coordinated search option (from buildOption)
 * @param {object} [baselineOption] - the baseline option, for improvement
 *   deltas (P14, P19, P20). When null, deltas are not computed.
 * @returns {object} presentation view
 */
export function buildPhysicalAlternativePresentation(option, baselineOption = null) {
  const meta = option?.meta || {};
  const evidence = option?.evidence || {};
  const baselineEvidence = baselineOption?.evidence || null;

  const missing = identifyMissingPhysicalData(option);
  const reproducible = missing.length === 0;

  // ── Subwoofer arrangement ──────────────────────────────────────────
  const coordinates = (Array.isArray(meta.coordinates) ? meta.coordinates : [])
    .map((c, i) => ({
      sourceIndex: i + 1,
      x: num(c?.x),
      y: num(c?.y),
      xLabel: formatM(c?.x),
      yLabel: formatM(c?.y),
    }));

  const arrangement = {
    quantity: num(meta.quantity),
    model: meta.selectedSubModel || null,
    placementId: meta.placementId || null,
    bottomHeightM: num(meta.subwooferBottomHeightM),
    coordinates,
  };

  // ── Seating and RSP ────────────────────────────────────────────────
  const seatingOffsetMm = num(meta.seatingOffsetMm);
  const seatingMovement = {
    offsetMm: seatingOffsetMm,
    direction: seatingOffsetMm != null && seatingOffsetMm !== 0
      ? (seatingOffsetMm < 0 ? "toward screen" : "away from screen")
      : "unchanged",
    proposedSeatCount: Array.isArray(meta.seatingPositions) ? meta.seatingPositions.length : 0,
    designatedSeatId: meta.designatedSeatId || null,
  };

  // ── Crossover and tuning ───────────────────────────────────────────
  const crossover = meta.crossover || evidence.crossover || null;
  const crossoverView = crossover
    ? { frequencyHz: num(crossover.frequencyHz), type: crossover.type || null }
    : null;

  const tuningRows = buildTuningRows(option);

  // ── P14, P19, P20 improvements and compromises ────────────────────
  const p14 = {
    achievedDb: num(evidence.p14?.achievedDb),
    targetDb: num(evidence.p14?.targetDb),
    headroomDb: num(evidence.p14?.headroomDb),
    pass: num(evidence.p14?.achievedDb) != null && num(evidence.p14?.targetDb) != null
      ? evidence.p14.achievedDb >= evidence.p14.targetDb : null,
  };

  const p19 = {
    level: num(evidence.p19?.level),
    variationDb: num(evidence.p19?.variationDb),
  };

  const p20Primary = evidence.p20Primary
    ? {
        seatId: evidence.p20Primary.seatId || null,
        level: num(evidence.p20Primary.level),
        variationDb: num(evidence.p20Primary.variationDb),
        worstFrequencyHz: num(evidence.p20Primary.worstFrequencyHz),
      }
    : null;

  const p20Secondary = evidence.p20Secondary
    ? {
        seatId: evidence.p20Secondary.seatId || null,
        level: num(evidence.p20Secondary.level),
        variationDb: num(evidence.p20Secondary.variationDb),
        worstFrequencyHz: num(evidence.p20Secondary.worstFrequencyHz),
      }
    : null;

  // Improvement deltas vs the baseline (only when both have evidence).
  const improvements = baselineEvidence
    ? {
        p14DeltaDb: deltaDb(baselineEvidence?.p14?.achievedDb, evidence.p14?.achievedDb),
        p19LevelDelta: levelDelta(baselineEvidence?.p19?.level, evidence.p19?.level),
        p19VariationDeltaDb: deltaDb(baselineEvidence?.p19?.variationDb, evidence.p19?.variationDb),
        p20PrimaryLevelDelta: levelDelta(baselineEvidence?.p20Primary?.level, evidence.p20Primary?.level),
        p20PrimaryVariationDeltaDb: deltaDb(baselineEvidence?.p20Primary?.variationDb, evidence.p20Primary?.variationDb),
        p20SecondaryLevelDelta: levelDelta(baselineEvidence?.p20Secondary?.level, evidence.p20Secondary?.level),
        p20SecondaryVariationDeltaDb: deltaDb(baselineEvidence?.p20Secondary?.variationDb, evidence.p20Secondary?.variationDb),
      }
    : null;

  // Remaining compromises: seats that still fail P19 or P20.
  const perSeatP20 = buildPerSeatP20Rows(evidence);
  const compromisingSeats = perSeatP20.filter((s) => num(s.level) != null && num(s.level) < 3);

  // ── Reproducibility ────────────────────────────────────────────────
  return {
    optionId: option?.optionId || null,
    label: option?.label || null,
    reproducible,
    missingFields: missing,
    arrangement,
    seatingMovement,
    crossover: crossoverView,
    tuning: tuningRows,
    p14,
    p19,
    p20Primary,
    p20Secondary,
    improvements,
    perSeatP20,
    compromisingSeats,
    responseBasis: evidence.responseBasis || meta.responseBasis || "sub-only",
  };
}

/**
 * Positive variation delta = improvement (less deviation is better).
 * Returns null when either value is missing.
 */
function deltaDb(before, after) {
  const b = num(before);
  const a = num(after);
  if (b == null || a == null) return null;
  return Number((b - a).toFixed(1));
}

/**
 * Level delta: positive = improvement (higher level is better).
 * Returns null when either value is missing.
 */
function levelDelta(before, after) {
  const b = num(before);
  const a = num(after);
  if (b == null || a == null) return null;
  return a - b;
}

/**
 * Build presentation views for a list of alternatives, paired with the
 * baseline for improvement deltas.
 *
 * @param {Array} options - all options (baseline first)
 * @returns {Array} presentation views (one per option)
 */
export function buildPhysicalAlternativePresentations(options) {
  if (!Array.isArray(options) || !options.length) return [];
  const baseline = options.find((o) => o?.optionId === "baseline") || options[0];
  return options.map((option) => buildPhysicalAlternativePresentation(option, baseline));
}