// stageRejectionPresentation.js
// ---------------------------------------------------------------------------
// Builds accurate rejection-reason detail strings for the Improve Bass V2
// completed investigation panel.
//
// Consumes ONLY validated canonical results (with isPrimary flags) and the
// engine's actual evaluation categories from
// selectConfirmedRecommendations.evaluations.
//
// Does NOT re-evaluate materiality, safety, or trade-offs.
// Does NOT use raw worker per-seat arrays (which lack isPrimary flags).
// Before/after values always refer to the SAME seat, matched by seatId.
// ---------------------------------------------------------------------------

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function levelText(level) {
  const n = numericLevel(level);
  return n > 0 ? `L${n}` : "FAIL";
}

function fmtDb1(raw) {
  if (!Number.isFinite(Number(raw))) return "—";
  return Math.abs(Number(raw)).toFixed(1);
}

function primarySeatMetric(perSeatArray) {
  if (!Array.isArray(perSeatArray) || !perSeatArray.length) return null;
  return perSeatArray.find((s) => s?.isPrimary === true) || perSeatArray[0];
}

function findSeatMetric(perSeatArray, seatId) {
  if (!Array.isArray(perSeatArray) || !seatId) return null;
  return perSeatArray.find((s) => String(s.seatId) === String(seatId)) || null;
}

function findEvaluationForCandidate(evaluations, candidateId) {
  if (!Array.isArray(evaluations) || !candidateId) return null;
  return evaluations.find((e) => e.candidateId === candidateId) || null;
}

/**
 * Find the best valid calibration option using VALIDATED results.
 * "Best" = lowest primary-seat P19 variationDbRaw.
 * Uses opt.validated (enriched with isPrimary) instead of opt.canonical (raw).
 */
export function findBestValidatedCalibrationOption(calibrationDiagnostics) {
  if (!calibrationDiagnostics?.options) return null;
  const valid = calibrationDiagnostics.options.filter(
    (o) => o?.validity?.valid && o?.validated,
  );
  if (!valid.length) return null;
  let best = null;
  let bestP19 = Infinity;
  for (const opt of valid) {
    const p19 = primarySeatMetric(opt.validated.perSeatP19);
    const raw = p19 ? Math.abs(Number(p19.variationDbRaw) || 0) : Infinity;
    if (raw < bestP19) {
      bestP19 = raw;
      best = opt;
    }
  }
  return best;
}

/**
 * Build a before→after P19 string for the SAME seat, matched by seatId.
 * Shows the grade change where applicable.
 * Returns { seatId, text } or null.
 */
function buildSameSeatP19Detail(currentResult, candidateResult) {
  const candP19Primary = primarySeatMetric(candidateResult.perSeatP19);
  if (!candP19Primary) return null;
  const seatId = candP19Primary.seatId;
  const beforeSeat = findSeatMetric(currentResult.perSeatP19, seatId);
  if (!beforeSeat) return null;
  const beforeRaw = Math.abs(Number(beforeSeat.variationDbRaw) || 0);
  const afterRaw = Math.abs(Number(candP19Primary.variationDbRaw) || 0);
  const beforeLevel = levelText(beforeSeat.level);
  const afterLevel = levelText(candP19Primary.level);
  return {
    seatId,
    beforeRaw,
    afterRaw,
    beforeLevel,
    afterLevel,
    text: `Seat ${seatId} P19: ${fmtDb1(beforeRaw)} dB ${beforeLevel} → ${fmtDb1(afterRaw)} dB ${afterLevel}`,
  };
}

/**
 * Build the rejection detail string for the delays stage using the engine's
 * actual evaluation category. Returns a string (without the "Checked N"
 * prefix, which is added by the caller) or null.
 *
 * @param {object} selection - engine selection object
 * @returns {string|null}
 */
export function buildCalibrationRejectionDetail(selection) {
  const calDiag = selection?.calibrationDiagnostics;
  if (!calDiag) return null;
  const currentResult = selection?.currentResult;
  if (!currentResult) return null;
  // Material winner — not rejected, handled elsewhere
  if (selection?.calibrationResult) return null;

  const bestOpt = findBestValidatedCalibrationOption(calDiag);
  if (!bestOpt) return null;

  const candidateResult = bestOpt.validated;
  const evaluation = findEvaluationForCandidate(
    calDiag.evaluations,
    bestOpt.candidateId,
  );

  const p19Detail = buildSameSeatP19Detail(currentResult, candidateResult);
  const parts = [];

  if (!evaluation) {
    // No evaluation found — just show the same-seat P19 detail
    if (p19Detail) {
      parts.push(`Best P19 change: ${p19Detail.text}`);
    }
    return parts.length ? parts.join(". ") : null;
  }

  switch (evaluation.status) {
    case "safety-rejected": {
      const { outputPass, level, primary, muted } = evaluation;
      if (p19Detail) {
        parts.push(`Strong P19 improvement found: ${p19Detail.text}`);
      }
      const rejectParts = [];
      if (primary?.regressed) {
        rejectParts.push(
          `Primary seat ${primary.seatId} ${primary.parameter} ${levelText(primary.currentLevel)} → ${levelText(primary.candidateLevel)}`,
        );
      }
      if (level?.regressed) {
        rejectParts.push(
          `Headline ${level.parameter} level ${levelText(level.current)} → ${levelText(level.candidate)}`,
        );
      }
      if (!outputPass) {
        rejectParts.push("P14 output capability dropped below target");
      }
      if (muted?.mutedCount) {
        rejectParts.push(
          `${muted.mutedCount} subwoofer${muted.mutedCount > 1 ? "s" : ""} effectively muted`,
        );
      }
      if (rejectParts.length) {
        parts.push(`Rejected because: ${rejectParts.join("; ")}`);
      } else {
        parts.push("Rejected by safety check");
      }
      break;
    }
    case "trade-off": {
      const tradeOff = evaluation.tradeOff;
      if (p19Detail) {
        parts.push(`P19 improved: ${p19Detail.text}`);
      }
      if (tradeOff?.neutralText) {
        parts.push(`Trade-off: ${tradeOff.neutralText}`);
      } else {
        parts.push("Rejected because: P19/P20 trade-off");
      }
      break;
    }
    case "below-materiality": {
      if (p19Detail) {
        parts.push(`Best change below material threshold: ${p19Detail.text}`);
      } else {
        parts.push("Best change below material threshold");
      }
      break;
    }
    case "unchanged": {
      parts.push("No material change — same configuration as current");
      break;
    }
    case "invalid": {
      parts.push("Could not validate this candidate");
      break;
    }
    default: {
      if (p19Detail) {
        parts.push(`Best P19 change: ${p19Detail.text}`);
      }
      break;
    }
  }

  return parts.length ? parts.join(". ") : null;
}