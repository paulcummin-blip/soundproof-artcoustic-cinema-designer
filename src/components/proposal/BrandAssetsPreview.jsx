import React from 'react';

/**
 * Live preview placeholder showing brand colours on a mock proposal cover.
 * Updates immediately as the form changes — no proposal generation, just
 * a visual indicator of how brand colours will look on a proposal.
 *
 * Props:
 * - form: the brand assets form state object
 */
export default function BrandAssetsPreview({ form }) {
  const primary = form.primary_colour || '#213428';
  const secondary = form.secondary_colour || '#3E4349';
  const accent = form.accent_colour || '#625143';
  const companyName = form.company_name || 'Your Company Name';

  return (
    <div className="lg:sticky lg:top-6">
      <h3 className="text-sm font-semibold text-[#3E4349] mb-3">Live Preview</h3>

      {/* Mock proposal cover */}
      <div className="rounded-xl overflow-hidden shadow-xl" style={{ backgroundColor: primary }}>
        <div className="p-8" style={{ minHeight: 420 }}>
          {form.dealer_logo_url ? (
            <img
              src={form.dealer_logo_url}
              alt="Dealer logo"
              className="h-12 object-contain mb-8"
            />
          ) : (
            <div className="h-12 mb-8 flex items-center">
              <span
                className="text-lg font-bold text-white"
                style={{ fontFamily: 'Didact Gothic, sans-serif' }}
              >
                {companyName}
              </span>
            </div>
          )}

          <div className="space-y-3">
            <div
              className="text-xs uppercase tracking-[0.2em] font-semibold"
              style={{ color: accent }}
            >
              Proposal
            </div>
            <div
              className="text-3xl font-bold text-white leading-tight"
              style={{ fontFamily: 'Didact Gothic, sans-serif' }}
            >
              Cinema Design
            </div>
            <div className="h-1 w-16 rounded-full" style={{ backgroundColor: accent }} />
            <div className="text-sm text-white/70 mt-6">
              Prepared for Client Name
            </div>
          </div>
        </div>

        {/* Footer bar */}
        <div
          className="px-8 py-4 flex items-center justify-between"
          style={{ backgroundColor: secondary }}
        >
          <span className="text-xs text-white/80">
            {form.email || 'contact@example.com'}
          </span>
          <span className="text-xs text-white/80">
            {form.telephone || '—'}
          </span>
        </div>
      </div>

      {/* Colour swatches */}
      <div className="flex gap-2 mt-4">
        <div className="flex-1 text-center">
          <div
            className="h-10 rounded-md border border-[#DCDBD6]"
            style={{ backgroundColor: primary }}
          />
          <span className="text-[10px] text-[#625143] mt-1 block">Primary</span>
        </div>
        <div className="flex-1 text-center">
          <div
            className="h-10 rounded-md border border-[#DCDBD6]"
            style={{ backgroundColor: secondary }}
          />
          <span className="text-[10px] text-[#625143] mt-1 block">Secondary</span>
        </div>
        <div className="flex-1 text-center">
          <div
            className="h-10 rounded-md border border-[#DCDBD6]"
            style={{ backgroundColor: accent }}
          />
          <span className="text-[10px] text-[#625143] mt-1 block">Accent</span>
        </div>
      </div>

      <p className="text-xs text-[#625143] mt-4 text-center">
        Preview shows brand colours on a sample proposal cover.
      </p>
    </div>
  );
}