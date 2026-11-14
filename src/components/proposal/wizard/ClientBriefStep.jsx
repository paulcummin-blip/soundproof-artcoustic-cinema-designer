import React from 'react';
import ComparisonMessagePrompt from '@/components/proposal/wizard/ComparisonMessagePrompt';
import { useDesignContextClarifications } from '@/components/proposal/wizard/useDesignContextClarifications';

const FONT = { fontFamily: 'Didact Gothic, sans-serif' };

/**
 * Three optional writing aids — simple prompts, not generated answers and not
 * technical controls. They sit below the field to help a dealer start writing.
 */
const WRITING_PROMPTS = [
  'What matters most to the client?',
  'Why this speaker arrangement?',
  'What compromises have you made?',
];

/**
 * Step 4 — Design Context.
 *
 * The designer's own words about what matters in this design and why they are
 * recommending it. It is the strongest narrative authority in the document: it
 * guides wording and emphasis, and it NEVER alters engineering results, RP22
 * values, Design Ratings or recommendations.
 *
 * The field is optional — the user can proceed without it and the proposal will
 * generate intelligently from the project intent, the strongest design
 * highlights and the published evidence.
 *
 * Anything ADI cannot explain from the evidence — a design decision with no
 * reason on record — is asked about on the Clarifications step that follows,
 * where it collects a real answer or is passed. No question is ever written
 * into the brief.
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
  existingClarifications = [],
  onClarifications,
}) {
  // The clarification questions ADI asks about this design are still fetched
  // from the same evidence the suggestion chips read. The chip UI is gone; the
  // questions are preserved so the Clarify step still works.
  useDesignContextClarifications({
    projectId,
    selectedVersionIds,
    proposalType,
    engineeringSnapshot,
    versionSnapshots,
    versionsLoading,
    snapshotLoading,
    clientBrief: value,
    existingClarifications,
    onClarifications,
  });

  return (
    <div>
      <div className="mb-6">
        <h3
          className="text-lg font-semibold text-[#1B1A1A] mb-3"
          style={FONT}
        >
          Design Context
        </h3>
        <p className="text-sm text-[#625143] leading-relaxed">
          Tell ADI anything that will help explain this design to your client. What's important,
          why you've made particular choices, or what you'd like the proposal to focus on.
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

      <div className="mt-6">
        <p className="text-[11px] uppercase tracking-[0.12em] text-[#A79E8C] mb-3" style={FONT}>
          Writing prompts
        </p>
        <ul className="space-y-2">
          {WRITING_PROMPTS.map((prompt) => (
            <li
              key={prompt}
              className="flex items-start gap-2.5 text-sm text-[#625143] leading-relaxed"
              style={FONT}
            >
              <span className="text-[#A79E8C] mt-0.5 select-none">•</span>
              <span>{prompt}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Asked only when the project's Library holds comparison images that
          state no message of their own: the note the designer writes here is
          what the comparison page prints above both options. */}
      <ComparisonMessagePrompt projectId={projectId} />
    </div>
  );
}