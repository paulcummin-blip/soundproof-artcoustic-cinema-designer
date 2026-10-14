import React from 'react';
import AdiSuggestionChips from '@/components/proposal/wizard/AdiSuggestionChips';
import ComparisonMessagePrompt from '@/components/proposal/wizard/ComparisonMessagePrompt';

/**
 * Step 4 — Client Brief & Narrative Steer.
 *
 * Two separate things live here, and they carry different authority:
 *
 *   THE BRIEF — the designer's own words about what matters in this design and
 *   why they are recommending it. It is the strongest narrative authority in the
 *   document, it guides wording and emphasis, and it NEVER alters engineering
 *   results, RP22 values, Design Ratings or recommendations.
 *
 *   THE NARRATIVE STEER — the topics ADI should weigh, each in one of three
 *   states: neutral, prefer, or do not discuss. A preference is an ingredient,
 *   not a section plan: it can appear briefly, in passing, combined with another
 *   point, or not at all where forcing it would damage the writing. "Do not
 *   discuss" keeps a topic out of the client-facing narrative and touches no
 *   evidence, no reported result and no technical table.
 *
 * The topics under the brief are ADI's own suggestions, derived from this
 * project's strongest published evidence (see AdiSuggestionChips). Selecting one
 * never writes anything into the brief.
 *
 * Anything ADI cannot explain from the evidence — a design decision with no reason
 * on record — is asked about on the Clarifications step that follows, where it
 * collects a real answer or is passed. No question is ever written into the brief.
 *
 * The brief is optional — the user can proceed without either and the proposal
 * will generate intelligently from the project intent, the strongest design
 * highlights and the published evidence.
 */
export default function ClientBriefStep({
  value,
  onChange,
  steer = {},
  onSteerChange,
  projectId,
  selectedVersionIds,
  proposalType,
  engineeringSnapshot,
  versionSnapshots,
  versionsLoading,
  snapshotLoading,
  existingClarifications = [],
  onClarifications,
}) {
  return (
    <div>
      <div className="mb-6">
        <h3
          className="text-lg font-semibold text-[#1B1A1A] mb-2"
          style={{ fontFamily: 'Didact Gothic, sans-serif' }}
        >
          Client Brief &amp; Narrative Steer
        </h3>
        <p
          className="text-sm font-semibold text-[#1B1A1A] mb-1"
          style={{ fontFamily: 'Didact Gothic, sans-serif' }}
        >
          What matters most in this design, and why are you recommending this solution?
        </p>
        <p className="text-xs text-[#625143] leading-relaxed">
          Tell us about the client&apos;s priorities, practical constraints and decisions behind your
          recommendation. What have you prioritised, where have you made compromises, and why is this
          the right solution? Your words here carry more weight than any topic you steer below.
        </p>
      </div>

      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Example: Large screen, compact room with four seats, strong timbre matching, explain why the front row is the priority."
        rows={8}
        className="w-full p-4 text-sm text-[#1B1A1A] bg-white border border-[#DCDBD6] rounded-lg resize-y focus:outline-none focus:border-[#213428] focus:ring-1 focus:ring-[#213428] transition-colors"
        style={{ fontFamily: 'Inter, sans-serif', lineHeight: 1.6 }}
      />

      <AdiSuggestionChips
        projectId={projectId}
        selectedVersionIds={selectedVersionIds}
        proposalType={proposalType}
        clientBrief={value}
        engineeringSnapshot={engineeringSnapshot}
        versionSnapshots={versionSnapshots}
        versionsLoading={versionsLoading}
        snapshotLoading={snapshotLoading}
        existingClarifications={existingClarifications}
        steer={steer}
        onSteerChange={onSteerChange}
        onClarifications={onClarifications}
      />

      {/* Asked only when the project's Library holds comparison images that
          state no message of their own: the note the designer writes here is
          what the comparison page prints above both options. */}
      <ComparisonMessagePrompt projectId={projectId} />
    </div>
  );
}