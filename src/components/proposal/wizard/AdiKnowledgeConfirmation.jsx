import React from 'react';
import { Sparkles } from 'lucide-react';

/**
 * AdiKnowledgeConfirmation
 * ------------------------
 * THE LIGHTWEIGHT CONFIRMATION ADI OFFERS INSTEAD OF ASKING AGAIN.
 *
 * Why it exists: where ADI understands a decision well enough to state it but not
 * well enough to rely on it, the designer is shown what ADI understands and asked to
 * confirm it. Two actions only — USE THIS accepts it for this project, EXPLAIN
 * DIFFERENTLY opens the normal answer box — so the full clarification form is never
 * forced on a designer for something ADI already half knows.
 *
 * The wording shown is design intent in the design's own voice. Nothing about how it
 * was understood is ever displayed here.
 */
export default function AdiKnowledgeConfirmation({
  confirmation = null,
  onUse,
  onExplain,
}) {
  if (!confirmation?.confirmation) return null;

  return (
    <div className="rounded-lg border border-[#E5E1D8] bg-[#F9F8F5] p-4">
      <div className="flex items-start gap-2 mb-3">
        <Sparkles className="w-4 h-4 mt-0.5 text-[#A79E8C]" />
        <p className="text-sm text-[#1B1A1A] leading-relaxed">
          {confirmation.confirmation}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onUse?.(confirmation)}
          className="rounded-md border border-[#213428] bg-[#213428] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#2C4435]"
          style={{ fontFamily: 'Didact Gothic, sans-serif' }}
        >
          Use this
        </button>
        <button
          type="button"
          onClick={() => onExplain?.(confirmation)}
          className="rounded-md border border-[#D9D5CE] bg-white px-3 py-1.5 text-xs font-semibold text-[#3E4349] transition-colors hover:border-[#213428]"
          style={{ fontFamily: 'Didact Gothic, sans-serif' }}
        >
          Explain differently
        </button>
      </div>
    </div>
  );
}