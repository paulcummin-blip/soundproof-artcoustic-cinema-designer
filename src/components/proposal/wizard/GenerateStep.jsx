import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Step 5 — Generating screen.
 * Shown while GPT writes the proposal. Takes 30-60 seconds.
 */
export default function GenerateStep({ error, onBack }) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm text-[#8A3A3A] mb-6 max-w-sm">{error}</p>
        <button
          onClick={onBack}
          className="px-5 py-2.5 text-xs uppercase tracking-[0.14em] text-[#625143] hover:text-[#1B1A1A] transition-colors"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Loader2 className="w-5 h-5 text-[#213428] animate-spin mb-6" />
      <h3
        className="text-xl font-normal text-[#1B1A1A] tracking-tight"
        style={{ fontFamily: 'Didact Gothic, sans-serif' }}
      >
        Generating Proposal
      </h3>
      <p className="text-sm text-[#8A8477] mt-3">
        Sound Proof is generating your complete proposal. This takes 30-60 seconds.
      </p>
    </div>
  );
}