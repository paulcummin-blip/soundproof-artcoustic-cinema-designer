import React from 'react';
import AdiSuggestionChips from '@/components/proposal/wizard/AdiSuggestionChips';
import ComparisonMessagePrompt from '@/components/proposal/wizard/ComparisonMessagePrompt';
import { appendSelectedPrompts } from '@/components/proposal/wizard/clientBriefChips';

/**
 * Step 4 — Client Brief & Narrative Focus.
 *
 * Replaces the legacy Narrative Goal selector with a free-text briefing
 * area. The brief guides the narrative emphasis, wording, and structure
 * of the generated proposal. It NEVER alters engineering results, RP22
 * values, Design Ratings, or recommendations.
 *
 * Suggestions under the brief are ADI-generated from this project's
 * calculated design results (see AdiSuggestionChips). When two or more versions
 * are selected, the suggestions compare those versions and are read from each
 * selected version's own frozen snapshot.
 *
 * The brief is optional — the user can proceed without it and the report
 * will generate with a default professional narrative.
 *
 * Example chips are multi-select: the user marks several, then adds them all at
 * once. Until then the brief is untouched.
 */
export default function ClientBriefStep({
  value,
  onChange,
  projectId,
  selectedVersionIds,
  proposalType,
  engineeringSnapshot,
  versionSnapshots,
  versionsLoading,
  snapshotLoading,
}) {
  // The confirmed chip prompts are inserted together, as bullets, and a prompt
  // the brief already contains is never added again. Returns what was added and
  // what was already there so the chips can say so.
  const handleAddSelected = (examples) => {
    const result = appendSelectedPrompts(value, examples);
    if (result.added.length > 0) onChange(result.next);
    return result;
  };

  return (
    <div>
      <div className="mb-6">
        <h3
          className="text-lg font-semibold text-[#1B1A1A] mb-2"
          style={{ fontFamily: 'Didact Gothic, sans-serif' }}
        >
          Client Brief &amp; Narrative Focus
        </h3>
        <p className="text-xs text-[#625143] leading-relaxed">
          What would you like this proposal to emphasise?
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
        onAddSelected={handleAddSelected}
      />

      {/* Asked only when the project's Library holds comparison images that
          state no message of their own: the note the designer writes here is
          what the comparison page prints above both options. */}
      <ComparisonMessagePrompt projectId={projectId} />
    </div>
  );
}