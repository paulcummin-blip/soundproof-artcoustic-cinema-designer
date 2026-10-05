/**
 * p17CoverageWindows.js
 * ---------------------
 * P17 DESIGN-GUIDE COVERAGE WINDOWS — the single authority for "how far off axis
 * may a surround/upper channel sit before a seat is no longer properly covered".
 *
 * P17 IS A DESIGN GUIDE, NOT A POLAR-RESPONSE SIMULATION.
 * Sound Proof does not pretend to model the full in-room timbre response at every
 * seat. Each product's off-axis data is used for ONE thing: to establish the angle
 * where it is approximately 1.5 dB / 3 dB / 4 dB down, and the seat is then graded
 * from its EFFECTIVE OFF-AXIS ANGLE against those windows:
 *
 *   L4 = within the 1.5 dB window
 *   L3 = within the 3 dB window
 *   L2 = outside 3 dB, still inside the usable (4 dB) design window
 *   L1 = outside the usable coverage window (no channel covers the seat)
 *
 * Measured polar data NEVER becomes the seat's P17 dB score. It only derives the
 * windows, so a product is not punished for having more detailed data than its
 * neighbours. Every product is judged through the same design-guide lens:
 * derive the windows, compare the seat's angle, grade accordingly.
 *
 * Window sources, in order:
 *   1. the model's measured polar dataset, when complete  → "measured-derived"
 *   2. the model's declared dispersion knots              → "estimated"
 *   3. the generic estimated windows for the role family   → "estimated"
 *
 * Nothing is invented. If a threshold is never reached inside the measured range,
 * the window is reported as the widest measured angle. The measured derivation band
 * is the app's own P17 basis (RP22 P17: normalised to the RSP between 500 Hz and
 * 16 kHz, 1-octave smoothing — see rp22Definitions.jsx).
 *
 * Pure: no React, no SDK, no writes. Results are memoised per model.
 */

import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { loadMeasuredDataset } from "@/components/utils/rp22/measuredDatasetLoader";
import { validatePolarModel } from "@/components/utils/rp22/polarModelValidation";

const isNum = (value) => typeof value === "number" && Number.isFinite(value);

/** The P17 measurement basis the windows are derived on (see file header). */
export const P17_WINDOW_BAND = { loHz: 500, hiHz: 16000, label: "500 Hz–16 kHz" };

/** The design-guide grade each window carries, and the dB-down it represents. */
export const P17_WINDOW_LEVEL_DB = { 4: 1.5, 3: 3.0, 2: 4.0 };

/** Canonical causes, in the language the ADI Data panel states them. */
export const P17_WINDOW_CAUSE = {
  4: "within_l4_window",
  3: "within_l3_window",
  2: "outside_l3_window",
  1: "outside_usable_window",
};

export const P17_WINDOW_CAUSE_LABEL = {
  within_l4_window: "Within 1.5 dB window",
  within_l3_window: "Within 3 dB window",
  outside_l3_window: "Outside 3 dB window",
  outside_usable_window: "Outside usable coverage",
  missing_evidence: "Missing evidence",
};

/** Evidence types shown in the ADI Data panel. */
export const P17_EVIDENCE_TYPE = {
  MEASURED: "measured-derived",
  ESTIMATED: "estimated",
  MISSING: "missing",
};

/** Estimated windows for role families that publish no dispersion data. */
const FAMILY_WINDOWS = {
  mikro: { l4Deg: 40, l3Deg: 50 },
  default: { l4Deg: 45, l3Deg: 55 },
};

const MAX_COVERAGE_LOSS_DB = 12;

const windowCache = new Map();

/* ------------------------------------------------------------------ measured */

/** 1-octave bands across the P17 band (the app's own 1-octave smoothing). */
function octaveBands() {
  const bands = [];
  for (let centre = P17_WINDOW_BAND.loHz; centre <= P17_WINDOW_BAND.hiHz; centre *= 2) {
    bands.push([centre / Math.SQRT2, centre * Math.SQRT2]);
  }
  return bands;
}

const BANDS = octaveBands();

/** Band level: the mean of the 1-octave band means across 500 Hz–16 kHz. */
function bandLevel(curve) {
  if (!Array.isArray(curve) || !curve.length) return null;
  const points = curve.filter((p) => isNum(p?.frequency) && isNum(p?.spl));
  if (!points.length) return null;
  const at = (freq) => {
    for (let i = 0; i < points.length; i += 1) {
      if (points[i].frequency >= freq) {
        if (i === 0) return points[0].spl;
        const a = points[i - 1];
        const b = points[i];
        const t = (freq - a.frequency) / (b.frequency - a.frequency);
        return a.spl + (b.spl - a.spl) * t;
      }
    }
    return points[points.length - 1].spl;
  };
  let total = 0;
  for (const [lo, hi] of BANDS) {
    let sum = 0;
    let n = 0;
    for (let f = lo; f <= hi * 1.0001; f *= Math.pow(2, 1 / 12)) {
      sum += at(Math.min(hi, Math.max(lo, f)));
      n += 1;
    }
    total += n ? sum / n : 0;
  }
  return total / BANDS.length;
}

const curveAt = (map, angle) => (map && Array.isArray(map[angle]) && map[angle].length ? map[angle] : null);

/**
 * dB-down (never negative: a gain is not a loss) at each measured |angle|, averaged
 * across the ±angle pair so the window is symmetric about the product's own axis.
 */
function sliceDownCurve(map, angles) {
  if (!map || !Array.isArray(angles) || !angles.length) return null;
  const reference = curveAt(map, 0);
  if (!reference) return null;
  const refLevel = bandLevel(reference);
  if (!isNum(refLevel)) return null;

  const magnitudes = Array.from(new Set(angles.map((a) => Math.abs(Number(a))))).filter(isNum).sort((a, b) => a - b);
  const curve = [];
  for (const mag of magnitudes) {
    const down = (sign) => {
      const c = curveAt(map, sign * mag);
      if (!c) return null;
      const level = bandLevel(c);
      return isNum(level) ? Math.max(0, refLevel - level) : null;
    };
    const positive = down(1);
    const negative = down(-1);
    const value = positive != null && negative != null ? (positive + negative) / 2 : (positive ?? negative);
    if (isNum(value)) curve.push({ angle: mag, downDb: value });
  }
  return curve.length ? curve : null;
}

/** 1-2-1 smoothing across the measured angle grid (kills slice comb ripple). */
function smoothCurve(curve) {
  return curve.map((point, index) => {
    const prev = curve[index - 1]?.downDb ?? point.downDb;
    const next = curve[index + 1]?.downDb ?? point.downDb;
    return { angle: point.angle, downDb: (prev + 2 * point.downDb + next) / 4 };
  });
}

/** Running maximum: monotonic "worst loss up to this angle" — one crossing per threshold. */
function monotonicEnvelope(curve) {
  let worst = -Infinity;
  return curve.map((point) => {
    worst = Math.max(worst, point.downDb);
    return { angle: point.angle, downDb: worst };
  });
}

function crossingAngle(curve, targetDb) {
  const widest = curve[curve.length - 1]?.angle ?? 90;
  if (!curve.length) return null;
  if (curve[0].downDb > targetDb) return curve[0].angle;
  for (let i = 1; i < curve.length; i += 1) {
    const a = curve[i - 1];
    const b = curve[i];
    if (a.downDb <= targetDb && b.downDb > targetDb) {
      const span = b.downDb - a.downDb;
      const t = span > 0 ? (targetDb - a.downDb) / span : 0;
      return Math.round((a.angle + (b.angle - a.angle) * t) * 10) / 10;
    }
  }
  return widest;
}

/**
 * Derive the 1.5 / 3 / 4 dB windows from a model's measured polar dataset.
 * Returns null when the dataset is missing or incomplete (caller falls back to
 * the model's declared windows).
 */
export function deriveMeasuredWindows(polarModel) {
  if (!polarModel || polarModel.type !== "measured") return null;
  if (!validatePolarModel(polarModel)?.readyForMeasuredP17) return null;
  const dataset = loadMeasuredDataset(polarModel.dataset);
  if (!dataset?.found) return null;

  const horizontal = sliceDownCurve(dataset.horizontal, dataset.horizontalAngles);
  const vertical = sliceDownCurve(dataset.vertical, dataset.verticalAngles);
  if (!horizontal && !vertical) return null;

  // Average the two measured slices at each angle (the same H/V combination the
  // measured engine used), then smooth and make monotonic before crossing.
  const angles = Array.from(new Set([
    ...(horizontal || []).map((p) => p.angle),
    ...(vertical || []).map((p) => p.angle),
  ])).sort((a, b) => a - b);
  const lookup = (curve) => (angle) => curve?.find((p) => p.angle === angle)?.downDb ?? null;
  const hAt = lookup(horizontal);
  const vAt = lookup(vertical);
  const merged = angles.map((angle) => {
    const h = hAt(angle);
    const v = vAt(angle);
    const value = h != null && v != null ? (h + v) / 2 : (h ?? v);
    return { angle, downDb: value };
  }).filter((p) => isNum(p.downDb));
  if (merged.length < 2) return null;

  const envelope = monotonicEnvelope(smoothCurve(merged));
  const l4Deg = crossingAngle(envelope, 1.5);
  const l3Deg = crossingAngle(envelope, 3);
  const l2Deg = crossingAngle(envelope, 4);
  if (!isNum(l4Deg) || !isNum(l3Deg) || !isNum(l2Deg)) return null;

  return {
    l4Deg,
    l3Deg,
    l2Deg: Math.max(l2Deg, l3Deg),
    usableDb: 4.0,
    evidenceType: P17_EVIDENCE_TYPE.MEASURED,
    bandLabel: P17_WINDOW_BAND.label,
    source: `Derived from ${polarModel.dataset} measured polar data (${P17_WINDOW_BAND.label}, 1-octave)`,
    curve: envelope,
  };
}

/* ----------------------------------------------------------------- estimated */

const readKnot = (window) => ({
  minus1p5: window?.minus1p5dB ?? window?.minus1p5,
  minus3: window?.minus3dB ?? window?.minus3,
  minus5: window?.minus5dB ?? window?.minus5,
});

const wider = (a, b) => (isNum(a) && isNum(b) ? Math.max(a, b) : (isNum(a) ? a : b));

/** The model's −4 dB point when only the 1.5 dB and 3 dB knots are published. */
const impliedFourDbAngle = (l4Deg, l3Deg) => {
  const slope = (3.0 - 1.5) / Math.max(1, l3Deg - l4Deg); // dB per degree
  return Math.round((l3Deg + 1.0 / slope) * 10) / 10;
};

/**
 * The model's declared (or role-family estimated) coverage windows. Overheads use
 * the WIDER of the horizontal and vertical windows, exactly as the engine always
 * has; bed-layer channels use the horizontal window.
 */
export function estimatedWindows(modelMeta, { overhead = false } = {}) {
  const dispersion = modelMeta?.dispersion;
  const horizontal = readKnot(dispersion?.horizontal);
  const vertical = readKnot(dispersion?.vertical);

  const pick1p5 = overhead ? wider(horizontal.minus1p5, vertical.minus1p5) : horizontal.minus1p5;
  const pick3 = overhead ? wider(horizontal.minus3, vertical.minus3) : horizontal.minus3;
  const pick5 = overhead ? wider(horizontal.minus5, vertical.minus5) : horizontal.minus5;

  // Declared windows win when the model publishes all three knots.
  if (isNum(pick1p5) && isNum(pick3)) {
    const l4Deg = Math.ceil(pick1p5);
    const l3Deg = Math.ceil(pick3);
    const declaredUsable = isNum(pick5) ? Math.ceil(pick5) : null;
    const l2Deg = declaredUsable != null ? Math.max(declaredUsable, l3Deg) : impliedFourDbAngle(l4Deg, l3Deg);
    return {
      l4Deg,
      l3Deg,
      l2Deg,
      usableDb: declaredUsable != null ? 5.0 : 4.0,
      evidenceType: P17_EVIDENCE_TYPE.ESTIMATED,
      bandLabel: P17_WINDOW_BAND.label,
      source: declaredUsable != null
        ? "Estimated from the model's declared 1.5 dB / 3 dB / 5 dB dispersion windows"
        : "Estimated from the model's declared 1.5 dB / 3 dB dispersion windows (4 dB point derived)",
    };
  }

  // Role-family fallback (unchanged estimated thresholds the engine always used).
  const family = /mikro/i.test(String(modelMeta?.key || modelMeta?.label || "")) ? FAMILY_WINDOWS.mikro : FAMILY_WINDOWS.default;
  const l4Deg = family.l4Deg;
  const l3Deg = family.l3Deg;
  return {
    l4Deg,
    l3Deg,
    l2Deg: impliedFourDbAngle(l4Deg, l3Deg),
    usableDb: 4.0,
    evidenceType: P17_EVIDENCE_TYPE.ESTIMATED,
    bandLabel: P17_WINDOW_BAND.label,
    source: "Estimated coverage windows (no measured polar data for this model)",
  };
}

/**
 * The windows that grade a speaker model: measured-derived when its polar dataset
 * is complete, otherwise its declared/estimated windows. Memoised per model.
 */
export function resolveP17Windows(modelKey, modelMeta = null, { overhead = false } = {}) {
  const meta = modelMeta || (modelKey ? getSpeakerModelMeta(modelKey) : null);
  const cacheKey = `${modelKey || "unknown"}|${overhead ? "overhead" : "bed"}`;
  if (windowCache.has(cacheKey)) return windowCache.get(cacheKey);

  const windows = deriveMeasuredWindows(meta?.polarModel) || estimatedWindows(meta, { overhead });
  windowCache.set(cacheKey, windows);
  return windows;
}

/* ------------------------------------------------------------------- grading */

/** Coverage loss (dB down) at an arbitrary angle, inside or beyond the windows. */
export function coverageLossAtAngle(angleDeg, windows) {
  const angle = Math.abs(Number(angleDeg) || 0);
  if (!windows) return null;
  if (angle <= windows.l4Deg) return P17_WINDOW_LEVEL_DB[4];
  if (angle <= windows.l3Deg) return P17_WINDOW_LEVEL_DB[3];
  if (angle <= windows.l2Deg) return P17_WINDOW_LEVEL_DB[2];

  const usableDb = isNum(windows.usableDb) ? windows.usableDb : 4.0;
  const span = Math.max(1, windows.l2Deg - windows.l3Deg);
  const slope = (usableDb - 3.0) / span;
  const beyond = usableDb + slope * (angle - windows.l2Deg);
  return Math.min(MAX_COVERAGE_LOSS_DB, Math.max(4.1, Math.round(beyond * 10) / 10));
}

/**
 * Grade a seat's effective off-axis angle against the speaker's coverage windows.
 * Returns the grade, the dB the window represents, and the plain-language cause.
 */
export function gradeOffAxisAngle(angleDeg, windows) {
  if (!windows || !isNum(Number(angleDeg))) {
    return {
      windowLevel: null,
      windowLevelNumber: null,
      windowDb: null,
      windowCause: "missing_evidence",
      windows: windows || null,
      evidenceType: windows?.evidenceType || P17_EVIDENCE_TYPE.MISSING,
    };
  }
  const angle = Math.abs(Number(angleDeg));
  let levelNumber = 1;
  if (angle <= windows.l4Deg) levelNumber = 4;
  else if (angle <= windows.l3Deg) levelNumber = 3;
  else if (angle <= windows.l2Deg) levelNumber = 2;
  return {
    windowLevelNumber: levelNumber,
    windowLevel: `L${levelNumber}`,
    windowDb: levelNumber === 1
      ? coverageLossAtAngle(angle, windows)
      : P17_WINDOW_LEVEL_DB[levelNumber],
    windowCause: P17_WINDOW_CAUSE[levelNumber],
    windows,
    evidenceType: windows.evidenceType,
  };
}

/**
 * The value text every P17 surface shows: the window the seat was graded in —
 * never a raw polar deviation.
 */
export function formatP17WindowResult(levelLabel) {
  const label = String(levelLabel || "").toUpperCase();
  if (label === "L4") return "≤1.5 dB window";
  if (label === "L3") return "≤3 dB window";
  if (label === "L2") return "≤4 dB window";
  if (label === "L1") return ">4 dB window";
  return "—";
}

/** Compact window text for diagnostics: "L4 ≤24° · L3 ≤35° · L2 ≤41°". */
export function formatWindowDegrees(windows) {
  if (!windows) return "—";
  const round = (value) => (isNum(value) ? Math.round(value) : null);
  return `L4 ≤${round(windows.l4Deg)}° · L3 ≤${round(windows.l3Deg)}° · L2 ≤${round(windows.l2Deg)}°`;
}