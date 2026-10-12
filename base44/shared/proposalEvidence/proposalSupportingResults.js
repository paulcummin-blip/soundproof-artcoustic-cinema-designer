/**
 * proposalSupportingResults.js (shared)
 * -------------------------------------
 * THE SUPPORTING RESULTS the client brief asked for, minted from the frozen facts.
 *
 * A brief is an instruction, and a brief that asks for a result — the bass
 * extension, the screen-channel output, the difference between the front and rear
 * rows — is asking for a result the saved reports already state. Those results are
 * not strengths: they are frequently a lower-graded result that the ranked
 * strength stories correctly leave out, and they are exactly the results the
 * client asked to see. So they are minted here as SUPPORTING RESULTS, available to
 * the writer because the brief asked for them, and never promoted to a headline.
 *
 * WHAT IS MINted, AND FROM WHERE
 *   - a requested RP22 parameter: the parameter's own frozen fact (its level, its
 *     value and the scope the report states it at), copied exactly;
 *   - the front and rear row viewing geometry: the per-seat viewing angles the
 *     saved evidence states, grouped by the row they belong to, each row stated on
 *     its own result.
 *
 * WHAT IS NEVER MINTED, whatever a brief asks for
 *   - P19: the reference-position response. It is stated at one position only and
 *     is never promoted into a wider or weaker claim;
 *   - P20: weak or absent seat-to-seat consistency evidence is never turned into a
 *     claim that the bass is consistent across the seats;
 *   - P8, P15, P21: assumed or administrative parameters, which are never a
 *     performance result;
 *   - anything the frozen facts do not state. A request the evidence cannot answer
 *     is recorded as OMITTED, with the reason, and mints nothing.
 *
 * SCOPE AND PREDICTION STATUS ARE RETAINED EXACTLY. Every claim carries the scope
 * the report states (`scope`), the state the report records (`evidence_state`) and
 * the authority it came from (`authority_source`). A result the current bass
 * authority publishes is a design estimate at the reference seating position and is
 * marked `prediction_status: 'predicted'`; a result from the durable engineering
 * publication is `'published'`. A source that states neither is `'unstated'`. No
 * status is ever inferred beyond those two named sources.
 *
 * Pure: no React, no SDK, no GPT, no writes, no side effects.
 */

import { CLAIM_KIND, buildClaimId } from './evidencePackSchema.js';
import { requestedSupportRules } from './proposalBriefRequests.js';

/**
 * Parameters that are never minted as a supporting result, with the reason. Each
 * one is a scope or status rule, not a data-quality preference.
 */
export const NEVER_SUPPORTED_PARAMETERS = Object.freeze({
  8: 'upfiring_or_elevation_speakers_is_an_assumed_parameter',
  15: 'background_noise_floor_is_an_assumed_parameter',
  19: 'the_reference_position_response_is_never_widened_into_a_seat_claim',
  20: 'weak_or_absent_consistency_evidence_never_supports_a_seat_consistency_claim',
  21: 'early_reflections_is_an_assumed_parameter',
});

/** The report's own bass authority, whose results are design estimates at the RSP. */
const PREDICTED_AUTHORITY = /bass-authority/i;

/** The scope a report states, as the claim carries it. */
function scopeOf(row) {
  const stated = String(row?.scope || '').toLowerCase();
  if (stated === 'rsp' || stated === 'reference_position' || stated === 'reference-seating-position') return 'reference_position';
  if (stated === 'per-seat' || stated === 'per_seat') return 'per_seat';
  if (stated === 'project') return 'project';
  if (stated === 'room') return 'room';
  return stated || null;
}

/** Whether the report's own authority marks this result as a design estimate. */
function predictionStatus(authoritySource) {
  if (typeof authoritySource !== 'string' || authoritySource.trim().length === 0) return 'unstated';
  return PREDICTED_AUTHORITY.test(authoritySource) ? 'predicted' : 'published';
}

/** One option's frozen parameter fact, or null. */
function parameterFact(option, parameterId) {
  const rows = Array.isArray(option?.facts?.parameters) ? option.facts.parameters : [];
  return rows.find((row) => Number(row?.parameter_id) === Number(parameterId)) || null;
}

/** The option reference a claim names, carrying internal identifiers only. */
function optionRef(option) {
  return {
    version_id: option?.version_id ?? null,
    version_name: option?.version_name ?? null,
    label: option?.label ?? null,
  };
}

/**
 * One requested parameter as a supporting claim, or the reason it cannot be one.
 *
 * The statement is the report's own fact — its label and the value it states — and
 * the grade travels as the claim's own level rather than in the sentence the
 * writer reads, so no raw grade is ever handed over as copy.
 */
function parameterClaim(option, request, parameterId) {
  const blocked = NEVER_SUPPORTED_PARAMETERS[parameterId];
  if (blocked) return { omitted: { parameter_id: parameterId, reason: blocked } };

  const fact = parameterFact(option, parameterId);
  if (!fact || typeof fact.value !== 'string' || fact.value.trim().length === 0) {
    return { omitted: { parameter_id: parameterId, reason: 'the_saved_reports_state_no_result_for_this_parameter' } };
  }

  const level = typeof fact.level === 'string' && fact.level.trim().length > 0 ? fact.level.trim() : null;
  const value = fact.value.trim();
  const scope = scopeOf(fact);
  const status = predictionStatus(fact.authority_source);

  return {
    claim: {
      claim_id: buildClaimId(`p${parameterId}`, CLAIM_KIND.SUPPORTING_RESULT),
      area: `p${parameterId}`,
      label: fact.label || request.label,
      kind: CLAIM_KIND.SUPPORTING_RESULT,
      // The report's own label and value, and nothing else: no grade is handed
      // over as copy, and no adjective is added.
      statement: `${fact.label || request.label}: ${value}.`,
      option: optionRef(option),
      favours: false,
      scope,
      seat_count: null,
      level,
      wording_class: 'supporting',
      wording: `${fact.label || request.label}: ${value}`,
      // The exact scope, state and authority behind the result, so a draft can be
      // held to the scope it was stated at and never written as an installed or
      // measured outcome.
      evidence_state: fact.state || null,
      authority_source: fact.authority_source || null,
      prediction_status: status,
      definition: fact.definition || null,
      requested_by: request.key,
      basis: {
        levels: level ? [level] : [],
        values: [value],
        classification: 'supporting_result',
        scope,
        prediction_status: status,
      },
    },
  };
}

/** A row of the frozen seating evidence, as the geometry claim states it. */
function viewingRows(option) {
  const perSeat = Array.isArray(option?.facts?.seating?.per_seat) ? option.facts.seating.per_seat : [];
  const byRow = new Map();
  for (const seat of perSeat) {
    const row = Number(seat?.row);
    const angle = Number(seat?.horizontal_angle_deg);
    if (!Number.isFinite(row) || !Number.isFinite(angle)) continue;
    const entry = byRow.get(row) || { row, seats: 0, angle_deg: null };
    entry.seats += 1;
    entry.angle_deg = angle;
    byRow.set(row, entry);
  }
  return [...byRow.values()].sort((left, right) => left.row - right.row);
}

/** How a row is named in the geometry claim: the first row, the last, or its number. */
function rowName(index, count) {
  if (index === 0) return { lead: 'The front row', trailing: 'the front row' };
  if (index === count - 1) return { lead: 'The rear row', trailing: 'the rear row' };
  return { lead: `Row ${index + 1}`, trailing: `row ${index + 1}` };
}

/** The display the rows view, exactly as the frozen evidence names it. */
function displayLabel(option) {
  const screen = option?.facts?.screen || {};
  if (typeof screen.display_label === 'string' && screen.display_label.trim().length > 0) return screen.display_label.trim();
  if (screen.display_type === 'tv' && screen.size_inches) return `${screen.size_inches}" TV`;
  return 'screen';
}

/**
 * The front and rear row viewing geometry as one supporting claim, each row on its
 * own result, or the reason the evidence cannot state it.
 */
function viewingGeometryClaim(option) {
  const rows = viewingRows(option);
  if (rows.length < 2) {
    return { omitted: { key: 'viewing_rows', reason: 'the_saved_reports_state_no_per_row_viewing_angle' } };
  }
  const display = displayLabel(option);
  const sentences = rows.map((entry, index) => {
    const name = rowName(index, rows.length);
    return `${index === 0 ? name.lead : name.trailing} views the ${display} at ${entry.angle_deg}°`;
  });
  const statement = `${sentences[0]}; ${sentences.slice(1).join('; ')}.`;

  return {
    claim: {
      claim_id: buildClaimId('rp23_viewing', CLAIM_KIND.SUPPORTING_RESULT),
      area: 'rp23_viewing',
      label: 'Front and rear row viewing geometry',
      kind: CLAIM_KIND.SUPPORTING_RESULT,
      // Each row keeps its own angle: one row's result is never written as every
      // row's result.
      statement,
      option: optionRef(option),
      favours: false,
      scope: 'row',
      seat_count: rows.reduce((total, entry) => total + entry.seats, 0),
      level: null,
      wording_class: 'supporting',
      wording: statement,
      rows: rows.map((entry) => ({ row: entry.row, seats: entry.seats, angle_deg: entry.angle_deg })),
      evidence_state: 'scored',
      authority_source: null,
      prediction_status: 'published',
      requested_by: 'viewing_rows',
      basis: {
        levels: [],
        values: rows.map((entry) => `${entry.angle_deg}°`),
        classification: 'supporting_result',
        scope: 'row',
        prediction_status: 'published',
      },
    },
  };
}

/**
 * The supporting results the brief asked for, for every option.
 *
 * @param {Object} input
 * @param {Array<Object>} input.options — the pack's own options, with their facts
 * @param {Object|null} [input.requestContext] — the designer's brief
 * @returns {{ claims: Array<Object>, audit: { requested: Array<string>, minted: Array<Object>, omitted: Array<Object> } }}
 */
export function buildSupportingResultClaims({ options = [], requestContext = null } = {}) {
  const list = (Array.isArray(options) ? options : []).filter(Boolean);
  const requests = requestedSupportRules(requestContext);
  const claims = [];
  const minted = [];
  const omitted = [];

  for (const request of requests) {
    for (const option of list) {
      if (request.key === 'viewing_rows') {
        const built = viewingGeometryClaim(option);
        if (built.claim) {
          claims.push(built.claim);
          minted.push({ key: request.key, version_id: option.version_id ?? null, claim_id: built.claim.claim_id });
        } else {
          omitted.push({ key: request.key, version_id: option.version_id ?? null, ...built.omitted });
        }
        continue;
      }

      for (const parameterId of request.parameter_ids) {
        const built = parameterClaim(option, request, parameterId);
        if (built.claim) {
          claims.push(built.claim);
          minted.push({ key: request.key, version_id: option.version_id ?? null, claim_id: built.claim.claim_id });
        } else {
          omitted.push({ key: request.key, version_id: option.version_id ?? null, ...built.omitted });
        }
      }
    }
  }

  return {
    claims,
    audit: {
      requested: requests.map((request) => request.key),
      rule: 'a supporting result is minted only where the brief asked for it and the frozen facts state it, at the exact scope and status the reports record',
      minted,
      omitted,
    },
  };
}

export default buildSupportingResultClaims;