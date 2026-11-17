import React, { useMemo } from 'react';
import ComparisonMessagePrompt from '@/components/proposal/wizard/ComparisonMessagePrompt';
import { useDesignContextClarifications } from '@/components/proposal/wizard/useDesignContextClarifications';
import { validateSteeringBrief } from '@/components/proposal/wizard/steeringBriefValidation';

const FONT = { fontFamily: 'Didact Gothic, sans-serif' };

/**
 * A few optional writing aids — simple prompts, not generated answers and not
 * technical controls. They sit below the field to help a dealer start writing.
 */
const WRITING_PROMPTS = [
  'What matters most to the client?',
  'Why this speaker arrangement?',
  'What compromises have you made?',
];

/**
 * Step 4 — Project Steering Brief.
 *
 * The designer's own words about what makes this project different: the room's
 * purpose, the client's priorities and the reasons behind the design choices.
 * It is one of the most important parts of building the proposal, because it
 * guides the entire narrative and helps ADI explain why this particular cinema
 * is right for this particular client.
 *
 * The brief is required before a new proposal can be generated: a modest,
 * substantive check (not a word count, not a category questionnaire) ensures
 * some real project context has been entered. It never alters engineering
 * results, RP22 values, Design Ratings or recommendations.
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

  const validation = useMemo(() => validateSteeringBrief(value), [value]);

  return (
    <div>
      <div className="mb-6">
        <h3
          className="text-lg font-semibold text-[#1B1A1A] mb-2"
          style={FONT}
        >
          Project Steering Brief
        </h3>
        <p
          className="text-base text-[#213428] font-medium mb-4 leading-relaxed"
          style={FONT}
        >
          Tell ADI what makes this project different.
        </p>
        <div className="space-y-3 text-sm text-[#3E4349] leading-relaxed">
          <p>
            ADI already understands your room design, loudspeaker specification and engineering results.
            What it needs from you is the project's purpose, the client's priorities and the reasons
            behind your design choices.
          </p>
          <p>
            This is one of the most important parts of building your proposal. Your brief guides the
            entire narrative, helping ADI explain why this particular cinema is right for this
            particular client.
          </p>
        </div>
      </div>

      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Describe how the room will be used, what matters most to the client, any important design decisions, practical compromises or particular benefits you want the proposal to explain. A few meaningful sentences are enough."
        rows={8}
        className="w-full p-4 text-sm text-[#1B1A1A] bg-white border border-[#DCDBD6] rounded-lg resize-y focus:outline-none focus:border-[#213428] focus:ring-1 focus:ring-[#213428] transition-colors"
        style={{ fontFamily: 'Inter, sans-serif', lineHeight: 1.6 }}
      />

      <p className="mt-3 text-xs text-[#625143] leading-relaxed" style={FONT}>
        Describe how the room will be used, what matters most to the client, any important design
        decisions, practical compromises or particular benefits you want the proposal to explain.
        A few meaningful sentences are enough.
      </p>

      {!validation.valid && (
        <p role="alert" className="mt-3 text-sm text-[#7A2E10] leading-relaxed" style={FONT}>
          {validation.reason}
        </p>
      )}

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