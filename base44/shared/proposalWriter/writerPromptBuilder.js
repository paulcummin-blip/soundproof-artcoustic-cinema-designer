/**
 * writerPromptBuilder.js (shared)
 * --------------------------------
 * THE Phase 6 writer prompt: the one request the writer is sent.
 *
 * The prompt carries three things and nothing else — the Sound Proof writing
 * authority, the Phase 2 writer input exactly as `buildWriterInput` assembled it,
 * and the instruction to return that contract's JSON and no prose. The input is
 * passed in whole and is never augmented, so the writer cannot be handed a live
 * Project, a live ProjectVersion, a product catalogue, a report page or an
 * unvalidated value: there is no parameter here through which one could arrive.
 *
 * `assertWriterInputCarriesNoLiveState` proves that last claim rather than
 * asserting it: it scans the assembled input for the keys live design state is
 * carried under (room dimensions, seating, selected speakers, subwoofer
 * instances, design_state, publication pointers) and refuses to send a prompt
 * that carries one. The pack's own vocabulary — an area named "subwoofers", a
 * subwoofer model name, a printed dimension in a sentence — is evidence and is
 * left alone; the check is on key names, not on prose.
 *
 * The frozen pack itself is the one sanctioned carrier of those names. It holds
 * report evidence — including a screen's `manual_width_m` and `manual_height_m`
 * when the designer sized the screen by hand — and every fact in it is frozen
 * evidence, proved pack-side by the Phase 1 guard and its own tests. So the scan
 * skips the pack subtree and checks everything the writer input and the request
 * carry around it: a live Project, a live ProjectVersion, or any other live
 * design state riding alongside the pack still refuses the prompt.
 *
 * Pure: no React, no SDK, no runtime-specific APIs. No provider call is made
 * here.
 */

import { buildProposalWritingAuthority } from '../soundProofWritingAuthority.js';
import {
  WRITER_CONTRACT_VERSION,
  WRITER_OUTPUT_MODE,
  WRITER_SECTION_IDS,
} from './writerContractSchema.js';

/** The provider the writer is called on. Never named in the browser. */
export const WRITER_PROVIDER = 'base44-ai-gateway';

/** The model a controlled test starts on; the flag may override it. */
export const WRITER_DEFAULT_MODEL = 'gpt_5_mini';

/**
 * Keys that carry live design state. None of them may appear anywhere in a
 * writer input: every fact a draft stands on comes from the frozen evidence pack.
 */
export const LIVE_STATE_KEYS = Object.freeze([
  'roomdims',
  'room_length',
  'room_width',
  'room_height',
  'room_orientation',
  'screen_wall',
  'screen_size',
  'screen_height_from_floor',
  'manual_width_m',
  'manual_height_m',
  'seating_positions',
  'row_spacing_m',
  'seats_per_row_by_row',
  'selected_speakers',
  'selected_speakers_by_role',
  'spl_speaker_nodes',
  'room_elements',
  'subwooferinstances',
  'front_subs_cfg',
  'rear_subs_cfg',
  'spl_config',
  'dolby_config',
  'target_spl',
  'amplifier_power',
  'design_state',
  'active_version_id',
  'published_fingerprint',
  'applied_calibration',
  'rsp_mode',
  'manual_rsp_y_m',
  'manual_rsp_x_m',
  'designated_rsp_seat_id',
  'viewing_priority',
  'acoustic_treatment_enabled',
  'selected_abfuser_qty',
  'commercial_tier',
  'lifecycle_status',
  'dealer_account_id',
]);

/**
 * The one root key whose subtree is the frozen evidence pack itself. Its facts
 * are evidence — a saved report's own screen, seating and system values — so the
 * live-state scan does not descend into it. Nothing else is exempt.
 */
export const LIVE_STATE_SCAN_SKIP_ROOTS = Object.freeze(['evidence_pack']);

/**
 * Every path in a value whose key carries live design state.
 *
 * @param {*} value
 * @param {Array<string>} [forbidden]
 * @param {Object} [options]
 * @param {Array<string>} [options.skipRootKeys] — root subtrees left unscanned
 * @returns {Array<string>} offending key paths, e.g. 'project.roomDims'
 */
export function findLiveStateKeyPaths(value, forbidden = LIVE_STATE_KEYS, { skipRootKeys = [] } = {}) {
  const found = [];

  const walk = (node, path) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    for (const key of Object.keys(node)) {
      const next = path ? `${path}.${key}` : key;
      if (!path && skipRootKeys.includes(key)) continue;
      if (forbidden.includes(String(key).toLowerCase())) found.push(next);
      walk(node[key], next);
    }
  };

  walk(value, '');
  return found;
}

/**
 * Prove a writer input carries the evidence and the contract only.
 *
 * @throws when any live design-state key is present outside the frozen pack
 */
export function assertWriterInputCarriesNoLiveState(input) {
  const offending = findLiveStateKeyPaths(input, LIVE_STATE_KEYS, { skipRootKeys: LIVE_STATE_SCAN_SKIP_ROOTS });
  if (offending.length > 0) {
    throw new Error(
      `The writer input carries live design state and was not sent: ${offending.slice(0, 5).join(', ')}. `
      + 'A draft may only ever be written from the frozen evidence pack.',
    );
  }
  return input;
}

/**
 * The output, as a JSON schema the provider enforces. It is derived from the
 * Phase 2 contract — the three top-level keys, the three section keys and the
 * nine section IDs — so the request cannot describe a shape the validator would
 * then refuse.
 */
export function writerOutputJsonSchema() {
  return {
    type: 'object',
    properties: {
      contract_version: { type: 'integer', enum: [WRITER_CONTRACT_VERSION] },
      pack_fingerprint: { type: 'string' },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            section: { type: 'string', enum: [...WRITER_SECTION_IDS] },
            text: { type: 'string' },
            claim_ids: { type: 'array', items: { type: 'string' } },
          },
          required: ['section', 'text', 'claim_ids'],
          additionalProperties: false,
        },
      },
    },
    required: ['contract_version', 'pack_fingerprint', 'sections'],
    additionalProperties: false,
  };
}

/**
 * The prompt. The writer input arrives whole and is serialised verbatim: this
 * function adds instructions, never facts.
 *
 * @param {Object} input
 * @param {Object} input.input — buildWriterInput output
 * @returns {string}
 */
export function buildWriterPrompt({ input } = {}) {
  if (!input || typeof input !== 'object' || !input.evidence_pack?.pack_fingerprint) {
    throw new Error('A writer input built from the frozen evidence pack is required: the writer is given no other source.');
  }

  return [
    'You are the Sound Proof proposal writer.',
    'You do not calculate, measure, estimate or infer anything. You turn the frozen evidence you are given into client-facing narrative copy, and you claim nothing it does not support.',
    '',
    // The authority this writer is held to: the shared Sound Proof writing
    // authority with the proposal sales authority inserted after CORE PRINCIPLE.
    // It is ONE string and is carried as one entry — spreading it here would
    // spread its characters, one per line.
    buildProposalWritingAuthority(),
    '',
    '=== THE WRITER INPUT (your only source) ===',
    'This JSON carries the frozen evidence pack, the nine sections you must write with their word limits, the writing rules, the claims you may make, the claims that are blocked, the bass contract, the grounding rule and the exact output schema. It is the only source of every fact, figure, Performance Level and product name.',
    '',
    JSON.stringify(input),
    '',
    '=== HOW TO WRITE ===',
    'Read the pack, then write each of the nine sections in the order the pack presents them.',
    'Copy every figure, Performance Level and product name exactly as the pack states it. Never round, convert, combine, restate or estimate one.',
    'Ground every client-facing claim by citing one or more allowed claim IDs in that section\'s claim_ids. Use only claim IDs that appear in allowed_claims.',
    'Never present something the pack blocks, and never describe a shared result as a change or a gain.',
    'Never recommend changing the design, and never describe the proposal as an upgrade path.',
    'Sell what is strong. Where a result is strong for the primary seats, state it positively for the primary seats and stop there: do not add a caveat about the secondary seats, and do not report a weaker scope beside a stronger one.',
    'A scoped claim in the pack is the sentence to prefer: where one states a strong result for the primary seats, write that claim\'s own wording, cite its claim ID, and let it stand alone rather than replacing it with a whole-area sentence. Use the scoped claims the pack carries rather than leaving them unused: a comparison draft states the strongest supported primary-seat results it can.',
    'Finish every capability by naming what the client will hear or feel: the moment in a film that the extra headroom, output, control or authority shows itself. A section that only restates headroom, capability and authority describes the design without selling it.',
    'Where the lower-priced option leads on one isolated result, state it accurately and then say what it means, so it is never left as a bare concession: give the result, the significance, and the difference that matters more to the client.',
    'Never repeat a phrase between sections: "before the system sounds strained", "usable headroom" and "with less reserve" are each written once at most, and the same benefit is described from a different angle the next time it appears.',
    'This proposal is not a design review. Never write that anything needs attention, improvement, calibration, optimisation or further design work, and never suggest a future correction, a recalibration or an optimisation to come.',
    'If the evidence shows something that genuinely undermines the proposed system, describe the design as it stands and claim nothing beyond it. Do not write advice about it, and do not write it up as an improvement plan: the attempt is held for human review instead.',
    'In appendix_notes, name the report evidence in words. Never print an internal identifier, a snapshot ID, a file name or a page number: the appendix is read by the client.',
    'Keep every paragraph to one to three sentences and every section inside its word limit.',
    'Write to the client in dealer-safe, benefit-led language, with no internal parameter codes and no engineering jargon.',
    '',
    '=== WHAT TO RETURN ===',
    `Return one JSON object only, matching the output schema in the input exactly (${WRITER_OUTPUT_MODE}).`,
    `Top-level keys: ${['contract_version', 'pack_fingerprint', 'sections'].join(', ')}.`,
    'contract_version is the input\'s contract_version. pack_fingerprint is the input\'s evidence_pack.pack_fingerprint, copied exactly.',
    'sections holds all nine sections, each as { section, text, claim_ids }, with section one of: '
      + `${WRITER_SECTION_IDS.join(', ')}.`,
    'Return no markdown, no code fences, no commentary and no extra keys.',
  ].join('\n');
}

/**
 * The exact request the provider is called with. Three fields, and no field a
 * credential could ever be passed through.
 *
 * @param {Object} input
 * @param {Object} input.input — buildWriterInput output
 * @param {string} [input.model]
 */
export function buildWriterProviderRequest({ input, model = null } = {}) {
  return {
    prompt: buildWriterPrompt({ input }),
    response_json_schema: writerOutputJsonSchema(),
    model: typeof model === 'string' && model.trim().length > 0 ? model.trim() : WRITER_DEFAULT_MODEL,
  };
}

export default buildWriterProviderRequest;