import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Step 5 — the generation states.
 *
 * Generation is four separate things and the designer is told which one is
 * happening: preparing the proposal, writing its sections, opening the editor
 * and ready. Nothing here is a dead end: a failure states its reason and offers
 * the two things that can follow it — retry the generation, or go back.
 */

export const GENERATION_PHASE = Object.freeze({
  PREPARING: 'Generating proposal',
  WRITING: 'Writing sections',
  OPENING: 'Opening editor',
  READY: 'Proposal ready',
  FAILED: 'Generation failed',
});

/** The line shown under each phase, in the designer's terms. */
const PHASE_DETAIL = Object.freeze({
  [GENERATION_PHASE.PREPARING]: 'Sound Proof is assembling the frozen engineering evidence for every selected version.',
  [GENERATION_PHASE.WRITING]: 'Sound Proof is writing the report sections. This takes 30-60 seconds.',
  [GENERATION_PHASE.OPENING]: 'The proposal is saved. Checking that every section is present before opening the editor.',
  [GENERATION_PHASE.READY]: 'The proposal is complete. Opening the editor.',
  [GENERATION_PHASE.FAILED]: 'The proposal was not generated. Nothing was saved — retry when you are ready.',
});

const STEPS = [
  GENERATION_PHASE.PREPARING,
  GENERATION_PHASE.WRITING,
  GENERATION_PHASE.OPENING,
  GENERATION_PHASE.READY,
];

export default function GenerateStep({ phase = GENERATION_PHASE.PREPARING, error, onRetry, onBack, backLabel = 'Back to Proposal Centre' }) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h3
          className="text-xl font-normal text-[#1A1A1A] tracking-tight"
          style={{ fontFamily: 'Didact Gothic, sans-serif' }}
        >
          {GENERATION_PHASE.FAILED}
        </h3>
        <p role="alert" className="text-sm text-[#8A3A3A] mt-3 mb-2 max-w-md">{error}</p>
        <p className="text-sm text-[#8A8477] mb-8 max-w-md">{PHASE_DETAIL[GENERATION_PHASE.FAILED]}</p>
        <div className="flex items-center gap-4">
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-6 py-2.5 text-xs uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#3E4349]"
              style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
            >
              Retry Generate Proposal
            </button>
          )}
          <button
            onClick={onBack}
            className="px-5 py-2.5 text-xs uppercase tracking-[0.14em] text-[#625143] hover:text-[#1A1A1A] transition-colors"
          >
            {backLabel}
          </button>
        </div>
      </div>
    );
  }

  const activeIndex = Math.max(0, STEPS.indexOf(phase));

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Loader2 className="w-5 h-5 text-[#213428] animate-spin mb-6" />
      <h3
        className="text-xl font-normal text-[#1A1A1A] tracking-tight"
        style={{ fontFamily: 'Didact Gothic, sans-serif' }}
      >
        {phase}
      </h3>
      <p className="text-sm text-[#8A8477] mt-3 max-w-md">{PHASE_DETAIL[phase] || PHASE_DETAIL[GENERATION_PHASE.PREPARING]}</p>
      <ol className="mt-8 space-y-2 text-left">
        {STEPS.map((step, index) => (
          <li
            key={step}
            className={`text-xs uppercase tracking-[0.14em] ${index <= activeIndex ? 'text-[#213428]' : 'text-[#C3BCA9]'}`}
          >
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}