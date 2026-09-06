// improveBassV2WhatChanged.js
// Builds a practical, non-technical "What changed" summary comparing the
// current design snapshot to the V2 winner. Separates Design changes
// (positions, orientation) from Calibration settings (delay, trim, polarity, EQ).

const POS_TOLERANCE_M = 0.05; // 50 mm

/**
 * Build a "What changed" summary comparing the current design snapshot
 * to the V2 winner.
 *
 * @param {object} snapshot - current design snapshot (positions, tuning, EQ)
 * @param {object} winner - V2 winner result (coordinates, appliedTuning)
 * @returns {{ designChanges: string[], calibrationChanges: string[], hasChanges: boolean }}
 */
export function buildWhatChanged(snapshot, winner) {
  if (!snapshot || !winner) {
    return { designChanges: [], calibrationChanges: [], hasChanges: false };
  }

  const designChanges = [];
  const calibrationChanges = [];

  const currentPositions = snapshot.positions || [];
  const winnerPositions = winner.coordinates || [];
  const currentTuning = snapshot.tuning || [];
  const winnerTuning = winner.appliedTuning || winner.tuning || [];

  // --- Design changes (positions, orientation) ---
  const positionChanges = [];
  for (let i = 0; i < winnerPositions.length; i++) {
    const wp = winnerPositions[i];
    const cp = currentPositions[i];
    if (!cp) {
      positionChanges.push(`Sub ${i + 1} added at ${Number(wp.x).toFixed(2)}, ${Number(wp.y).toFixed(2)} m`);
      continue;
    }
    const dx = Number(wp.x) - Number(cp.x);
    const dy = Number(wp.y) - Number(cp.y);
    const dist = Math.hypot(dx, dy);
    if (dist > POS_TOLERANCE_M) {
      const direction = describeDirection(dx, dy);
      positionChanges.push(`Sub ${i + 1} moved ${direction} by ${(dist * 1000).toFixed(0)} mm`);
    }
  }
  if (positionChanges.length > 0) {
    designChanges.push(`Subwoofer positions — ${positionChanges.join("; ")}`);
  }

  // --- Calibration changes (delay, trim, polarity, EQ) ---

  // Delay
  const delayChanges = [];
  for (let i = 0; i < winnerTuning.length; i++) {
    const wt = winnerTuning[i] || {};
    const ct = currentTuning[i] || {};
    const wd = Number(wt.delayMs) || 0;
    const cd = Number(ct.delayMs) || 0;
    if (Math.abs(wd - cd) > 0.1) {
      delayChanges.push(`${wd.toFixed(1)}`);
    } else {
      delayChanges.push(`${cd.toFixed(1)}`);
    }
  }
  if (delayChanges.length > 0) {
    const allZero = delayChanges.every((d) => Math.abs(parseFloat(d)) < 0.1);
    if (!allZero) {
      calibrationChanges.push(`Delay — ${delayChanges.join(" / ")} ms`);
    }
  }

  // Trim (relative level)
  const trimChanges = [];
  for (let i = 0; i < winnerTuning.length; i++) {
    const wt = winnerTuning[i] || {};
    const ct = currentTuning[i] || {};
    const wg = Number(wt.gainDb) || 0;
    const cg = Number(ct.gainDb) || 0;
    if (Math.abs(wg - cg) > 0.1) {
      trimChanges.push(`${wg.toFixed(1)}`);
    } else {
      trimChanges.push(`${cg.toFixed(1)}`);
    }
  }
  if (trimChanges.length > 0) {
    const allZero = trimChanges.every((t) => Math.abs(parseFloat(t)) < 0.1);
    if (!allZero) {
      calibrationChanges.push(`Relative level — ${trimChanges.join(" / ")} dB`);
    }
  }

  // Polarity
  const polarityChanges = [];
  for (let i = 0; i < winnerTuning.length; i++) {
    const wt = winnerTuning[i] || {};
    const ct = currentTuning[i] || {};
    const wp = Number(wt.polarity) || 0;
    const cp = Number(ct.polarity) || 0;
    if ((wp < 0) !== (cp < 0)) {
      polarityChanges.push(`Sub ${i + 1} inverted`);
    }
  }
  if (polarityChanges.length > 0) {
    calibrationChanges.push(`Polarity — ${polarityChanges.join(", ")}`);
  }

  // EQ
  if (winner.canonicalAuthorityReceipt?.filterBankSignature
    && snapshot.eqSignature
    && winner.canonicalAuthorityReceipt.filterBankSignature !== snapshot.eqSignature) {
    calibrationChanges.push("EQ — common calibration EQ updated");
  }

  return {
    designChanges,
    calibrationChanges,
    hasChanges: designChanges.length > 0 || calibrationChanges.length > 0,
  };
}

function describeDirection(dx, dy) {
  const parts = [];
  if (Math.abs(dy) > POS_TOLERANCE_M) parts.push(dy > 0 ? "forward" : "backward");
  if (Math.abs(dx) > POS_TOLERANCE_M) parts.push(dx > 0 ? "right" : "left");
  return parts.join(" and ") || "repositioned";
}