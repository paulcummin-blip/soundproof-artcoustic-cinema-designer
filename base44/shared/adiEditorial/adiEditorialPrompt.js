/**
 * adiEditorialPrompt.js (shared)
 * ------------------------------
 * THE ONE PROMPT an ADI editorial pass is called with.
 *
 * It is deliberately not the writer's prompt. The writer is given the frozen
 * evidence and asked to say what is true; this asks for something narrower and
 * entirely different: rewrite THIS copy, whose meaning is already settled, so it
 * reads as an experienced home cinema designer speaking to a client.
 *
 * So the prompt carries the copy and the standard, and it carries the identity of
 * what the copy stands on — the evidence it was written from and the document it
 * belongs to — as CONTEXT. It never carries the evidence itself, and that is the
 * point: the pass is not being asked to write from the evidence, so it has
 * nothing to reason from and nothing to add. The authority boundary is stated in
 * full, and what a rewrite may not do is enforced again, mechanically, by the
 * conservation gate after the copy comes back.
 *
 * Pure: no React, no SDK, no runtime-specific APIs. No provider call is made here.
 */

import {
  ADI_AUTHORITY_BOUNDARY,
  ADI_EDITORIAL_STANDARD,
  looksLikeHtml,
} from './adiEditorialStandard.js';

const RULE = 'Never say or imply that this copy was written by AI. ADI is Sound Proof\'s own editorial intelligence.';

/** The copy to improve, stated as the pass is asked to see it. */
function copyBlock({ mode, selectionText, currentText }) {
  if (mode === 'selection') {
    return [
      '=== THE COPY THAT MUST NOT CHANGE (context only) ===',
      currentText || '(not supplied)',
      '',
      '=== THE HIGHLIGHTED TEXT — REWRITE THIS, AND ONLY THIS ===',
      selectionText || '(nothing was highlighted)',
    ];
  }
  return [
    '=== THE COPY TO IMPROVE ===',
    currentText || '(the copy is empty)',
  ];
}

/** What the copy was written from and where it is read. Context, never a source. */
function identityBlock({ evidenceIdentity, documentIdentity }) {
  const lines = [];
  const evidence = evidenceIdentity && typeof evidenceIdentity === 'object' ? evidenceIdentity : null;
  const document = documentIdentity && typeof documentIdentity === 'object' ? documentIdentity : null;

  if (evidence) {
    lines.push('=== WHAT THIS COPY STANDS ON (context only — do not restate it) ===');
    if (evidence.source) lines.push(`Evidence source: ${evidence.source}`);
    if (evidence.evidence_pack_fingerprint) lines.push(`Evidence pack: ${evidence.evidence_pack_fingerprint}`);
    if (evidence.report_or_report_type) lines.push(`Document type: ${evidence.report_or_report_type}`);
    lines.push('The copy above was written from this evidence and has already been accepted.');
    lines.push('Your task is wording, not evidence. Nothing about the evidence changes.');
  }

  if (document) {
    const stated = Object.entries(document)
      .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
      .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`);
    if (stated.length > 0) {
      lines.push('', '=== THE DOCUMENT THIS COPY BELONGS TO (context only) ===', ...stated);
    }
  }

  return lines;
}

/**
 * Build the editorial prompt.
 *
 * @param {Object} input
 * @param {string} input.sectionLabel — the section being improved, as it is named
 * @param {string} [input.mode] — 'section' (the whole section) or 'selection'
 * @param {string} [input.currentText] — the visible copy, HTML or prose
 * @param {string} [input.selectionText] — the highlighted text, in selection mode
 * @param {Object|null} [input.evidenceIdentity] — the identity of the evidence the
 *   copy was written from. Identity only: no figure, level, product or result.
 * @param {Object|null} [input.documentIdentity] — project, client, version, report
 * @returns {string} the prompt
 */
export function buildAdiEditorialPrompt({
  sectionLabel = 'section',
  mode = 'section',
  currentText = '',
  selectionText = '',
  evidenceIdentity = null,
  documentIdentity = null,
} = {}) {
  const html = looksLikeHtml(mode === 'selection' ? selectionText : currentText);
  const scoped = mode === 'selection';

  return [
    `You are ADI, the Artcoustic Design Intelligence editorial voice for Sound Proof, a professional home cinema engineering house. You are improving the wording of the ${sectionLabel} section of a client-facing document.`,
    '',
    `THIS COPY IS ALREADY CORRECT. It was written from Sound Proof's own engineering evidence and it has been accepted. You are not writing it again: you are improving how it reads.`,
    '',
    ADI_EDITORIAL_STANDARD,
    '',
    '=== THE AUTHORITY BOUNDARY (absolute) ===',
    'The improved wording may NOT:',
    ...ADI_AUTHORITY_BOUNDARY.map((entry) => `  - ${entry}`),
    '',
    'It may only improve the wording of meaning that is already in the copy above.',
    'Every number, every level, every product name, every seating scope, every limitation and every assumption stays exactly as it is. If a sentence states a limit, a caveat or an assumption, the improved sentence states it too.',
    `Never add a sentence, and never drop a sentence: the copy is the same copy, said better.`,
    RULE,
    '',
    ...identityBlock({ evidenceIdentity, documentIdentity }),
    '',
    ...copyBlock({ mode, selectionText, currentText }),
    '',
    '=== INSTRUCTION ===',
    scoped
      ? 'Rewrite ONLY the highlighted text. Everything else in the copy must stay exactly as it is — it is not being returned.'
      : 'Rewrite the whole section. Same paragraphs, same facts, better wording.',
    html
      ? 'Keep the same HTML structure and the same tags. Return the copy as HTML, with no wrapper element, no <html>, <head> or <body>, and no code fence.'
      : 'Return the copy as clean plain prose, with no wrapper, no heading, no label and no code fence.',
    'Write in British English. Do not add a heading, a sign-off, a note or an explanation.',
    '',
    '=== OUTPUT ===',
    scoped
      ? 'Return the improved highlighted text alone, and nothing else.'
      : 'Return the improved copy alone, and nothing else.',
  ].join('\n');
}

export default buildAdiEditorialPrompt;