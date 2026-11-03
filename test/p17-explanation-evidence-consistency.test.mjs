/**
 * p17-explanation-evidence-consistency.test.mjs
 * ------------------------------------------------
 * Regression: one P17 explanation must describe ONE coherent evidence chain.
 *
 * DEFECT (Case B / Case C): the displayed effective angle and the coverage
 * window / threshold / cause / level came from DIFFERENT speaker records. The
 * engine stores two "limiting" concepts:
 *   - p17.limiting   = the LEGACY variance speaker (largest seat-vs-RSP delta)
 *   - p17.worstRole  = the coverage-window DECIDING speaker (the channel whose
 *                      angle + windows produced the grade)
 * The old reader (resolveLimitingEntry) returned p17.limiting for the angle,
 * model and position, while the cause / level / windows came from the deciding
 * speaker — so an explanation could show an angle OUTSIDE a threshold the cause
 * said it was inside. Case B: 44° shown "inside ≤31°". Case C: 51° shown
 * "inside ≤39°". Both internally impossible.
 *
 * FIX: for a coverage-window result the limiting speaker for the explanation is
 * the DECIDING channel (resolveCoverageDecidingEntry). Its role, model, angle,
 * windows, cause and level all come from that one speaker.
 *
 * P17 maths, thresholds and grading are NOT changed. The coverage-window
 * authority is unchanged. This tests the EVIDENCE SELECTION only.
 *
 * Run: node --import ./test/_alias-register.mjs test/p17-explanation-evidence-consistency.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildP17SeatEvidenceRows,
  selectP17LimitingRows,
} from "@/components/utils/rp22/p17SeatEvidenceAuthority";
import { buildP17DiagnosticExplanation } from "@/components/adi/designGuidance/p17DiagnosticExplanation";
import {
  gradeOffAxisAngle,
  P17_EVIDENCE_TYPE,
} from "@/components/utils/rp22/p17CoverageWindows";

// ── Helpers ────────────────────────────────────────────────────────────────

const seats = [{ id: "seat-1", label: "Seat 1" }];

/**
 * Build an engine-shaped per-seat P17 result where the LEGACY variance speaker
 * (p17.limiting) is a DIFFERENT speaker from the coverage-window DECIDING
 * speaker (worstRole) — the condition that exposed the defect.
 *
 * @param {object} deciding - { role, model, angleDeg, windows:{l4Deg,l3Deg,l2Deg} }
 * @param {object} legacy   - { role, model, angleDeg } the variance speaker
 */
function buildMetric({ deciding, legacy, cause, level }) {
  const levelNumber = Number(String(level).replace(/^L/, ""));
  const decidingWindows = deciding.windows;
  // Verify the deciding speaker is internally coherent (sanity for the fixture).
  const grade = gradeOffAxisAngle(deciding.angleDeg, decidingWindows);
  if (grade.windowLevel !== level) {
    throw new Error(`fixture: deciding angle ${deciding.angleDeg} vs windows grades to ${grade.windowLevel}, not ${level}`);
  }

  const decidingEntry = {
    role: deciding.role,
    model: deciding.model,
    position: { x: deciding.x ?? 1, y: deciding.y ?? 1 },
    angleDeg: deciding.angleDeg,
    rspAngleDeg: deciding.rspAngleDeg ?? 0,
    geometricAngleDeg: deciding.geometricAngleDeg ?? null,
    rspGeometricAngleDeg: deciding.rspGeometricAngleDeg ?? null,
    builtInTiltDeg: deciding.builtInTiltDeg ?? null,
    axisBasis: deciding.axisBasis ?? "acoustic_axis",
    coverageLimitDeg: decidingWindows.l3Deg,
    windowDb: grade.windowDb,
    windowLevel: level,
    windowLevelNumber: levelNumber,
    windows: decidingWindows,
    evidenceType: P17_EVIDENCE_TYPE.ESTIMATED,
    cause,
    lossDb: 0,
    isBeyondNonLcrLimit: false,
  };

  // The legacy variance speaker: a DIFFERENT channel, with its own (narrower)
  // windows and a larger angle — the speaker p17.limiting pointed at.
  const legacyEntry = {
    role: legacy.role,
    model: legacy.model,
    position: { x: legacy.x ?? 4, y: legacy.y ?? 4 },
    angleDeg: legacy.angleDeg,
    rspAngleDeg: 0,
    geometricAngleDeg: null,
    rspGeometricAngleDeg: null,
    builtInTiltDeg: null,
    axisBasis: "acoustic_axis",
    coverageLimitDeg: legacy.windows ? legacy.windows.l3Deg : null,
    windowDb: null,
    windowLevel: null,
    windowLevelNumber: null,
    windows: legacy.windows ?? null,
    evidenceType: P17_EVIDENCE_TYPE.ESTIMATED,
    cause: null,
    lossDb: 9.0, // large seat-vs-RSP variance → this is the legacy limiting speaker
    isBeyondNonLcrLimit: true,
  };

  return {
    p17Db: grade.windowDb,
    level,
    windowLevel: level,
    windowLevelNumber: levelNumber,
    windows: decidingWindows, // the deciding channel's windows (top-level)
    evidenceType: P17_EVIDENCE_TYPE.ESTIMATED,
    cause,
    worstRole: deciding.role,
    worstAngleDeg: deciding.angleDeg,
    worstLossDb: grade.windowDb,
    geometricAngleDeg: decidingEntry.geometricAngleDeg,
    rspGeometricAngleDeg: decidingEntry.rspGeometricAngleDeg,
    builtInTiltDeg: decidingEntry.builtInTiltDeg,
    axisBasis: decidingEntry.axisBasis,
    perSpeaker: [decidingEntry, legacyEntry],
    p17HasNaAngles: false,
    rawVarianceDb: 9.0,
    limiting: legacyEntry, // ← the engine stamps the LEGACY variance speaker here
    beyondLimit: [legacyEntry],
    coverageLimitDeg: decidingWindows.l3Deg,
  };
}

function rowsFor(metric) {
  return buildP17SeatEvidenceRows({ seats, p17BySeatId: { "seat-1": metric } });
}

/** The single most-limiting row, as the ADI explanation reads it. */
function limitingRow(metric) {
  return selectP17LimitingRows(rowsFor(metric))[0];
}

/**
 * The core consistency contract: the row's effective angle, windows, cause and
 * level must all come from the SAME evidence record. Re-grading the row's angle
 * against the row's windows must reproduce the row's level and cause exactly.
 * If these came from different speakers, this re-grade diverges — that is the
 * defect.
 */
function assertRowCoherent(row, label) {
  const regade = gradeOffAxisAngle(row.effectiveAngleDeg, row.windows);
  assert.equal(regade.windowLevel, row.level,
    `${label}: angle ${row.effectiveAngleDeg}° against the row's windows grades to ${regade.windowLevel}, but the row's level is ${row.level} — angle and level come from different speakers`);
  assert.equal(regade.windowCause, row.windowCause,
    `${label}: cause mismatch — angle ${row.effectiveAngleDeg}° against the row's windows gives ${regade.windowCause}, row says ${row.windowCause}`);
}

// ── Case B: 44° displayed, explanation said inside ≤31° ────────────────────

test("Case B — limiting speaker, angle, window, level all from the deciding channel", () => {
  const metric = buildMetric({
    deciding: {
      role: "TBL",
      model: "artcoustic-q6-3",
      angleDeg: 30,
      windows: { l4Deg: 24, l3Deg: 31, l2Deg: 38, evidenceType: P17_EVIDENCE_TYPE.ESTIMATED },
    },
    legacy: {
      role: "TFL",
      model: "artcoustic-narrow",
      angleDeg: 44, // the displayed angle in the defect report
      windows: { l4Deg: 20, l3Deg: 31, l2Deg: 36, evidenceType: P17_EVIDENCE_TYPE.ESTIMATED },
    },
    cause: "within_l3_window",
    level: "L3",
  });

  const row = limitingRow(metric);

  // LIMITING SPEAKER = the deciding channel (TBL), NOT the legacy TFL.
  assert.equal(row.limitingRole, "TBL", "limiting speaker must be the deciding channel, not the legacy variance speaker");

  // EFFECTIVE ANGLE = the deciding channel's angle (30°), not the legacy 44°.
  assert.equal(row.effectiveAngleDeg, 30, "effective angle must come from the deciding channel");

  // WINDOW = the deciding channel's windows (L3 ≤31°).
  assert.equal(row.windows.l3Deg, 31);
  assert.equal(row.windowCause, "within_l3_window");

  // LEVEL = L3 (from the deciding channel).
  assert.equal(row.level, "L3");

  // Coherence: 30° against ≤31° windows → within_l3 → L3. Consistent.
  assertRowCoherent(row, "Case B");
});

// ── Case C: 51° displayed, explanation said inside ≤39° ────────────────────

test("Case C — limiting speaker, angle, window, level all from the deciding channel", () => {
  const metric = buildMetric({
    deciding: {
      role: "TMR",
      model: "artcoustic-q8-5",
      angleDeg: 38,
      windows: { l4Deg: 30, l3Deg: 39, l2Deg: 48, evidenceType: P17_EVIDENCE_TYPE.ESTIMATED },
    },
    legacy: {
      role: "TFL",
      model: "artcoustic-narrow",
      angleDeg: 51,
      windows: { l4Deg: 26, l3Deg: 39, l2Deg: 45, evidenceType: P17_EVIDENCE_TYPE.ESTIMATED },
    },
    cause: "within_l3_window",
    level: "L3",
  });

  const row = limitingRow(metric);

  assert.equal(row.limitingRole, "TMR");
  assert.equal(row.effectiveAngleDeg, 38, "angle must be the deciding channel's 38°, not the legacy 51°");
  assert.equal(row.windows.l3Deg, 39);
  assert.equal(row.windowCause, "within_l3_window");
  assert.equal(row.level, "L3");
  assertRowCoherent(row, "Case C");
});

// ── Case B/C: the ADI explanation sentence is internally consistent ─────────

test("Case B — ADI explanation is internally consistent", () => {
  const metric = buildMetric({
    deciding: {
      role: "TBL",
      model: "artcoustic-q6-3",
      angleDeg: 30,
      windows: { l4Deg: 24, l3Deg: 31, l2Deg: 38, evidenceType: P17_EVIDENCE_TYPE.ESTIMATED },
    },
    legacy: { role: "TFL", model: "artcoustic-narrow", angleDeg: 44 },
    cause: "within_l3_window",
    level: "L3",
  });
  const explanation = buildP17DiagnosticExplanation({ rows: rowsFor(metric) });
  assert.ok(explanation, "explanation should be produced");
  // The explanation names the deciding channel, not the legacy one.
  assert.equal(explanation.role, "TBL");
  // The effective angle stated is the deciding channel's.
  assert.equal(explanation.effectiveAngleDeg, 30);
  // The threshold stated is the deciding channel's.
  assert.equal(explanation.windows.l3Deg, 31);
  assert.equal(explanation.windowCause, "within_l3_window");
  // No line of the explanation mentions the legacy 44° angle.
  for (const line of explanation.lines) {
    assert.doesNotMatch(line, /44/, `explanation must not state the legacy 44° angle: "${line}"`);
  }
});

test("Case C — ADI explanation is internally consistent", () => {
  const metric = buildMetric({
    deciding: {
      role: "TMR",
      model: "artcoustic-q8-5",
      angleDeg: 38,
      windows: { l4Deg: 30, l3Deg: 39, l2Deg: 48, evidenceType: P17_EVIDENCE_TYPE.ESTIMATED },
    },
    legacy: { role: "TFL", model: "artcoustic-narrow", angleDeg: 51 },
    cause: "within_l3_window",
    level: "L3",
  });
  const explanation = buildP17DiagnosticExplanation({ rows: rowsFor(metric) });
  assert.equal(explanation.role, "TMR");
  assert.equal(explanation.effectiveAngleDeg, 38);
  assert.equal(explanation.windows.l3Deg, 39);
  assert.equal(explanation.windowCause, "within_l3_window");
  for (const line of explanation.lines) {
    assert.doesNotMatch(line, /51/, `explanation must not state the legacy 51° angle: "${line}"`);
  }
});

// ── Case C-boundary: angle exactly on the L4/L3 and L3/L2 boundary ─────────

test("Boundary — angle exactly on L4/L3 boundary uses the same boundary as grading", () => {
  // angle === l3Deg exactly → gradeOffAxisAngle gives L3 (within_l3_window).
  const metric = buildMetric({
    deciding: {
      role: "SL",
      model: "artcoustic-sp-2-8",
      angleDeg: 35,
      windows: { l4Deg: 24, l3Deg: 35, l2Deg: 41, evidenceType: P17_EVIDENCE_TYPE.ESTIMATED },
    },
    legacy: { role: "SBR", model: "artcoustic-narrow", angleDeg: 50 },
    cause: "within_l3_window",
    level: "L3",
  });
  const row = limitingRow(metric);
  assert.equal(row.limitingRole, "SL");
  assert.equal(row.effectiveAngleDeg, 35);
  assert.equal(row.level, "L3");
  assert.equal(row.windowCause, "within_l3_window");
  assertRowCoherent(row, "L4/L3 boundary");
});

test("Boundary — angle exactly on L3/L2 boundary", () => {
  // angle === l3Deg + 0.5 → outside_l3_window (L2). The explanation must use
  // the same boundary the grade used.
  const metric = buildMetric({
    deciding: {
      role: "SL",
      model: "artcoustic-sp-2-8",
      angleDeg: 35.5,
      windows: { l4Deg: 24, l3Deg: 35, l2Deg: 41, evidenceType: P17_EVIDENCE_TYPE.ESTIMATED },
    },
    legacy: { role: "SBR", model: "artcoustic-narrow", angleDeg: 50 },
    cause: "outside_l3_window",
    level: "L2",
  });
  const row = limitingRow(metric);
  assert.equal(row.limitingRole, "SL");
  assert.equal(row.effectiveAngleDeg, 35.5);
  assert.equal(row.level, "L2");
  assert.equal(row.windowCause, "outside_l3_window");
  assertRowCoherent(row, "L3/L2 boundary");
});

// ── Case D: outside the usable window → honest L1 explanation ──────────────

test("Outside usable window — L1 explanation describes the limiting angle/window honestly", () => {
  const metric = buildMetric({
    deciding: {
      role: "TBL",
      model: "artcoustic-q6-3",
      angleDeg: 60,
      windows: { l4Deg: 24, l3Deg: 31, l2Deg: 38, evidenceType: P17_EVIDENCE_TYPE.ESTIMATED },
    },
    legacy: { role: "TFL", model: "artcoustic-narrow", angleDeg: 70 },
    cause: "outside_usable_window",
    level: "L1",
  });
  const row = limitingRow(metric);
  assert.equal(row.limitingRole, "TBL");
  assert.equal(row.effectiveAngleDeg, 60);
  assert.equal(row.level, "L1");
  assert.equal(row.windowCause, "outside_usable_window");
  assertRowCoherent(row, "outside usable");

  const explanation = buildP17DiagnosticExplanation({ rows: rowsFor(metric) });
  assert.equal(explanation.role, "TBL");
  assert.equal(explanation.level, "L1");
  assert.equal(explanation.outsideCoverage, true);
  // The headline and action honestly state L1 / outside usable coverage.
  assert.match(explanation.headline, /L1/);
  assert.match(explanation.actionLine, /usable coverage/i);
});

// ── Case E: multiple overhead speakers — all evidence from the deciding one ─

test("Multiple overheads — limiting speaker, angle, cause, level all from the deciding record", () => {
  const metric = buildMetric({
    deciding: {
      role: "TBL",
      model: "artcoustic-q6-3",
      angleDeg: 40,
      windows: { l4Deg: 35, l3Deg: 46, l2Deg: 55, evidenceType: P17_EVIDENCE_TYPE.ESTIMATED },
    },
    legacy: {
      role: "TMR",
      model: "artcoustic-q8-5",
      angleDeg: 52, // a second overhead, more off-axis, larger variance
      windows: { l4Deg: 30, l3Deg: 39, l2Deg: 48, evidenceType: P17_EVIDENCE_TYPE.ESTIMATED },
    },
    cause: "within_l3_window",
    level: "L3",
  });
  const row = limitingRow(metric);
  // The deciding channel is TBL; the explanation must not borrow TMR's angle.
  assert.equal(row.limitingRole, "TBL");
  assert.equal(row.effectiveAngleDeg, 40);
  assert.equal(row.windows.l3Deg, 46);
  assert.equal(row.windowCause, "within_l3_window");
  assert.equal(row.level, "L3");
  assertRowCoherent(row, "multiple overheads");

  // The per-speaker breakdown still carries both speakers (read-only), but the
  // deciding row's identity is TBL.
  assert.equal(row.speakers.length, 2);
  assert.ok(row.speakers.some((s) => s.role === "TBL"));
  assert.ok(row.speakers.some((s) => s.role === "TMR"));
});

// ── Saved-style record (no perSpeaker) still reads coherently ───────────────

test("Saved record without perSpeaker — deciding evidence synthesised from top-level fields", () => {
  const windows = { l4Deg: 24, l3Deg: 31, l2Deg: 38, evidenceType: P17_EVIDENCE_TYPE.ESTIMATED };
  // A saved publication that kept top-level fields but stripped perSpeaker,
  // and (critically) kept p17.limiting pointing at the legacy variance speaker.
  const savedMetric = {
    p17Db: 3.0,
    level: "L3",
    windowLevel: "L3",
    windowLevelNumber: 3,
    windows,
    evidenceType: P17_EVIDENCE_TYPE.ESTIMATED,
    cause: "within_l3_window",
    worstRole: "TBL",
    worstAngleDeg: 30,
    worstLossDb: 3.0,
    perSpeaker: [],
    p17HasNaAngles: false,
    rawVarianceDb: 9.0,
    limiting: { role: "TFL", model: "artcoustic-narrow", angleDeg: 44, lossDb: 9.0 },
    beyondLimit: [],
    coverageLimitDeg: 31,
  };
  const row = limitingRow(savedMetric);
  // Even without perSpeaker, the deciding channel is worstRole (TBL), and the
  // angle comes from the top-level worstAngleDeg (30°), not the legacy 44°.
  assert.equal(row.limitingRole, "TBL");
  assert.equal(row.effectiveAngleDeg, 30, "angle must come from worstAngleDeg, not p17.limiting.angleDeg");
  assert.equal(row.windows.l3Deg, 31);
  assert.equal(row.windowCause, "within_l3_window");
  assert.equal(row.level, "L3");
  assertRowCoherent(row, "saved no-perSpeaker");
});

// ── Legacy (earlier variance) basis is unchanged ───────────────────────────

test("Earlier variance basis — still uses p17.limiting (legacy path unchanged)", () => {
  // A pre-design-guide saved record: no windowLevel, so basis = earlier_variance_basis.
  // The legacy limiting speaker is the grading speaker here, so it must still be used.
  const legacyMetric = {
    value: 5.0,
    formatted: "±5 dB",
    level: "L2",
    windowLevel: null,
    windows: null,
    evidenceType: P17_EVIDENCE_TYPE.MISSING,
    cause: null,
    worstRole: null,
    perSpeaker: [],
    p17HasNaAngles: false,
    rawVarianceDb: 5.0,
    limiting: { role: "SL", model: "artcoustic-sp-2-8", angleDeg: 44, lossDb: 5.0 },
    beyondLimit: [],
    coverageLimitDeg: null,
  };
  const row = limitingRow(legacyMetric);
  assert.equal(row.basis, "earlier_variance_basis");
  // The legacy variance speaker is still the limiting speaker for the legacy basis.
  assert.equal(row.limitingRole, "SL");
  assert.equal(row.effectiveAngleDeg, 44);
});