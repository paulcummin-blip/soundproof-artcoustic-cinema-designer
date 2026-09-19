import React from 'react';
import { Lightbulb } from 'lucide-react';

/**
 * Step 4 — Client Brief & Narrative Focus.
 *
 * Replaces the legacy Narrative Goal selector with a free-text briefing
 * area. The brief guides the narrative emphasis, wording, and structure
 * of the generated proposal. It NEVER alters engineering results, RP22
 * values, Design Ratings, or recommendations.
 *
 * The brief is optional — the user can proceed without it and the report
 * will generate with a default professional narrative.
 */
const EXAMPLES = [
  'Dynamic impact',
  'Dialogue clarity',
  'Family friendly',
  'Music performance',
  'Future upgrade path',
  'Architectural constraints',
  'Budget conscious',
  'Hidden loudspeakers',
  'Invisible installation',
  'Interior design',
  'Acoustic treatment benefits',
  'Windows limited surround placement',
  'Client prefers reference cinema',
  'Client dislikes visible equipment',
  'Explain compromises',
  'Explain why Level 4 is not achievable',
  'Highlight future expansion',
];

export default function ClientBriefStep({ value, onChange }) {
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
        placeholder="e.g. The client is passionate about music and wants invisible loudspeakers. Emphasise timbre matching, controlled dispersion, and architectural integration."
        rows={8}
        className="w-full p-4 text-sm text-[#1B1A1A] bg-white border border-[#DCDBD6] rounded-lg resize-y focus:outline-none focus:border-[#213428] focus:ring-1 focus:ring-[#213428] transition-colors"
        style={{ fontFamily: 'Inter, sans-serif', lineHeight: 1.6 }}
      />

      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="w-3.5 h-3.5 text-[#A79E8C]" />
          <span className="text-[11px] uppercase tracking-[0.12em] text-[#A79E8C]">
            Examples — click to add
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => handleExampleClick(example)}
              className="px-3 py-1.5 text-xs text-[#3E4349] bg-[#F5F4F0] border border-[#E5E1D8] rounded-full hover:bg-[#213428] hover:text-white hover:border-[#213428] transition-colors"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

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