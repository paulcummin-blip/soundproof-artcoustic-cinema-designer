/**
 * proposalBriefCoverageGate.js (shared)
 * -------------------------------------
 * The editorial review surface for Steering Brief coverage.
 *
 * It uses the existing brief coverage audit (`buildClientBriefCoverage`), run
 * against the proposal's own brief and its current section text. The frozen
 * evidence pack is not required here: a brief item the reports support is
 * recognised by its subject, and an item that names a parameter the reports do
 * not state is never the writer's to answer, so it never blocks.
 *
 * REVIEW ONLY. The gate returns a review signal — which brief items are
 * outstanding, with plain dealer-facing section labels — but it does NOT block
 * issue/send. Hard enforcement is deferred behind an explicit, off-by-default
 * rollout setting (`hard_enforcement`) until the coverage checker is reliable
 * enough to gate a proposal without false positives. The existing evidence and
 * approval gates remain the sole authorities for issue/send.
 *
 * The gate applies only to proposals created under the new Steering Brief
 * workflow (marked with `metadata.brief_coverage_required === true`), so existing
 * proposals that predate the requirement are never affected.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { buildClientBriefCoverage } from './writerClientBriefCoverage.js';

/**
 * Plain, dealer-facing labels for the writer sections a brief item may belong
 * to. A dealer reads "Design Summary" or "Dynamic Range", never the underscore
 * key or a reason code.
 */
const SECTION_LABELS = Object.freeze({
  system_design_summary: 'Design Summary',
  key_performance_highlights: 'Key Performance Highlights',
  spatial_resolution: 'Spatial Resolution',
  dynamic_range: 'Dynamic Range',
  timbre_matching: 'Timbre Matching',
  overall_design: 'Overall Design',
  presented_options: 'Presented Options',
  what_stays_same: 'Design Overview',
  what_changes: 'Why This Specification',
  decision_summary: 'Design Summary',
});

function sectionLabel(sectionKey) {
  return SECTION_LABELS[sectionKey] || 'the relevant section';
}

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
 * @param {Object} [options]
 * @param {boolean} [options.hard_enforcement=false] — when true, the gate
 *   blocks issue/send. Off by default: the gate is a review surface only until
 *   the coverage checker is reliable enough to gate without false positives.
 * @returns {{ applies: boolean, blocked: boolean, reason: string|null, outstanding: Array, coverage: Object|null }}
 */
export function briefCoverageGate(proposal = null, sections = [], { hard_enforcement = false } = {}) {
  const required = proposal?.metadata?.brief_coverage_required === true;
  if (!required) return { applies: false, blocked: false, reason: null, outstanding: [], coverage: null };

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
    return { applies: true, blocked: false, reason: null, outstanding: [], coverage };
  }

  const outstanding = Array.isArray(coverage.outstanding) ? coverage.outstanding : [];
  // Plain, actionable feedback: each outstanding item stated as the brief
  // wrote it, with the dealer-facing section name and what the copy is missing.
  // A dealer reads what to fix and where, not a generic count, a reason code
  // or an underscore key.
  const items = outstanding.map((row) => {
    const label = sectionLabel(row.revision_section);
    const missing = row.missing_subject
      ? ` (the copy does not mention ${row.missing_subject})`
      : '';
    return `- ${row.item} — edit ${label}${missing}`;
  });
  const firstItem = outstanding[0]?.item || 'a requirement in your Steering Brief';
  const reason = outstanding.length === 1
    ? `The proposal does not yet address ${firstItem}. Edit the copy or regenerate so it reflects the Steering Brief, then issue it.\n${items.join('\n')}`
    : `The proposal does not yet address ${outstanding.length} requirements from your Steering Brief (for example: ${firstItem}). Edit the copy or regenerate so it reflects the brief, then issue it.\n${items.join('\n')}`;

  // Hard enforcement is deferred behind an explicit, off-by-default rollout
  // setting. Until it is turned on, the gate is a REVIEW SURFACE only: it
  // reports outstanding items but never blocks issue/send. The existing
  // evidence and approval gates remain the sole authorities.
  const blocked = hard_enforcement === true;

  return { applies: true, blocked, reason: blocked ? reason : null, outstanding, coverage };
}

export default briefCoverageGate;