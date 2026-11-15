/**
 * reportParameterCompleteness.js
 * -------------------------------
 * Scope-aware RP22 parameter completeness validation for report export
 * integrity.
 *
 * Replaces display-value presence checks with validation against the canonical
 * published parameter authority. Each parameter is validated at its correct
 * assessment scope (room or seat), and only terminal scored results or
 * explicit legitimate terminal N/A results are accepted.
 *
 * Accepts:
 *   - Terminal scored results (state === 'scored' with a valid level)
 *   - Explicit legitimate terminal N/A (state === 'na' with no
 *     insufficient-data indicator)
 *
 * Rejects:
 *   - Provisional or incomplete results
 *   - Missing evidence
 *   - Displayed Levels without valid completed authority
 *   - N/A labels that actually mean insufficient data
 *
 * P19 RSP exception: the completed bass contract's P19 result is the
 * authoritative RSP-specific result. When it is complete (scored or terminal
 * not-assessable), the parameter is complete even if a legacy parameter-level
 * entry remains provisional.
 *
 * Pure: no React, no fetching, no side effects, no external imports.
 */

const LEGIT_NA_STATES = new Set(['na', 'not_applicable']);

function isLegitimateNAState(state) {
  return LEGIT_NA_STATES.has(String(state || '').toLowerCase());
}

function hasInsufficientDataIndicator(entry) {
  if (!entry) return false;
  const formatted = String(entry.formatted || '').toLowerCase();
  if (formatted.includes('insufficient data')) return true;
  // A legitimate N/A carries level "N/A" or null; "—" alongside an N/A
  // formatted string indicates insufficient data, not a real N/A.
  if (entry.level === '—' && formatted.includes('n/a')) return true;
  return false;
}

function isTerminalScored(param) {
  if (!param) return false;
  if (param.state !== 'scored') return false;
  const level = param.level;
  return level != null && level !== '—' && level !== '';
}

function isLegitimateNotApplicable(param) {
  if (!param) return false;
  if (!isLegitimateNAState(param.state)) return false;
  if (hasInsufficientDataIndicator(param)) return false;
  // For seat-scoped parameters, every assessed seat must be a legitimate N/A.
  if (param.scope === 'seat' && param.seats) {
    const seats = Object.values(param.seats);
    if (seats.length === 0) return false;
    for (const seat of seats) {
      if (!isLegitimateNAState(seat.state)) return false;
      if (hasInsufficientDataIndicator(seat)) return false;
    }
  }
  return true;
}

function p19BassResultIsComplete(completedBassAuthority) {
  const contract = completedBassAuthority?.contract;
  if (!contract) return false;

  // Full cache contract: check productAnalysis.parameters.p19
  const bassP19 = contract.productAnalysis?.parameters?.p19;
  if (bassP19) {
    if (bassP19.notAssessable === true && (bassP19.notAssessableReason || bassP19.reason)) {
      return true; // terminal not-assessable
    }
    const level = Number(bassP19.level);
    if (Number.isFinite(level) && level > 0) {
      return true; // scored
    }
  }

  // Retained evidence: check the assessment envelope for a scored P19.
  const envelope = contract.assessmentEnvelope;
  if (envelope && envelope.p19TargetIdentity) {
    if (Number.isFinite(Number(envelope.officialP19WorstFrequencyHz))) {
      return true;
    }
  }

  return false;
}

/**
 * Validate one required RP22 parameter.
 *
 * @returns {{ complete: boolean, reason: string|null }}
 */
export function validateParameterCompleteness({
  parameterAuthority = {},
  paramId,
  completedBassAuthority = null,
}) {
  const key = 'p' + paramId;
  const param = parameterAuthority[key] || null;

  if (!param) return { complete: false, reason: 'missing-authority' };

  // P19 RSP exception: the completed bass authority's P19 result is the
  // authoritative RSP-specific result. When it is complete, the parameter
  // is complete even if a legacy parameter-level entry remains provisional.
  if (paramId === 19 && p19BassResultIsComplete(completedBassAuthority)) {
    return { complete: true, reason: null };
  }

  if (isTerminalScored(param)) return { complete: true, reason: null };
  if (isLegitimateNotApplicable(param)) return { complete: true, reason: null };

  return { complete: false, reason: `state-${param.state || 'unknown'}` };
}

/**
 * Validate all required RP22 parameters.
 *
 * @returns {{ missing: number[], incomplete: string[] }}
 */
export function validateRequiredParameters({
  parameterAuthority = {},
  completedBassAuthority = null,
  requiredParams = [2, 3, 5, 7, 8, 9, 10, 11, 12, 13, 14, 18, 19, 21],
} = {}) {
  const missing = [];
  const incomplete = [];
  for (const id of requiredParams) {
    const result = validateParameterCompleteness({
      parameterAuthority,
      paramId: id,
      completedBassAuthority,
    });
    if (!result.complete) {
      missing.push(id);
      incomplete.push(`P${id}: ${result.reason}`);
    }
  }
  return { missing, incomplete };
}

export default validateRequiredParameters;