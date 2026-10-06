/**
 * proposalEvidenceSeatScopes.js (shared)
 * --------------------------------------
 * THE scoped seat-group claims of the frozen proposal evidence pack.
 *
 * A design can be strong for the seats the client actually uses and weaker for
 * the occasional ones. The saved reports already state that distinction: the
 * published engineering summary carries a level for each scope and each
 * parameter — the primary seats, the secondary seats and every seat — and each
 * seat carries its own recorded priority. Both are captured into the report's
 * stored evidence and frozen into the pack's facts, so this module READS them.
 *
 * What it deliberately does not do: aggregate, average, re-grade or infer. A
 * scoped claim is minted only where the saved evidence states that scope's own
 * level for that parameter, only where the scope holds at least two seats, and
 * only where the level is L2 or higher — an L1 result has no positive adjective
 * and mints nothing. Where the evidence states no scoped level, no claim exists,
 * so a draft that names that scope has nothing to cite: that is how a strong
 * result for one group is kept from being written as a result for the room.
 *
 * The adjective vocabulary is the whole client-language mapping: L4 Excellent,
 * L3 Great, L2 Good. Nothing else is used, and no figure is stated — the scoped
 * summaries state levels, so a claim's own `value` stays null rather than
 * borrowing the whole-room figure the parameter row carries.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { areaByKey, buildScopedClaimId, CLAIM_KIND } from './evidencePackSchema.js';
import { optionRef, reportSnapshotIds } from './proposalEvidenceClaims.js';

/** The three seating scopes a claim may be scoped to. */
export const SEAT_SCOPE = Object.freeze({
  PRIMARY: 'primary',
  SECONDARY: 'secondary',
  ALL: 'all',
});

/** Where a claim of each scope holds, as a client sentence writes it. */
export const SCOPE_PHRASE = Object.freeze({
  [SEAT_SCOPE.PRIMARY]: 'across the primary seats',
  [SEAT_SCOPE.SECONDARY]: 'across the secondary seats',
  [SEAT_SCOPE.ALL]: 'across the seating area',
});

/** The client-language mapping. L1 is deliberately absent: no positive adjective. */
export const SCOPE_ADJECTIVE = Object.freeze({ L4: 'Excellent', L3: 'Great', L2: 'Good' });

/**
 * The wording class and the noun each scoped parameter is described with, where
 * the parameter's own subject has a client-safe name. A parameter not named here
 * is eligible only when its own RP22 scope is the seats, and is described with
 * its own plain-language area name from the pack.
 */
const WORDING_BY_PARAMETER = Object.freeze({
  p5: { className: 'spacing', noun: 'spacing' },
  p10: { className: 'consistency', noun: 'overhead consistency' },
  p19: { className: 'consistency', noun: 'bass consistency' },
  p20: { className: 'consistency', noun: 'bass consistency' },
});

/** The fewest seats a scope holds before it can carry a group claim. */
export const MIN_SCOPE_SEATS = 2;

/** The levels that carry a positive adjective. */
const POSITIVE_LEVELS = Object.freeze(Object.keys(SCOPE_ADJECTIVE));

/** One scoped claim's sentence: "Excellent bass consistency across the primary seats." */
export function scopedStatement(adjective, noun, scope) {
  return `${adjective} ${noun} ${SCOPE_PHRASE[scope]}.`;
}

/**
 * One option's scoped seat claims, in scope order then parameter order, or an
 * empty list where its evidence states no scoped summary.
 *
 * @param {Object} option — one frozen option (its facts carry `seat_scopes`)
 * @returns {Array<Object>} the scoped claims this evidence allows
 */
export function buildScopedSeatClaims(option, optionIndex = 0) {
  const scopes = option?.facts?.seat_scopes || null;
  if (!scopes) return [];

  const claims = [];
  const authorityFingerprint = option?.facts?.fingerprints?.engineering ?? null;
  const scopeFingerprint = option?.facts?.fingerprints?.seating_scope ?? null;
  // Each option states its own scoped result, so two options can both be strong
  // for the same scope. The ID's own sequence keeps them apart — the suffix the
  // pack's IDs already carry for a second claim of the same kind.
  const sequence = optionIndex + 1;

  for (const scope of [SEAT_SCOPE.PRIMARY, SEAT_SCOPE.SECONDARY]) {
    const block = scopes[scope] || null;
    if (block?.available !== true) continue;

    const seatCount = Number(block.seat_count);
    if (!Number.isFinite(seatCount) || seatCount < MIN_SCOPE_SEATS) continue;

    for (const [key, parameter] of Object.entries(block.parameters || {})) {
      const level = /^L[1-4]$/.test(String(parameter?.level ?? '')) ? String(parameter.level) : null;
      if (!level || !POSITIVE_LEVELS.includes(level)) continue;

      const named = WORDING_BY_PARAMETER[key] || null;
      // A parameter whose own scope is not the seats has no seat-group result to
      // state, whichever way the summary reports it.
      if (!named && parameter?.parameter_scope !== 'seat') continue;

      const noun = named?.noun || (areaByKey(key)?.label || key).toLowerCase();
      const wordingClass = named?.className || 'performance';
      const adjective = SCOPE_ADJECTIVE[level];
      const value = parameter?.value ?? null;

      claims.push({
        claim_id: buildScopedClaimId(key, scope, wordingClass, sequence),
        area: key,
        label: areaByKey(key)?.label || key,
        kind: CLAIM_KIND.SCOPED_RESULT,
        statement: scopedStatement(adjective, noun, scope),
        option: optionRef(option),
        favours: false,
        // The scope a sentence has to name before this claim can support it.
        scope,
        seat_count: seatCount,
        level,
        wording_class: wordingClass,
        wording: adjective,
        // The scope's own stated value, where the evidence states one. The scoped
        // summaries state levels, so this is null rather than the whole-room
        // figure the parameter row carries.
        value,
        authority_fingerprint: authorityFingerprint,
        scope_fingerprint: scopeFingerprint,
        basis: {
          classification: 'scope_result',
          reason: 'stated_for_this_scope_by_the_saved_reports',
          scope,
          seat_count: seatCount,
          level,
          value,
          wording_class: wordingClass,
          authority_fingerprint: authorityFingerprint,
          scope_fingerprint: scopeFingerprint,
          report_snapshot_ids: reportSnapshotIds([option]),
        },
      });
    }
  }

  return claims;
}

export default buildScopedSeatClaims;