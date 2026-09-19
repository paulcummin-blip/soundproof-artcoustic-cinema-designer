import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Step 5 — Generating screen.
 * Shown while GPT writes the proposal. Takes 30-60 seconds.
 */
export default function GenerateStep({ error, onBack }) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-red-600 mb-4">{error}</p>
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm rounded-md border border-[#DCDBD6] text-[#3E4349] hover:bg-[#F5F4F0]"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <Loader2 className="w-8 h-8 text-[#213428] animate-spin mb-4" />
      <h3
        className="text-lg font-bold text-[#1B1A1A]"
        style={{ fontFamily: 'Didact Gothic, sans-serif' }}
      >
        Generating Proposal
      </h3>
      <p className="text-sm text-[#625143] mt-2">
        GPT is writing your complete proposal. This takes 30-60 seconds.
      </p>
    </div>
  );
}