/**
 * proposalBriefCoverageGate.js (shared)
 * -------------------------------------
 * The editorial gate that stops a proposal being issued or sent to the client
 * when the finished document has not meaningfully addressed the designer's
 * Steering Brief.
 *
 * It uses the existing brief coverage audit (`buildClientBriefCoverage`), run
 * against the proposal's own brief and its current section text. The frozen
 * evidence pack is not required here: a brief item the reports support is
 * recognised by its subject, and an item that names a parameter the reports do
 * not state is never the writer's to answer, so it never blocks. This is the
 * meaning check the user asked for, not a term match: an item is addressed only
 * where the copy reaches its subject and states the matter it asks for, and a
 * bare mention of a related word is never enough.
 *
 * The gate applies only to proposals created under the new Steering Brief
 * workflow (marked with `metadata.brief_coverage_required === true`), so existing
 * proposals that predate the requirement are never blocked from being issued.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { buildClientBriefCoverage } from './writerClientBriefCoverage.js';

/**
 * Whether a proposal may be issued or sent given what its copy did with the
 * designer's brief.
 *
 * @param {Object} proposal — the saved Proposal record (its client_brief and
 *   metadata are read; metadata.brief_coverage_required decides whether the gate
 *   applies at all)
 * @param {Array<{ section: string, section_type?: string, text: string, body?: string }>} sections —
 *   the proposal's current sections, as transitionProposalStatus already reads
 *   them
 * @returns {{ applies: boolean, blocked: boolean, reason: string|null, outstanding: Array }}
 */
export function briefCoverageGate(proposal = null, sections = []) {
  const required = proposal?.metadata?.brief_coverage_required === true;
  if (!required) return { applies: false, blocked: false, reason: null, outstanding: [] };

  const brief = {
    client_brief: proposal?.client_brief || null,
    narrative_brief: proposal?.narrative_brief || null,
    designer_notes: proposal?.metadata?.dealer_notes || null,
  };
  const normalisedSections = (Array.isArray(sections) ? sections : [])
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      section: entry.section || entry.section_type || null,
      text: entry.text != null ? entry.text : (entry.body || ''),
    }));

  const coverage = buildClientBriefCoverage({
    brief,
    pack: null,
    interpretation: null,
    sections: normalisedSections,
  });

  if (coverage.complete === true) {
    return { applies: true, blocked: false, reason: null, outstanding: [] };
  }

  const outstanding = Array.isArray(coverage.outstanding) ? coverage.outstanding : [];
  const firstItem = outstanding[0]?.item || 'a requirement in your Steering Brief';
  const reason = outstanding.length === 1
    ? `The proposal does not yet address ${firstItem}. Edit the copy or regenerate so it reflects the Steering Brief, then issue it.`
    : `The proposal does not yet address ${outstanding.length} requirements from your Steering Brief (for example: ${firstItem}). Edit the copy or regenerate so it reflects the brief, then issue it.`;

  return { applies: true, blocked: true, reason, outstanding };
}

export default briefCoverageGate;