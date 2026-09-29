import React from 'react';
import AdiSuggestionChips from '@/components/proposal/wizard/AdiSuggestionChips';

/**
 * Step 4 — Client Brief & Narrative Focus.
 *
 * Replaces the legacy Narrative Goal selector with a free-text briefing
 * area. The brief guides the narrative emphasis, wording, and structure
 * of the generated proposal. It NEVER alters engineering results, RP22
 * values, Design Ratings, or recommendations.
 *
 * Suggestions under the brief are ADI-generated from this project's
 * calculated design results (see AdiSuggestionChips).
 *
 * The brief is optional — the user can proceed without it and the report
 * will generate with a default professional narrative.
 */
export default function ClientBriefStep({
  value,
  onChange,
  projectId,
  selectedVersionIds,
  proposalType,
  engineeringSnapshot,
  snapshotLoading,
}) {
  const handleExampleClick = (example) => {
    const current = (value || '').trim();
    const prefix = current && !current.endsWith('\n') ? '\n' : '';
    const next = current ? `${current}${prefix}• ${example}` : `• ${example}`;
    onChange(next);
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
          Describe anything you would like the report to emphasise. These notes guide the
          narrative only and never alter the engineering results.
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
        engineeringSnapshot={engineeringSnapshot}
        snapshotLoading={snapshotLoading}
        onAdd={handleExampleClick}
      />

      <div className="mt-6 p-3 bg-[#F5F4F0] border-l-2 border-[#213428] rounded-r">
        <p className="text-[11px] text-[#625143] leading-relaxed">
          <strong className="text-[#213428]">Note:</strong> The Client Brief influences the
          wording and emphasis of the report. It must never change any engineering result,
          RP22 value, Design Rating, or recommendation.
        </p>
      </div>
    </div>
  );
}