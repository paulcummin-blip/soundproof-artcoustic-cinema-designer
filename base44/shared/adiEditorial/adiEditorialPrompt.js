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
  checkAdiEditorialQuality,
  looksLikeHtml,
} from './adiEditorialStandard.js';
import { normaliseDiagnosticViolation } from './adiRejectionDiagnostics.js';

import { PROPOSAL_SECTION_FOR_WRITER_SECTION } from '../proposalWriter/writerSectionMapping.js';
import { writerSectionsForMode } from '../proposalWriter/writerContractSchema.js';

/** The structural agreement is read from the existing frozen writer mapping. */
export function adiSectionContract({ sectionType = null, sectionLabel = 'section', mode = 'single', original = '' } = {}) {
  const parts = writerSectionsForMode(mode).filter((entry) =>
    PROPOSAL_SECTION_FOR_WRITER_SECTION[entry.section] === sectionType);
  return {
    section_type: sectionType,
    section_label: sectionLabel,
    required_headings: parts.length > 1 ? parts.map((entry) => entry.title) : [],
    source_blocks: (String(original).match(/<(h[1-6]|p|ul|ol|li)\b[^>]*>/gi) || []),
    instruction: 'Preserve the heading order and the paragraph/block structure within each part. Shorten wording within blocks; never move supported meaning between parts.',
  };
}

function contractBlock(contract) {
  return [
    '=== SECTION TYPE ===',
    contract?.section_label || contract?.section_type || 'section',
    '=== REQUIRED STRUCTURE ===',
    JSON.stringify(contract || {}, null, 2),
    'Required headings are immutable labels: retain their exact wording and order.',
    'Frozen supporting context is exactly the unchanged evidence-identity block in the original brief below. No additional project evidence is sent for correction.'
  ];
}

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
  sectionContract = null,
} = {}) {
  const sourceCopy = mode === 'selection' ? selectionText : currentText;
  const html = looksLikeHtml(sourceCopy);
  const scoped = mode === 'selection';
  const sourceQuality = checkAdiEditorialQuality(sourceCopy);
  const requiredFinalCut = sourceQuality.ok
    ? []
    : [
      '=== REQUIRED FINAL CUT IN THIS SOURCE ===',
      'The current copy contains the exact weak phrases below. Removing or naturally rewriting these phrases is the priority for this pass:',
      ...sourceQuality.violations.map((entry) => `  - ${entry.matched_substring}`),
      'Do not perform a broad rewrite while any cited phrase remains. Keep the surrounding supported meaning, structure and detail intact.',
      '',
    ];

  return [
    `You are ADI, the Artcoustic Design Intelligence editorial voice for Sound Proof, a professional home cinema engineering house. You are improving the wording of the ${sectionLabel} section of a client-facing document.`,
    '',
    `THIS COPY IS THE EDITORIAL INPUT. Treat its engineering facts, figures, products, scope, results and genuine limitations as fixed. Qualitative filler, repetition and rhetorical commentary may be simplified or removed.`,
    '',
    ADI_EDITORIAL_STANDARD,
    '',
    '=== THE AUTHORITY BOUNDARY (absolute) ===',
    'The improved wording may NOT:',
    ...ADI_AUTHORITY_BOUNDARY.map((entry) => `  - ${entry}`),
    '',
    'It may only improve the wording of meaning that is already in the copy above.',
    'Do not make the text more impressive by adding plausible benefits or explanations. If an idea is not already expressed in the source copy, do not introduce it. Better wording may be simpler than the original.',
    'Every number, every level, every product name, every seating scope, every limitation and every assumption stays exactly as it is. If a sentence states a limit, a caveat or an assumption, the improved sentence states it too.',
    'You may combine, shorten or remove a sentence that adds only repetition, rhetoric or unsupported qualitative explanation. Preserve every supported engineering fact, figure, product, scope, result and genuine limitation.',
    'Read the copy for repetition first. Where the same idea (for example everyday viewing, films, or surround sound) is described more than once, state it once, in the place it fits best, and use the freed space for smoother flow. Keep each required heading and its paragraphs; do not move meaning between headings.',
    'Judge the copy against the Sound Proof client writing standard: it should read as an experienced cinema designer explaining the design to a homeowner, with each paragraph carrying one new idea, plain wording instead of technical vocabulary, and no claim stronger than the evidence already in the copy. Improve it where it falls short, without adding any fact, figure or product the copy does not already state.',
    'Return the copy unchanged only if it genuinely has no repetition or awkward wording.',
    RULE,
    '',
    ...identityBlock({ evidenceIdentity, documentIdentity }),
    '',
    ...contractBlock(sectionContract),
    '',
    ...requiredFinalCut,
    ...copyBlock({ mode, selectionText, currentText }),
    '',
    '=== INSTRUCTION ===',
    scoped
      ? 'Rewrite ONLY the highlighted text. Everything else in the copy must stay exactly as it is — it is not being returned.'
      : 'Rewrite the whole section. Keep its structure and supported engineering meaning; use fewer words or sentences where that improves the client copy.',
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

/**
 * THE CORRECTION PROMPT — the second, and final, candidate.
 *
 * A rewrite that was refused is not simply lost: it goes straight back with the
 * exact violations it was refused for, the copy it was read against and the brief
 * it was first given, and ADI is asked to repair its own wording once.
 *
 * Nothing is relaxed to make a correction easier. The same authority boundary is
 * stated again, and each violation is stated exactly as the deciding module
 * reported it — so the pass repairs its wording against the rule it actually
 * broke, not against a paraphrase of it.
 *
 * @param {Object} input
 * @param {string} [input.basePrompt] — the brief that produced the refused copy
 * @param {string} [input.original] — the copy whose meaning must not change
 * @param {string} [input.refused] — the rewrite that was refused
 * @param {string|null} [input.stage] — the stage that refused it, for the record
 * @param {Array} [input.violations] — the deciding module's own violations, verbatim
 * @returns {string} the prompt
 */
export function buildAdiCorrectionPrompt({
  basePrompt = '',
  original = '',
  refused = '',
  stage = null,
  violations = [],
  sectionContract = null,
} = {}) {
  const html = looksLikeHtml(refused) || looksLikeHtml(original);
  const entries = (Array.isArray(violations) ? violations : []).map(normaliseDiagnosticViolation);

  const stated = entries.length === 0
    ? ['(no single violation was named — the copy was refused as a whole)']
    : entries.reduce((lines, entry, index) => {
      lines.push(`${index + 1}. RULE: ${entry.rule || 'unnamed'}`);
      if (entry.category) lines.push(`   CATEGORY: ${entry.category}`);
      if (entry.originalValue) lines.push(`   ORIGINAL VALUE: ${entry.originalValue}`);
      if (entry.proposedValue) lines.push(`   PROPOSED VALUE: ${entry.proposedValue}`);
      if (entry.originalExcerpt) lines.push(`   ORIGINAL EXCERPT: ${entry.originalExcerpt}`);
      if (entry.proposedExcerpt) lines.push(`   PROPOSED EXCERPT: ${entry.proposedExcerpt}`);
      if (entry.explanation) lines.push(`   WHY IT WAS REFUSED: ${entry.explanation}`);
      return lines;
    }, []);

  const brief = String(basePrompt || '').trim();

  return [
    ...(brief.length > 0
      ? ['=== THE BRIEF YOU WERE GIVEN (unchanged) ===', brief, '']
      : []),
    ...contractBlock(sectionContract),
    '',
    '=== CORRECTION REQUIRED — YOU HAVE ONE MORE ATTEMPT ===',
    'The rewrite you returned was read against the authority boundary below and REFUSED. It was not accepted, nothing was saved, and the original copy is still in place.',
    ...(stage ? [`The stage that refused it: ${stage}.`] : []),
    '',
    '=== THE COPY TO IMPROVE (the authority — its meaning does not change) ===',
    original || '(the copy is empty)',
    '',
    '=== THE REWRITE THAT WAS REFUSED (do not return it again as it stands) ===',
    refused || '(nothing was returned)',
    '',
    '=== THE EXACT VIOLATIONS (final authority — the corrected copy must carry none of them) ===',
    ...stated,
    JSON.stringify(violations, null, 2),
    '',
    '=== INSTRUCTION ===',
    'Correct only the listed validation violations. Preserve the intended editorial improvements. Do not restore weak wording unnecessarily.',
    ...(stage === 'editorial_quality'
      ? [
        'This refusal concerns editorial quality alone. Start from the refused rewrite and change only the exact phrase spans named above.',
        'Keep every other word, sentence, HTML tag and paragraph in the refused rewrite unchanged.',
      ]
      : []),
    'Start from the first candidate. Do not start again from scratch. Preserve every useful editorial improvement outside the phrases responsible for the listed failures.',
    'Preserve every figure, qualifier, limitation, seat scope, product, RP22/RP23 result, required heading and required section structure.',
    'Return the complete corrected section.',
    'Repair the wording itself: remove or rephrase only the change each violation names, and keep every fact, figure, level, product, scope and limitation the copy already supports.',
    'Deleting supported engineering content is not a correction, and adding a new fact, benefit, reason or claim is not a correction.',
    '',
    '=== THE AUTHORITY BOUNDARY (absolute — unchanged) ===',
    'The corrected wording may NOT:',
    ...ADI_AUTHORITY_BOUNDARY.map((entry) => `  - ${entry}`),
    'Every violation above is one of these rules having been broken. The corrected copy breaks none of them.',
    '',
    RULE,
    '',
    '=== OUTPUT ===',
    html
      ? 'Keep the same HTML structure and the same tags. Return the corrected copy as HTML, with no wrapper element, no <html>, <head> or <body>, and no code fence.'
      : 'Return the corrected copy as clean plain prose, with no wrapper, no heading, no label and no code fence.',
    'Write in British English. Do not add a heading, a sign-off, a note, an explanation or a list of what you changed.',
    'Return the corrected copy alone, and nothing else.',
  ].join('\n');
}

export default buildAdiEditorialPrompt;