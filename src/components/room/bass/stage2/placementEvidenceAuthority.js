// placementEvidenceAuthority.js
// ---------------------------------------------------------------------------
// Separates PHYSICAL placement evidence from PROCESSED canonical evidence for
// each evaluated Stage 2 candidate, without changing any acoustic physics,
// electronic optimisation or RP22 scoring.
//
// The existing Stage 2 canonical evaluation produces TWO distinct response
// states for every candidate:
//
//   1. PHYSICAL (zero-tuning) — the raw modal transfer captured with all
//      tuning set to zero (gain 0, delay 0, polarity +1). This is the genuine
//      untuned physical response of the subwoofers at their evaluated cabinet
//      positions. It is stored on the rawTransfer's per-source per-seat complex
//      transfers and is the ONLY true zero-tuning evidence.
//
//   2. PROCESSED (canonical) — the full canonical chain output: auto-align
//      delays, EQ candidate pool, global level alignment, P14/P18/P19/P20
//      authority. This is the predicted result the designer will see after
//      recalculation. It is NOT untuned physical placement evidence.
//
// The existing Stage 2 "placement-only" response re-sums the zero-tuning
// transfers with AUTO-ALIGN delays — that is an electronic alignment step, not
// a zero-tuning physical measurement. Describing it as "untuned physical
// placement" would be dishonest.
//
// This module extracts the genuine zero-tuning physical response from the
// rawTransfer's captured per-source per-seat complex transfers, so the
// recommendation can show physical and processed evidence as DISTINCT layers.
//
// READ-ONLY: it reads the existing rawTransfer evidence. It evaluates nothing,
// re-simulates nothing, and changes no bass maths, no scoring and no RP22
// definition.
// ---------------------------------------------------------------------------

import { resumWithTuning } from "./stage2TuningSearch.js";

// Inlined response-curve builder (same logic as stage2CanonicalEvaluation.js's
// buildResponseCurves, kept local so this module does not pull the full
// canonical chain — which uses extension-less imports that fail in bare Node).
function responseCurve(response) {
  const raw = (response?.freqsHz || []).map((frequency, index) => ({
    frequency,
    spl: Number.isFinite(response?.splDb?.[index]) ? response.splDb[index] : null,
  })).filter((point) => Number.isFinite(point.frequency) && point.frequency > 0).sort((a, b) => a.frequency - b.frequency);
  return raw.filter((point, index) => !raw[index + 1] || Math.abs(point.frequency - raw[index + 1].frequency) >= 1e-9);
}

function buildResponseCurvesLocal(seatResponses) {
  return {
    rspRawCurve: responseCurve(seatResponses?.rsp),
    perSeatRawCurves: Object.entries(seatResponses || {})
      .filter(([seatId]) => seatId !== "rsp")
      .map(([seatId, response]) => ({
        seatId,
        responseData: responseCurve(response).filter((point) => Number.isFinite(point.spl)),
      }))
      .filter((seat) => seat.responseData.length > 0),
  };
}

const ZERO_TUNING = { delayMs: 0, gainDb: 0, polarity: 0 };

/**
 * Build the genuine zero-tuning physical response for a candidate from its
 * captured per-source per-seat complex transfers.
 *
 * The rawTransfer already carries perSourcePerSeatComplexTransfers captured
 * with all tuning set to zero (see evaluateStage2Placement → zeroTuning=true).
 * Re-summing them with an explicit all-zero tuning array produces the true
 * physical response — no auto-align delay, no gain, no polarity inversion.
 *
 * When the raw transfer has no per-source transfers (physical rejection or
 * older cache), returns null — the physical layer is genuinely unavailable,
 * never fabricated.
 *
 * @param {object} rawTransfer — Stage 2 raw transfer (from placement cache)
 * @returns {object|null} { rspRawCurve, perSeatRawCurves } or null
 */
export function buildZeroTuningPhysicalResponse(rawTransfer) {
  if (!rawTransfer) return null;
  const transfers = rawTransfer.perSourcePerSeatComplexTransfers;
  if (!Array.isArray(transfers) || transfers.length === 0) return null;
  const sources = rawTransfer.sources;
  if (!Array.isArray(sources) || sources.length === 0) return null;
  const seatIds = rawTransfer.seatIds;
  if (!Array.isArray(seatIds) || seatIds.length === 0) return null;

  const zeroTuning = sources.map(() => ({ ...ZERO_TUNING }));
  const seatResponses = resumWithTuning(transfers, zeroTuning, seatIds);
  const { rspRawCurve, perSeatRawCurves } = buildResponseCurves(seatResponses);
  if (!rspRawCurve.length) return null;

  return { rspRawCurve, perSeatRawCurves };
}

/**
 * Classify a Stage 2 candidate result's evidence layers.
 *
 * Returns the DISTINCT physical and processed evidence for a candidate so the
 * recommendation can present them separately:
 *
 *   - physical: genuine zero-tuning response (this module), exact coordinates,
 *     quantity, models, orientation, heights
 *   - processed: the existing canonical predicted P19/P20 assessment, with its
 *     actual processing state recorded (auto-align + EQ + global alignment)
 *
 * @param {object} rawTransfer — Stage 2 raw transfer (placement cache)
 * @param {object} canonicalResult — Stage 2 confirmation result (canonical)
 * @returns {object} { physical, processed, coordinates, quantity, models, orientation, heights }
 */
export function classifyCandidateEvidence(rawTransfer, canonicalResult) {
  const physical = buildZeroTuningPhysicalResponse(rawTransfer);
  const sources = rawTransfer?.sources || [];
  const coordinates = (rawTransfer?.coordinates || []).map((c) => ({
    x: Number.isFinite(Number(c?.x)) ? Number(c.x) : null,
    y: Number.isFinite(Number(c?.y)) ? Number(c.y) : null,
  }));
  const models = sources.map((s) => s?.modelKey || null).filter(Boolean);
  const orientation = sources.map((s) => s?.orientation || null);
  const heights = sources.map((s) => ({
    bottomHeightM: Number.isFinite(Number(s?.bottomHeightM)) ? Number(s.bottomHeightM) : null,
    centreZ: Number.isFinite(Number(s?.z)) ? Number(s.z) : null,
  }));

  // The canonical result's processing state — what the predicted P19/P20
  // actually went through. Recorded honestly so the recommendation never
  // describes a processed result as a raw physical measurement.
  const processingState = canonicalResult
    ? {
      hasAutoAlignDelay: sources.some((s) => Number.isFinite(Number(s?.autoAlignDelayMs)) && Number(s.autoAlignDelayMs) !== 0),
      hasEq: !!canonicalResult.canonicalAuthorityReceipt,
      hasGlobalLevelAlignment: canonicalResult.limited === true || canonicalResult.limited === false,
      tuningVariant: canonicalResult.tuningVariant || "placement-only",
      appliedTuning: canonicalResult.appliedTuning || null,
    }
    : null;

  return {
    physical,
    processed: canonicalResult || null,
    processingState,
    coordinates,
    quantity: rawTransfer?.quantity || canonicalResult?.quantity || null,
    models,
    orientation,
    heights,
  };
}