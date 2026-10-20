// crossoverRecommendationComparison.js
// ---------------------------------------------------------------------------
// THE PURE COMPARISON behind "Current Design versus ADI Recommended".
//
// A designer only acts on a setting that will actually change, so every row is
// compared with the ACTUAL current value and marked ONLY when it differs. A
// value that is already what ADI would set is still stated — it is simply not
// highlighted — so the panel never hides a setting and never claims a change
// that applying will not make.
//
// The one explanation sentence is built from those same compared values plus
// the run's own limiting frequency and modelled P19/P20. A figure the run did
// not record is left out of the sentence rather than invented.
//
// Presentation only: no acoustic maths, no scoring, no threshold, no grading.
// ---------------------------------------------------------------------------

/** A number, or null. Never coerces null/undefined/"" to 0. */
function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const hzText = (value) => (value === null ? "—" : `${Math.round(value)} Hz`);
const slopeText = (value) => (value === null ? "—" : `${value} dB/oct`);
const gainText = (value) => (value === null ? "—" : `${value.toFixed(2)} dB`);
const delayText = (value) => (value === null ? "—" : `${value.toFixed(2)} ms`);
const phaseText = (value) => (value === null ? "—" : `${Math.round(value)}°`);

/** Polarity is stored as 0/180 or 1/-1; only "inverted" or not is meaningful. */
const isInverted = (value) => value === -1 || value === 180;
const polarityText = (value) => (value === null ? "—" : isInverted(value) ? "Inverted" : "Normal");

function differs(before, after) {
  if (before === null || after === null) return false;
  return Math.abs(before - after) > 1e-6;
}

function buildRow(key, label, before, after, format, changed = differs(before, after)) {
  return {
    key,
    label,
    beforeText: format(before),
    afterText: format(after),
    changed,
  };
}

/** One subwoofer source label, from its own id. */
function sourceLabel(sourceId, index) {
  const cleaned = String(sourceId || "").replace(/^sub-/, "").replace(/[-_]/g, " ").trim();
  if (!cleaned) return `Sub ${index + 1}`;
  if (/^\d+$/.test(cleaned)) return `Sub ${cleaned}`;
  return cleaned;
}

/** Mid-sentence wording, so a value starts the clause in lower case. */
function lowerFirst(text) {
  const value = String(text || "");
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

/**
 * The four crossover settings, each compared on its own so a changed frequency
 * is never confused with an unchanged slope (and vice versa).
 */
export function buildCrossoverComparison({ baselineCrossover = null, recommendedCrossover = null } = {}) {
  const baseline = baselineCrossover || {};
  const recommended = recommendedCrossover || {};
  const baselineSubHz = finite(baseline.subwooferFrequencyHz ?? baseline.frequencyHz);
  const recommendedSubHz = finite(recommended.subwooferFrequencyHz ?? recommended.frequencyHz);
  return [
    buildRow("speakerHz", "Speaker high-pass", finite(baseline.frequencyHz), finite(recommended.frequencyHz), hzText),
    buildRow("speakerSlope", "Speaker HP slope", finite(baseline.speakerHpSlopeDbPerOct), finite(recommended.speakerHpSlopeDbPerOct), slopeText),
    buildRow("subHz", "Subwoofer low-pass", baselineSubHz, recommendedSubHz, hzText),
    buildRow("subSlope", "Subwoofer LP slope", finite(baseline.subwooferLpSlopeDbPerOct), finite(recommended.subwooferLpSlopeDbPerOct), slopeText),
  ];
}

/**
 * The subwoofer calibration, one row per source, each field compared with the
 * value that source actually carries now. Polarity is compared as applied or
 * inverted, so the stored 0/180 and 1/-1 forms can never read as a change.
 */
export function buildTuningComparison({ baselineTuning = null, recommendedTuning = null } = {}) {
  const before = Array.isArray(baselineTuning) ? baselineTuning : [];
  const after = Array.isArray(recommendedTuning) ? recommendedTuning : [];
  const bySource = new Map(before.map((entry) => [String(entry?.sourceId || ""), entry]));
  return after.map((entry, index) => {
    const previous = bySource.get(String(entry?.sourceId || "")) || before[index] || null;
    const polarityBefore = finite(previous?.polarity);
    const polarityAfter = finite(entry?.polarity);
    const polarityChanged = polarityBefore !== null && polarityAfter !== null
      && isInverted(polarityBefore) !== isInverted(polarityAfter);
    return {
      key: String(entry?.sourceId || `sub-${index}`),
      label: sourceLabel(entry?.sourceId, index),
      cells: [
        buildRow("gain", "Gain", finite(previous?.gainDb), finite(entry?.gainDb), gainText),
        buildRow("delay", "Delay", finite(previous?.delayMs), finite(entry?.delayMs), delayText),
        buildRow("phase", "Phase", finite(previous?.phaseControlDeg ?? previous?.phaseAdjust), finite(entry?.phaseControlDeg ?? entry?.phaseAdjust), phaseText),
        buildRow("polarity", "Polarity", polarityBefore, polarityAfter, polarityText, polarityChanged),
      ],
    };
  });
}

/** True when applying the recommendation would write at least one value. */
export function hasSettingChanges({ crossoverRows = [], tuningRows = [] } = {}) {
  return crossoverRows.some((row) => row.changed)
    || tuningRows.some((row) => row.cells.some((cell) => cell.changed));
}

const FIELD_NOUN = Object.freeze({
  gain: "gain",
  delay: "delay",
  phase: "phase",
  polarity: "polarity",
});

/** "a, b and c" — never an open-ended list. */
function joinClauses(clauses) {
  const list = clauses.filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function crossoverClause(row) {
  if (row.key === "speakerHz") return `a ${row.afterText} speaker high-pass (from ${row.beforeText})`;
  if (row.key === "speakerSlope") return `a ${row.afterText} high-pass slope (from ${row.beforeText})`;
  if (row.key === "subHz") return `a ${row.afterText} subwoofer low-pass (from ${row.beforeText})`;
  return `a ${row.afterText} low-pass slope (from ${row.beforeText})`;
}

/**
 * ONE sentence: what ADI recommends, and why, from the compared values, the
 * run's own limiting frequency and its modelled P20 before and after.
 */
export function buildRecommendationSentence({
  crossoverRows = [],
  tuningRows = [],
  limitingFrequencyHz = null,
  p20BeforeDb = null,
  p20AfterDb = null,
} = {}) {
  const clauses = crossoverRows.filter((row) => row.changed).map(crossoverClause);

  // The calibration is stated once per field, and only for the sources whose
  // own value changes — so a polarity flip is named, and an unchanged gain is not.
  const fields = new Map();
  for (const row of tuningRows) {
    for (const cell of row.cells) {
      if (!cell.changed) continue;
      const entry = fields.get(cell.key) || { cell, labels: [] };
      entry.labels.push(row.label);
      fields.set(cell.key, entry);
    }
  }
  for (const [key, entry] of fields) {
    const noun = FIELD_NOUN[key] || key;
    if (entry.labels.length === 1) {
      clauses.push(`${lowerFirst(entry.cell.afterText)} ${entry.labels[0]} ${noun} (from ${entry.cell.beforeText})`);
    } else {
      clauses.push(`${noun} on ${entry.labels.length} subwoofers`);
    }
  }

  const frequency = finite(limitingFrequencyHz);
  const before = finite(p20BeforeDb);
  const after = finite(p20AfterDb);
  const p20Improves = before !== null && after !== null && before - after > 0.05;

  const reasons = [];
  if (frequency !== null && frequency > 0) {
    reasons.push(`the worst seat-to-seat variation is centred near ${Math.round(frequency)} Hz`);
  }
  if (p20Improves) {
    reasons.push(`the model predicts P20 improving from ${before.toFixed(2)} to ${after.toFixed(2)} dB`);
  }

  if (!clauses.length) {
    return reasons.length
      ? `The current crossover and subwoofer tuning already match ADI's best modelled combination, where ${joinClauses(reasons)}.`
      : "The current crossover and subwoofer tuning already match ADI's best modelled combination, so no setting change is proposed.";
  }

  const reason = reasons.length ? `: ${joinClauses(reasons)}` : "";
  return `ADI recommends ${joinClauses(clauses)}${reason}.`;
}