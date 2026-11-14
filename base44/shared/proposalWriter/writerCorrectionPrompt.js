/**
 * writerCorrectionPrompt.js (shared)
 * -----------------------------------
 * THE WORDING-CORRECTION PROMPT BLOCK.
 *
 * When a draft failed validation on wording-only rejections, one bounded
 * correction call hands the writer its own draft back alongside the exact
 * passages, sections, rule IDs and validation feedback, and instructs it to
 * correct ONLY the offending language while preserving every supported claim,
 * claim ID, figure, Performance Level, product, project detail and section
 * structure.
 *
 * The corrected draft is returned as the COMPLETE document (every section),
 * so the same full validator reads it exactly as it read the initial draft.
 * No merge, no partial output, no fallback: the corrected output either passes
 * every existing rule or the attempt is reported as failed.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { WRITER_SECTIONS } from './writerContractSchema.js';

/**
 * A short, human-readable description of one wording-only rejection, so the
 * writer understands what to fix without needing the rule's internal name.
 */
function rejectionGuidance(code) {
  switch (code) {
    case 'generic_marketing_phrase':
      return 'Replace the generic marketing phrase with a project-specific explanation of what was chosen, why it suits this room, what the client gains and what the engineering supports. Never invent a reason to do it.';
    case 'em_dash_in_narrative':
      return 'Remove the em dash (U+2014): punctuate the sentence another way or rewrite it naturally. Never alter a figure, a product identifier or an evidence reference while doing so.';
    case 'stock_connective':
      return 'Remove the stock connective at the head of the sentence (Furthermore, Moreover, Additionally, Subsequently, In conclusion, It is important to note that). Write a natural transition instead.';
    case 'repetitive_paragraph_opener':
      return 'Vary the repeated mechanical paragraph opener (The system, The design, This ensures, The result). Reopen the paragraph on the design\'s own subject.';
    case 'report_voice':
      return 'Remove the software-report register. Talk to the client, not about the fields a program filled in. No "assessed for", "this parameter", "according to the report", "performance result", "this proposal details".';
    case 'validation_register':
      return 'Remove the validation register. State what the design delivers, never defend a claim ("this is not a claim", "no claim is made", "it does not establish").';
    default:
      return 'Correct the rejected wording.';
  }
}

/**
 * The section title for a section ID, so the writer can locate the passage.
 */
function sectionTitle(id) {
  const spec = WRITER_SECTIONS.find((entry) => entry.section === id);
  return spec?.title || id || 'the section';
}

/**
 * Format one violation as a correction instruction the writer reads.
 */
function formatViolation(entry, index) {
  const section = entry?.section || 'unknown';
  const title = sectionTitle(section);
  const code = entry?.code || 'unknown';
  const detail = entry?.detail || '';
  const sentence = entry?.clause || entry?.sentence || '';
  const guidance = rejectionGuidance(code);

  const lines = [
    `${index + 1}. Section "${title}" (${section}) — rule: ${code}`,
  ];
  if (sentence) {
    lines.push(`   The rejected passage: "${sentence}"`);
  }
  if (detail) {
    lines.push(`   Detail: ${detail}`);
  }
  lines.push(`   What to do: ${guidance}`);
  return lines.join('\n');
}

/**
 * Build the correction prompt block. This replaces the writer's normal
 * instructions with a focused correction instruction, while keeping the same
 * writer input (evidence pack, contract, rules) so the corrected draft is
 * grounded in exactly the same evidence.
 *
 * @param {Object} input
 * @param {Object} input.initialOutput — the draft that failed validation
 * @param {Array<{code, section, detail, clause}>} input.violations — the
 *   wording-only rejections the validator reported
 * @returns {string} the correction prompt block
 */
export function buildCorrectionPromptBlock({ initialOutput = null, violations = [] } = {}) {
  const list = Array.isArray(violations) ? violations : [];
  const violationLines = list.map((entry, index) => formatViolation(entry, index)).join('\n\n');

  // The writer's own draft is handed back so it can correct in place: every
  // section, every claim ID, every figure and every product stays exactly as
  // the initial draft returned it, and ONLY the rejected passages are rewritten.
  const draftJson = initialOutput ? JSON.stringify(initialOutput, null, 2) : 'null';

  return [
    '=== CONTROLLED WORDING CORRECTION ===',
    'Your previous draft is below. It passed every engineering, evidence, grounding, scope, product, figure and level check, but it was rejected for wording-only violations. Correct ONLY the offending language identified below. Do not change anything else.',
    '',
    'PRESERVE EXACTLY (never alter any of these):',
    '- Every section, in the same order, with the same section IDs.',
    '- Every claim_ids array on every section — cite the same allowed claim IDs.',
    '- Every figure, Performance Level, product name, model, quantity and project detail, copied exactly as the draft already states it.',
    '- The contract_version and pack_fingerprint, unchanged.',
    '- Every passage that was NOT flagged below: return it verbatim.',
    '',
    'CORRECT ONLY THE FOLLOWING WORDING VIOLATIONS:',
    violationLines || '(no specific violations were identified)',
    '',
    'YOUR PREVIOUS DRAFT (correct the flagged passages in place):',
    draftJson,
    '',
    'Return the COMPLETE corrected document: every section this contract requires, with the same JSON shape as before. Only the flagged passages should read differently. Do not add commentary, do not explain the change, and do not return a partial document.',
  ].join('\n');
}

export default buildCorrectionPromptBlock;