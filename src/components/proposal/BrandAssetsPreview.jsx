import React from 'react';

/**
 * Live preview showing the actual future proposal cover page,
 * styled as an editorial print cover rather than a software mock-up.
 * Updates immediately as brand colours, logo, and company name change.
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
    <div className="lg:sticky lg:top-16">
      <div className="text-[11px] uppercase tracking-[0.24em] text-[#A79E8C] mb-5">
        Live Preview
      </div>

      {/* Cover page — plain warm-white sheet, minimal ink */}
      <div
        className="border border-[#E5E1D8] flex flex-col justify-between"
        style={{ aspectRatio: '3 / 4', backgroundColor: '#FBFAF7', padding: '14% 10%' }}
      >
        {/* ── Dealer mark ── */}
        <div>
          {form.dealer_logo_url ? (
            <img src={form.dealer_logo_url} alt="Dealer logo" className="h-8 object-contain" />
          ) : (
            <span
              className="text-sm tracking-wide text-[#1B1A1A]"
              style={{ fontFamily: 'Didact Gothic, sans-serif' }}
            >
              {companyName}
            </span>
          )}
        </div>

        {/* ── Title block ── */}
        <div>
          <div
            className="text-[10px] uppercase tracking-[0.28em] mb-4"
            style={{ color: accent }}
          >
            Cinema Design Proposal
          </div>
          <div
            className="text-[26px] leading-tight font-normal"
            style={{ color: primary, fontFamily: 'Didact Gothic, sans-serif' }}
          >
            Project Name
          </div>
          <div className="h-px w-14 mt-6" style={{ backgroundColor: secondary }} />
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.14em] text-[#8A8477]">
            {companyName}
          </span>
          <span className="text-[10px] uppercase tracking-[0.14em] text-[#C9C3B4]">
            Sound Proof
          </span>
        </div>
      </div>

      {/* Colour swatches */}
      <div className="flex gap-6 mt-6">
        {[
          { label: 'Primary', colour: primary },
          { label: 'Secondary', colour: secondary },
          { label: 'Accent', colour: accent },
        ].map(({ label, colour }) => (
          <div key={label} className="flex-1">
            <div className="h-8 border border-[#E5E1D8]" style={{ backgroundColor: colour }} />
            <span className="text-[10px] uppercase tracking-[0.1em] text-[#A79E8C] mt-2 block">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}