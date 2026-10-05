/**
 * adiDiagnosticExplanation.js (P17)
 * ---------------------------------
 * ARTCOUSTIC DESIGN INTELLIGENCE (ADI) — read-only P17 diagnostic explanation.
 *
 * ADI explains what decided the seat's P17 level:
 *   - the raw seat-versus-RSP variance, or
 *   - the speaker model's −3 dB coverage cap.
 *
 * It names the exact limiting seat and speaker, and it never offers a height
 * change as the fix for a bed-channel coverage cap: P17 for bed channels is an
 * angular calculation on the horizontal plane, so speaker height does not enter
 * that angle at all. A height/aim action is only offered when the limiting
 * speaker is an overhead channel, where height genuinely changes the angle.
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

/**
 * @param {{ rows?: Array }} params - rows from buildP17SeatEvidenceRows
 * @returns {null | { level, cause, capApplied, varianceDb, seatLabel, seatId, role, model, seatAngleDeg, coverageLimitDeg, rspAngleDeg, heightActionable, headline, lines, actionLine }}
 */
export function buildP17DiagnosticExplanation({ rows = [] } = {}) {
  const ranked = selectP17LimitingRows(rows);
  if (!ranked.length) return null;

  const worst = ranked[0];
  const cappedRows = ranked.filter((row) => row.capApplied);
  const varianceRows = ranked.filter((row) => row.cause === "raw_variance" && !row.capApplied);
  const heightActionable = isOverheadP17Role(worst.limitingRole);

  const cause = worst.capApplied
    ? "coverage_cap"
    : worst.cause === "raw_variance"
      ? "raw_variance"
      : "unavailable";

  const headline = worst.capApplied
    ? `P17 ${worst.level}: the model's −3 dB coverage cap decides this seat, not the response variance`
    : worst.cause === "raw_variance"
      ? `P17 ${worst.level}: decided by the raw seat-versus-RSP response variance`
      : `P17 evidence unavailable for ${worst.seatLabel}`;

  const lines = [];
  lines.push(
    worst.capApplied
      ? `Limiting seat ${worst.seatLabel}: its variance alone grades ${worst.uncappedLevel}, and the coverage cap on ${worst.limitingRole ?? "a surround speaker"} holds the seat at ${worst.level}.`
      : `Limiting seat ${worst.seatLabel}: variance ${one(worst.rawVarianceDb) ?? "—"} dB grades ${worst.level} with no coverage cap applied.`,
  );

  if (worst.limitingRole) {
    lines.push(
      `Limiting speaker: ${worst.limitingRole}${worst.limitingModel ? ` (${worst.limitingModel})` : ""}`
      + `${worst.seatAngleDeg != null ? ` at ${one(worst.seatAngleDeg)}° to this seat` : ""}`
      + `${worst.coverageLimitDeg != null ? `; its model −3 dB window is ${one(worst.coverageLimitDeg)}°` : ""}.`,
    );
  }

  if (worst.seatAngleDeg != null && worst.rspAngleDeg != null) {
    lines.push(`Response loss: ${one(worst.seatLossDb) ?? "—"} dB at the seat against ${one(worst.rspLossDb) ?? "—"} dB at the RSP (${one(worst.seatAngleDeg)}° seat angle, ${one(worst.rspAngleDeg)}° RSP angle).`);
  }

  if (!heightActionable && (worst.capApplied || worst.limitingRole)) {
    lines.push(
      "Height is not an available fix here: bed-channel P17 is measured on the horizontal plane, so moving "
      + `${worst.limitingRole ?? "this speaker"} in height does not change this angle.`,
    );
  }
  if (heightActionable) {
    lines.push("The limiting speaker is an overhead channel, where height and aim do change the angle — a height or aim adjustment is actionable here.");
  }

  if (cappedRows.length && varianceRows.length) {
    lines.push(`${cappedRows.length} seat${cappedRows.length === 1 ? "" : "s"} held by the coverage cap; ${varianceRows.length} seat${varianceRows.length === 1 ? "" : "s"} decided by variance alone. Both causes are present and are shown separately.`);
  }

  const actionLine = worst.capApplied
    ? `Reduce the angle for ${worst.limitingRole ?? "the limiting speaker"} at ${worst.seatLabel} — re-aim it or move it laterally so the seat sits inside the ${one(worst.coverageLimitDeg) ?? "model"}° −3 dB window. The variance itself already grades ${worst.uncappedLevel}.`
    : worst.cause === "raw_variance"
      ? `Trim the response difference at ${worst.seatLabel}: ${worst.limitingRole ?? "the limiting speaker"} loses ${one(worst.seatLossDb) ?? "more"} dB at this seat against ${one(worst.rspLossDb) ?? "—"} dB at the RSP. No coverage cap is applied.`
      : "No actionable P17 cause is available from the stored evidence.";

  return {
    level: worst.level,
    cause,
    capApplied: worst.capApplied,
    varianceDb: worst.rawVarianceDb,
    seatId: worst.seatId,
    seatLabel: worst.seatLabel,
    role: worst.limitingRole,
    model: worst.limitingModel,
    seatAngleDeg: worst.seatAngleDeg,
    rspAngleDeg: worst.rspAngleDeg,
    coverageLimitDeg: worst.coverageLimitDeg,
    heightActionable,
    cappedSeats: cappedRows.map((row) => row.seatLabel),
    varianceSeats: varianceRows.map((row) => row.seatLabel),
    headline,
    lines,
    actionLine,
    levelNumber: readLevelNumber(worst.level),
  };
}