// adiDesignGuidanceEngine.js
// ---------------------------------------------------------------------------
// ARTCOUSTIC DESIGN INTELLIGENCE (ADI)
// The canonical ADI Design Guidance engine.
//
// One call, one answer, every surface:
//
//   buildAdiDesignGuidance(engineeringSummary, { seats, geometry, system })
//
//   → ADI has identified:      the ONE limiting factor that matters most
//   → What is wrong / Why it is happening / Change first / Expected
//     improvement / Remaining limitation / Lower-value changes
//
// ADI is the engineering layer that interprets the design: the optimiser
// executes, RP22 reports, the Design Rating scores — ADI explains what is
// holding the design back and what to do about it, in the same order every
// time.
//
// Ordering is owned by adiLimitingFactorRules (bass capability → bass
// consistency → bass response → front-to-rear spatial collapse → highest
// consequence weak parameter). No generic recommendation can outrank the
// weakest credible parameter: recommendations are only ever offered in the
// "Lower-value changes" line of the block, which is why the ranking lives here
// and not in the recommendation engine.
//
// PURE: no React, no side effects, no stores.
// ---------------------------------------------------------------------------

import { buildAdiDesignEvidence, adiLevelRank } from "./adiDesignEvidence";
import {
  ADI_FACTOR_KIND,
  selectAdiLimitingFactor,
  resolveProvisionalBassSignal,
} from "./adiLimitingFactorRules";
import { buildAdiGuidanceCopy } from "./adiGuidanceCopy";

const num = (value, digits = 1) => (
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : null
);
const db = (value) => (num(value) ? `±${num(value)} dB` : null);
const deg = (value) => (num(value, 0) ? `${num(value, 0)}°` : null);
const metres = (value) => (num(value, 2) ? `${num(value, 2)} m` : null);
const hz = (value) => (num(value, 0) ? `${num(value, 0)} Hz` : null);

const LEVEL_PHRASE = (level) => (!level ? "not calculated" : level === "FAIL" ? "FAIL" : level);

/** Headline for each factor kind — the "ADI has identified" line. */
const HEADLINES = Object.freeze({
  [ADI_FACTOR_KIND.CAPABILITY]: "LFE output capability at the reference seat",
  [ADI_FACTOR_KIND.BASS_CONSISTENCY]: "Seat-to-seat bass consistency",
  [ADI_FACTOR_KIND.BASS_RESPONSE]: "Reference-seat bass response",
  [ADI_FACTOR_KIND.ROW_COLLAPSE]: "Listening-area depth — spatial performance collapsing from the front row to the rear row",
  [ADI_FACTOR_KIND.INCOMPLETE]: "Evaluation incomplete — the limiting factor cannot be settled yet",
  [ADI_FACTOR_KIND.BALANCED]: "No limiting factor — the design is balanced",
});

function severityBand(severity) {
  if (severity >= 2.4) return "HIGH";
  if (severity >= 1.4) return "MEDIUM";
  if (severity > 0) return "LOW";
  return "NONE";
}

function rowProfile(parameter) {
  const rows = (parameter?.byRow || []).filter((row) => row.assessedCount > 0);
  if (!rows.length) return null;
  return rows
    .map((row) => {
      const value = parameter.key === "p1"
        ? metres(Math.abs(Number(row.meanValue) || 0))
        : (parameter.key === "p5" || parameter.key === "p9" || parameter.key === "p4" || parameter.key === "p6" || parameter.key === "p10")
          ? deg(Math.abs(Number(row.meanValue) || 0))
          : (parameter.key === "p18" ? hz(row.meanValue) : db(row.meanValue));
      return `row ${row.row} ${LEVEL_PHRASE(row.worstLevel)}${value ? ` (${value})` : ""}`;
    })
    .join(" · ");
}

function parameterFactLine(candidate) {
  const parameter = candidate?.parameter;
  if (!parameter) return null;
  const prefix = `P${candidate.number} ${LEVEL_PHRASE(candidate.level)}`;
  if (candidate.key === "p1") {
    const closest = (parameter.scoredSeats || [])
      .map((seat) => Math.abs(Number(seat.value) || 0))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b)[0];
    return `${prefix} — closest listening position ${metres(closest) || "within the boundary zone"} from the nearest wall`;
  }
  if (parameter.byRow?.length) {
    return `${prefix} — ${rowProfile(parameter)}`;
  }
  if (candidate.key === "p20" || candidate.key === "p19") {
    const worst = parameter.worstValue != null ? Math.abs(Number(parameter.worstValue)) : null;
    return `${prefix} — worst-seat deviation ${db(worst) || "measured"} across ${parameter.assessedCount || 0} seat${(parameter.assessedCount || 0) === 1 ? "" : "s"}`;
  }
  if (candidate.key === "p18") {
    return `${prefix} — achieved ${hz(parameter.value) || "higher than the selected target"}`;
  }
  if (candidate.key === "p12" || candidate.key === "p13" || candidate.key === "p14") {
    return `${prefix} — achieved ${num(parameter.value) ? `${num(parameter.value)} dB` : "below the required level"} at the reference seat`;
  }
  if (parameter.value != null) {
    return `${prefix} — ${num(parameter.value)}`;
  }
  return prefix;
}

function buildEvidenceLines(selection) {
  const lines = [];
  const { candidate, runnerUp, evidence } = selection || {};

  const primary = parameterFactLine(candidate);
  if (primary) lines.push(primary);

  if (selection?.kind === ADI_FACTOR_KIND.BASS_CONSISTENCY && evidence?.boundaryCoupled) {
    const p1 = evidence?.parameters?.p1;
    const closest = (p1?.scoredSeats || [])
      .map((seat) => Math.abs(Number(seat.value) || 0))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b)[0];
    lines.push(`P1 ${LEVEL_PHRASE(p1?.level)} — the weakest seats are also the seats nearest the boundary${metres(closest) ? ` (${metres(closest)})` : ""}`);
  }

  if (selection?.kind === ADI_FACTOR_KIND.ROW_COLLAPSE && selection.collapse) {
    const { frontRow, rearRow, drop } = selection.collapse;
    lines.push(`Front row ${LEVEL_PHRASE(frontRow.worstLevel)} → rear row ${LEVEL_PHRASE(rearRow.worstLevel)} (${drop} performance levels lost across ${(selection.candidate?.parameter?.byRow || []).length} rows)`);
  }

  if (runnerUp?.area) {
    lines.push(`Next lowest result: ${runnerUp.area} (${LEVEL_PHRASE(runnerUp.level)})`);
  }

  return lines.filter(Boolean).slice(0, 4);
}

/**
 * Build the canonical ADI Design Guidance.
 *
 * @param {Object} engineeringSummary — the ONE canonical engineering summary.
 * @param {Object} [options]
 * @param {Array}  [options.seats]
 * @param {Object} [options.geometry] — { roomDims, rearWallDistanceM, listeningDistanceM }
 * @param {Object} [options.system]   — { subwooferCount, hasMultipleSubs, speakerCounts }
 * @returns {Object|null} guidance, or null when there is no engineering summary
 */
export function buildAdiDesignGuidance(engineeringSummary, options = {}) {
  if (!engineeringSummary) return null;

  const evidence = buildAdiDesignEvidence(engineeringSummary, {
    seats: options.seats,
    geometry: options.geometry,
    system: options.system,
  });

  const selection = selectAdiLimitingFactor(evidence);

  // An incomplete evaluation must never be a dead end: attach the provisional
  // bass signal so ADI can still name the likely factor and the next action.
  if (selection.kind === ADI_FACTOR_KIND.INCOMPLETE) {
    selection.signal = resolveProvisionalBassSignal(evidence);
  }

  const copy = buildAdiGuidanceCopy(selection);

  const candidate = selection.candidate;
  const runnerUp = selection.runnerUp;

  const headline = selection.kind === ADI_FACTOR_KIND.ROW_COLLAPSE
    ? HEADLINES[selection.kind]
    : (candidate?.area ? `${candidate.area}${candidate.key === "p20" || candidate.key === "p19" || candidate.key === "p14" ? "" : ""}` : HEADLINES[selection.kind]);

  return {
    available: evidence.available,
    kind: selection.kind,
    parameterKey: selection.key,
    parameterNumber: candidate?.number ?? evidence.parameters?.[selection.key]?.number ?? null,
    area: candidate?.area || HEADLINES[selection.kind],
    level: candidate?.level || null,
    severity: severityBand(candidate?.severity || 0),
    headline: selection.kind === ADI_FACTOR_KIND.BASS_CONSISTENCY || selection.kind === ADI_FACTOR_KIND.BASS_RESPONSE || selection.kind === ADI_FACTOR_KIND.CAPABILITY
      ? HEADLINES[selection.kind]
      : headline,
    evidenceLines: buildEvidenceLines(selection),
    rankedResults: (selection.candidates || []).slice(0, 4).map((entry) => ({
      key: entry.key,
      number: entry.number,
      area: entry.area,
      level: entry.level,
    })),
    incomplete: selection.kind === ADI_FACTOR_KIND.INCOMPLETE || evidence.evaluation?.bassIncomplete === true,
    missingParameters: (evidence.evaluation?.missingParameters || []).map((entry) => entry.key),
    ...copy,
  };
}

export default buildAdiDesignGuidance;