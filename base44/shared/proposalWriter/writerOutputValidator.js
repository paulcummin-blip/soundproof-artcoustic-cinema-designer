/**
 * writerOutputValidator.js (shared)
 * ----------------------------------
 * THE Phase 2 validator: the gate every returned draft passes through before it
 * is anything at all.
 *
 * It reads a draft against the exact input the writer was given — the frozen
 * pack, its allowed claim IDs, its blocked claims, its word limits — and returns
 * either a valid draft or the complete list of reasons it was rejected. A draft
 * is valid only when there is nothing to report: no unsupported claim, no
 * blocked claim, no invented benefit, no changed figure or level, no unselected
 * or mis-attributed product, no unsupported recommendation or improvement, no
 * bass consistency claim the P20 result does not support, no section over its
 * word limit, and no schema violation.
 *
 * This module makes no GPT call, writes nothing and mutates nothing: it is a
 * pure function of (input, draft).
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import {
  BLOCKED_CLAIM_PREFIX,
  ALLOWED_CLAIM_PREFIX,
  WRITER_OUTPUT_KEYS,
  WRITER_OUTPUT_SECTION_KEYS,
  WRITER_REJECTION,
  WRITER_SECTIONS,
  violation,
  writerSection,
} from './writerContractSchema.js';
import { scanProse } from './writerOutputTextRules.js';
import { validatorProvenance } from './validatorProvenance.js';
import { attributeViolation } from './writerViolationAudit.js';
import {
  blockIdSet,
  claimIndex,
  packVocabulary,
  wordCount,
} from './writerVocabulary.js';

/** Identical rejections are reported once. */
function dedupe(violations) {
  const seen = new Set();
  return violations.filter((entry) => {
    const key = `${entry.code}|${entry.section}|${entry.detail}|${entry.clause_span?.start ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The one shape a validation returns. */
function summarise({ contractVersion, packFingerprint, violations, sections, input, draft }) {
  const provenance = validatorProvenance(input);
  const reported = dedupe(violations).map(entry => {
    const target = draft?.sections?.find(s => s.section === entry.section);
    const attributed = entry.rule_id ? entry : attributeViolation(entry, { text: target?.text || '' });
    return { ...attributed, validator_version: provenance.validator_version,
      validator_rules_fingerprint: provenance.validator_rules_fingerprint,
      cited_claim_ids: target?.claim_ids || attributed.cited_claim_ids || [] };
  });
  return {
    ...provenance,
    valid: reported.length === 0,
    contract_version: contractVersion ?? null,
    pack_fingerprint: packFingerprint ?? null,
    sections,
    violations: reported,
  };
}

/**
 * Read a returned draft as JSON. A draft arrives as text: this strips a code
 * fence if one was added and parses it, and reports the schema violation when
 * what came back is not the JSON object the contract asks for.
 *
 * @param {string|Object} raw
 * @returns {{ output: Object|null, violations: Array<Object> }}
 */
export function parseWriterOutput(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return {
      output: null,
      violations: [violation(WRITER_REJECTION.SCHEMA_VIOLATION, { detail: 'output_is_empty' })],
    };
  }

  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return {
        output: null,
        violations: [violation(WRITER_REJECTION.SCHEMA_VIOLATION, { detail: 'output_is_a_json_array' })],
      };
    }
    return { output: parsed, violations: [] };
  } catch {
    return {
      output: null,
      violations: [violation(WRITER_REJECTION.SCHEMA_VIOLATION, { detail: 'output_is_not_json' })],
    };
  }
}

/** The schema rules: exactly these keys, exactly these sections, nothing else. */
function schemaViolations({ input, draft }) {
  const found = [];

  for (const key of Object.keys(draft)) {
    if (!WRITER_OUTPUT_KEYS.includes(key)) {
      found.push(violation(WRITER_REJECTION.SCHEMA_VIOLATION, { detail: `unexpected_output_key:${key}` }));
    }
  }
  for (const key of WRITER_OUTPUT_KEYS) {
    if (!(key in draft)) {
      found.push(violation(WRITER_REJECTION.SCHEMA_VIOLATION, { detail: `missing_output_key:${key}` }));
    }
  }
  if (draft.contract_version !== input?.contract_version) {
    found.push(violation(WRITER_REJECTION.SCHEMA_VIOLATION, {
      detail: `contract_version_mismatch:${String(draft.contract_version)}`,
    }));
  }
  if (String(draft.pack_fingerprint || '') !== String(input?.evidence_pack?.pack_fingerprint || '')) {
    found.push(violation(WRITER_REJECTION.SCHEMA_VIOLATION, { detail: 'pack_fingerprint_mismatch' }));
  }
  if (!Array.isArray(draft.sections)) {
    found.push(violation(WRITER_REJECTION.SCHEMA_VIOLATION, { detail: 'sections_is_not_an_array' }));
  }

  return found;
}

/** Every section the draft returns, by section ID, with its own schema checked. */
function indexSections({ draft, violations }) {
  const byId = new Map();
  if (!Array.isArray(draft.sections)) return byId;
  const seen = new Set();

  for (const entry of draft.sections) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      violations.push(violation(WRITER_REJECTION.SCHEMA_VIOLATION, { detail: 'section_is_not_an_object' }));
      continue;
    }

    const id = typeof entry.section === 'string' ? entry.section : null;

    for (const key of Object.keys(entry)) {
      if (!WRITER_OUTPUT_SECTION_KEYS.includes(key)) {
        violations.push(violation(WRITER_REJECTION.SCHEMA_VIOLATION, { section: id, detail: `unexpected_section_key:${key}` }));
      }
    }
    for (const key of WRITER_OUTPUT_SECTION_KEYS) {
      if (!(key in entry)) {
        violations.push(violation(WRITER_REJECTION.SCHEMA_VIOLATION, { section: id, detail: `missing_section_key:${key}` }));
      }
    }
    if (!id) {
      violations.push(violation(WRITER_REJECTION.SCHEMA_VIOLATION, { detail: 'section_without_a_section_id' }));
      continue;
    }
    if (!writerSection(id)) {
      violations.push(violation(WRITER_REJECTION.SCHEMA_VIOLATION, { section: id, detail: `unknown_section:${id}` }));
      continue;
    }
    if (seen.has(id)) {
      violations.push(violation(WRITER_REJECTION.SCHEMA_VIOLATION, { section: id, detail: `duplicate_section:${id}` }));
    }
    seen.add(id);
    byId.set(id, entry);
  }

  for (const spec of WRITER_SECTIONS) {
    if (byId.has(spec.section)) continue;
    violations.push(violation(WRITER_REJECTION.SCHEMA_VIOLATION, {
      section: spec.section,
      detail: `missing_section:${spec.section}`,
    }));
  }

  return byId;
}

/**
 * Validate a returned draft against the input the writer was given.
 *
 * @param {Object} input — buildWriterInput output
 * @param {Object|string} output — the returned draft (an object, or raw JSON text)
 * @returns {{ valid: boolean, contract_version, pack_fingerprint, sections, violations }}
 */
export function validateWriterOutput({ input, output } = {}) {
  const violations = [];
  let draft = output;

  if (typeof output === 'string') {
    const parsed = parseWriterOutput(output);
    violations.push(...parsed.violations);
    draft = parsed.output;
  }

  const contractVersion = input?.contract_version ?? null;
  const packFingerprint = input?.evidence_pack?.pack_fingerprint ?? null;

  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    if (violations.length === 0) {
      violations.push(violation(WRITER_REJECTION.SCHEMA_VIOLATION, { detail: 'output_is_not_a_json_object' }));
    }
    return summarise({ contractVersion, packFingerprint, violations, sections: [], input, draft });
  }

  violations.push(...schemaViolations({ input, draft }));
  const byId = indexSections({ draft, violations });

  const claimsById = claimIndex(input);
  const blocks = blockIdSet(input);
  const vocabulary = packVocabulary(input?.evidence_pack);
  const sections = [];

  for (const spec of WRITER_SECTIONS) {
    const entry = byId.get(spec.section);
    if (!entry) continue;

    const text = typeof entry.text === 'string' ? entry.text : '';
    if (text.trim().length === 0) {
      violations.push(violation(WRITER_REJECTION.SCHEMA_VIOLATION, {
        section: spec.section,
        detail: 'section_text_missing',
      }));
      continue;
    }

    if (!Array.isArray(entry.claim_ids) || !entry.claim_ids.every((id) => typeof id === 'string')) {
      violations.push(violation(WRITER_REJECTION.SCHEMA_VIOLATION, {
        section: spec.section,
        detail: 'claim_ids_is_not_an_array_of_claim_ids',
      }));
      continue;
    }

    const words = wordCount(text);
    if (words > spec.word_limit) {
      violations.push(violation(WRITER_REJECTION.SECTION_TOO_LONG, {
        section: spec.section,
        detail: `${words}_words_over_the_${spec.word_limit}_word_limit`,
      }));
    }

    // Grounding: every cited ID must be a claim this pack allows. A blocked
    // claim ID, an ID from another pack, or a malformed ID resolves to nothing.
    const claims = [];
    for (const id of entry.claim_ids) {
      if (id.startsWith(BLOCKED_CLAIM_PREFIX) || blocks.has(id)) {
        violations.push(violation(WRITER_REJECTION.BLOCKED_CLAIM, {
          section: spec.section,
          detail: id,
          claim_ids: [id],
        }));
      } else if (claimsById.has(id)) {
        claims.push(claimsById.get(id));
      } else if (id.startsWith(ALLOWED_CLAIM_PREFIX)) {
        violations.push(violation(WRITER_REJECTION.UNSUPPORTED_CLAIM, {
          section: spec.section,
          detail: id,
          claim_ids: [id],
        }));
      } else {
        violations.push(violation(WRITER_REJECTION.SCHEMA_VIOLATION, {
          section: spec.section,
          detail: `claim_id_is_not_a_claim_id:${id}`,
        }));
      }
    }

    violations.push(...scanProse({
      input,
      vocabulary,
      section: spec.section,
      text,
      claims,
      claimKinds: claims.map((claim) => claim.kind),
    }));

    sections.push({
      section: spec.section,
      words,
      word_limit: spec.word_limit,
      claim_ids: [...entry.claim_ids],
    });
  }

  return summarise({ contractVersion, packFingerprint, violations, sections, input, draft });
}

export default validateWriterOutput;