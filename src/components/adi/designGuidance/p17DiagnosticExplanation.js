/**
 * p17DiagnosticExplanation.js
 * ---------------------------
 * ARTCOUSTIC DESIGN INTELLIGENCE (ADI) — read-only P17 diagnostic explanation.
 *
 * P17 IS A DESIGN GUIDE BASED ON OFF-AXIS SUITABILITY, NOT A POLAR SIMULATION.
 * Each speaker model carries coverage windows — the angles at which it is
 * approximately 1.5 dB / 3 dB / 4 dB down over the relevant octave band, derived
 * from its measured polar data where it has one and declared/estimated otherwise.
 * A seat is graded from the effective off-axis angle of the channel that covers it:
 * L4 inside the 1.5 dB window, L3 inside the 3 dB window, L2 inside the usable
 * 4 dB window, L1 outside usable coverage.
 *
 * ADI names the limiting seat, the limiting channel, its effective angle and the
 * window that angle falls in, then says what to do: re-aim or move the channel so
 * the seat comes inside the window.
 *
 * It never offers a height change as the fix for a bed channel: bed-channel P17 is
 * an angular calculation on the horizontal plane, so speaker height does not enter
 * that angle at all. A height/aim action is offered only when the limiting speaker
 * is an overhead channel, where height genuinely changes the angle.
 *
 * PURE: no React, no SDK, no writes. It explains evidence it is given and
 * recomputes no grade.
 */

import {
  isOverheadP17Role,
  readLevelNumber,
  selectP17LimitingRows,
} from "@/components/utils/rp22/p17SeatEvidenceAuthority";

const one = (value) => (typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : null);
const degrees = (value) => (typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}°` : null);

/** The deciding channel's windows: "L4 ≤24° · L3 ≤35° · L2 ≤41°". */
function windowPhrase(windows) {
  if (!windows) return null;
  const parts = [
    windows.l4Deg != null ? `L4 ≤${degrees(windows.l4Deg)}` : null,
    windows.l3Deg != null ? `L3 ≤${degrees(windows.l3Deg)}` : null,
    windows.l2Deg != null ? `L2 ≤${degrees(windows.l2Deg)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** How the windows were established: derived from measured polars, or estimated. */
function evidencePhrase(windows) {
  const type = windows?.evidenceType;
  if (type === "measured-derived") return "derived from this model's measured polar data";
  if (type === "estimated") return "estimated for this model";
  return null;
}

/** Where the seat sits against the deciding channel's coverage windows. */
function coverageLine(worst) {
  const windows = worst.windows || {};
  const angle = one(worst.effectiveAngleDeg);
  const seatPhrase = angle != null ? `${angle}° off axis` : "Its off-axis angle";
  switch (worst.windowCause) {
    case "within_l4_window":
      return `${seatPhrase} is inside the 1.5 dB window (≤${degrees(windows.l4Deg) ?? "—"}), so this channel covers the seat at full design coverage.`;
    case "within_l3_window":
      return `${seatPhrase} is inside the 3 dB window (≤${degrees(windows.l3Deg) ?? "—"}) but outside the 1.5 dB window (≤${degrees(windows.l4Deg) ?? "—"}).`;
    case "outside_l3_window":
      return `${seatPhrase} is outside the 3 dB window (≤${degrees(windows.l3Deg) ?? "—"}) but still inside the usable 4 dB window (≤${degrees(windows.l2Deg) ?? "—"}). Under 4 dB is not a failure.`;
    case "outside_usable_window":
      return `${seatPhrase} is outside the usable 4 dB coverage window (≤${degrees(windows.l2Deg) ?? "—"}): this seat sits beyond the channel's design coverage.`;
    default:
      return null;
  }
}

/** The headline: what the seat's grade means, in one line. */
function headlineFor(worst) {
  const role = worst.limitingRole ?? "the limiting channel";
  if (!worst.evidenceAvailable) return `P17 evidence unavailable for ${worst.seatLabel}`;
  if (worst.basis !== "coverage_window") {
    return `P17 ${worst.level}: ${worst.seatLabel} was graded on the earlier variance basis — regenerate to see the coverage-window result`;
  }
  switch (worst.windowCause) {
    case "within_l4_window":
      return `P17 L4: ${worst.seatLabel} is within ${role}'s 1.5 dB off-axis window`;
    case "within_l3_window":
      return `P17 L3: ${worst.seatLabel} is within ${role}'s 3 dB off-axis window`;
    case "outside_l3_window":
      return `P17 L2: ${worst.seatLabel} is outside ${role}'s 3 dB window, still inside the usable 4 dB window`;
    case "outside_usable_window":
      return `P17 L1: ${worst.seatLabel} is outside ${role}'s usable coverage window`;
    default:
      return `P17 ${worst.level ?? "—"}: ${worst.seatLabel} is limited by ${role}`;
  }
}

/** What to do about it — move or aim, never a height change that cannot help. */
function actionFor(worst) {
  const role = worst.limitingRole ?? "the limiting speaker";
  const windows = worst.windows || {};
  const usable = degrees(windows.l2Deg) ?? "usable";
  const three = degrees(windows.l3Deg) ?? "3 dB";
  const closest = degrees(windows.l4Deg) ?? "1.5 dB";

  if (!worst.evidenceAvailable) return "No actionable P17 cause is available from the stored evidence.";
  if (worst.basis !== "coverage_window") {
    return `Regenerate this version's engineering result so ${worst.seatLabel} is graded on the coverage-window basis.`;
  }
  switch (worst.windowCause) {
    case "within_l4_window":
      return `Nothing to change for ${role} at ${worst.seatLabel} — it already sits inside the 1.5 dB window (≤${closest}).`;
    case "within_l3_window":
      return `Tighten the angle for ${role} at ${worst.seatLabel}: re-aim or move it so the seat comes inside the 1.5 dB window (≤${closest}). It is already inside the 3 dB window.`;
    case "outside_l3_window":
      return `Nudge ${role} in at ${worst.seatLabel}: re-aim or move it so the seat sits inside the 3 dB window (≤${three}). The seat is inside the usable ${usable} design window, so this is a refinement, not a failure.`;
    case "outside_usable_window":
      return `${worst.seatLabel} is outside ${role}'s usable coverage (≤${usable}): re-aim or move ${role}, or add a channel to cover this seat.`;
    default:
      return "No actionable P17 cause is available from the stored evidence.";
  }
}

/**
 * @param {{ rows?: Array }} params - rows from buildP17SeatEvidenceRows
 * @returns {null | { level, cause, windowCause, windowCauseLabel, windows, evidenceType, varianceDb, seatLabel, seatId, role, model, effectiveAngleDeg, seatAngleDeg, rspAngleDeg, coverageLimitDeg, outsideCoverage, heightActionable, headline, lines, actionLine }}
 */
export function buildP17DiagnosticExplanation({ rows = [] } = {}) {
  const ranked = selectP17LimitingRows(rows);
  if (!ranked.length) return null;

  const worst = ranked[0];
  const outsideRows = ranked.filter((row) => row.windowCause === "outside_usable_window");
  const refinedRows = ranked.filter((row) => row.windowCause === "outside_l3_window");
  const heightActionable = isOverheadP17Role(worst.limitingRole);

  const headline = headlineFor(worst);

  const lines = [];
  lines.push(
    "P17 grades from the effective off-axis angle of the channel that covers the seat, not from a simulated response curve.",
  );

  const coverage = coverageLine(worst);
  if (coverage) lines.push(coverage);

  if (worst.limitingRole) {
    lines.push(
      `Limiting speaker: ${worst.limitingRole}${worst.limitingModel ? ` (${worst.limitingModel})` : ""}`
      + `${worst.effectiveAngleDeg != null ? ` at ${one(worst.effectiveAngleDeg)}° to this seat` : ""}.`,
    );
  }

  // A tilted ceiling speaker is graded on its ACOUSTIC AXIS: the built-in tilt is applied to
  // the ceiling normal to form the axis, so the seat's angle is measured from the axis and
  // not from ceiling vertical. Both angles are stated so the arithmetic is readable.
  if (worst.axisBasis === "acoustic_axis" && worst.builtInTiltDeg != null) {
    lines.push(
      `Axis basis: ${worst.limitingModel || worst.limitingRole} is graded on its acoustic axis — 0° is the axis, not ceiling vertical.`
      + ` Built-in tilt ${degrees(worst.builtInTiltDeg)}`
      + `${worst.rspGeometricAngleDeg != null ? `; geometric angle from ceiling vertical to the RSP ${degrees(worst.rspGeometricAngleDeg)}` : ""}`
      + `${worst.geometricAngleDeg != null ? `; geometric angle to this seat ${degrees(worst.geometricAngleDeg)}` : ""}`
      + `${worst.effectiveAngleDeg != null ? `; effective off-axis angle ${degrees(worst.effectiveAngleDeg)}` : ""}.`,
    );
  } else if (worst.axisBasis === "wall_normal") {
    lines.push("Axis basis: this is a bed-layer channel, graded on the horizontal plane against its wall-normal axis — no ceiling angle is involved.");
  }

  const phrase = windowPhrase(worst.windows);
  if (phrase) {
    const evidence = evidencePhrase(worst.windows);
    lines.push(`Coverage windows for that model: ${phrase}${evidence ? ` — ${evidence}` : ""}.`);
  } else {
    lines.push("Coverage windows: unavailable for the limiting channel's model.");
  }

  if (!heightActionable && worst.limitingRole) {
    lines.push(
      "Height is not an available fix here: bed-channel P17 is measured on the horizontal plane, so moving "
      + `${worst.limitingRole} in height does not change this angle.`,
    );
  }
  if (heightActionable) {
    lines.push("The limiting speaker is an overhead channel, where height and aim do change the angle — a height or aim adjustment is actionable here.");
  }

  if (outsideRows.length) {
    lines.push(`${outsideRows.length} seat${outsideRows.length === 1 ? "" : "s"} sit outside every channel's usable coverage; ${refinedRows.length} more sit inside the usable window but outside the 3 dB window.`);
  } else if (refinedRows.length) {
    lines.push(`${refinedRows.length} seat${refinedRows.length === 1 ? "" : "s"} sit inside the usable 4 dB window but outside the 3 dB window — refinements, not failures.`);
  }

  if (worst.rawVarianceDb != null) {
    lines.push(`Read-only diagnostic: the seat-versus-RSP response delta is ${one(worst.rawVarianceDb)} dB. It does not grade the seat.`);
  }

  return {
    level: worst.level,
    cause: worst.windowCause ?? worst.cause ?? null,
    capApplied: false,
    varianceDb: worst.rawVarianceDb,
    seatId: worst.seatId,
    seatLabel: worst.seatLabel,
    role: worst.limitingRole,
    model: worst.limitingModel,
    seatAngleDeg: worst.effectiveAngleDeg,
    effectiveAngleDeg: worst.effectiveAngleDeg,
    geometricAngleDeg: worst.geometricAngleDeg ?? null,
    rspGeometricAngleDeg: worst.rspGeometricAngleDeg ?? null,
    builtInTiltDeg: worst.builtInTiltDeg ?? null,
    axisBasis: worst.axisBasis ?? null,
    rspAngleDeg: worst.rspAngleDeg,
    coverageLimitDeg: worst.coverageLimitDeg,
    windows: worst.windows ?? null,
    evidenceType: worst.evidenceType ?? "missing",
    windowCause: worst.windowCause ?? null,
    windowCauseLabel: worst.windowCauseLabel ?? null,
    outsideCoverage: worst.windowCause === "outside_usable_window",
    heightActionable,
    outsideSeats: outsideRows.map((row) => row.seatLabel),
    refinedSeats: refinedRows.map((row) => row.seatLabel),
    cappedSeats: [],
    varianceSeats: [],
    headline,
    lines,
    actionLine: actionFor(worst),
    levelNumber: readLevelNumber(worst.level),
  };
}