import React from 'react';
import { Image as ImageIcon } from 'lucide-react';

/**
 * Live preview showing the actual future proposal cover page.
 * Updates immediately as brand colours, logo, and company name change.
 * Layout: dealer logo → cover image area with project name → footer.
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

      {/* Proposal cover page */}
      <div className="rounded-xl overflow-hidden shadow-xl flex flex-col" style={{ aspectRatio: '4 / 5' }}>
        {/* ── Header: dealer logo ── */}
        <div
          className="px-6 py-4 flex items-center"
          style={{ backgroundColor: primary, minHeight: 56 }}
        >
          {form.dealer_logo_url ? (
            <img
              src={form.dealer_logo_url}
              alt="Dealer logo"
              className="h-7 object-contain"
            />
          ) : (
            <span
              className="text-sm font-bold text-white"
              style={{ fontFamily: 'Didact Gothic, sans-serif' }}
            >
              {companyName}
            </span>
          )}
        </div>

        {/* ── Cover image area ── */}
        <div
          className="flex-1 relative flex flex-col items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`,
          }}
        >
          {/* Placeholder cover image icon */}
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <ImageIcon className="w-16 h-16 text-white" />
          </div>

          {/* Cover text overlay */}
          <div className="relative z-10 text-center px-6">
            <div
              className="text-xs uppercase tracking-[0.25em] font-semibold mb-3"
              style={{ color: accent }}
            >
              Cinema Design Proposal
            </div>
            <div
              className="text-3xl font-bold text-white leading-tight"
              style={{ fontFamily: 'Didact Gothic, sans-serif' }}
            >
              Project Name
            </div>
            <div
              className="h-1 w-16 rounded-full mx-auto mt-4"
              style={{ backgroundColor: accent }}
            />
          </div>
        </div>

        {/* ── Footer ── */}
        <div
          className="px-6 py-3 flex items-center justify-between"
          style={{ backgroundColor: secondary }}
        >
          <span className="text-xs text-white/80" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
            {companyName}
          </span>
          <span className="text-[10px] text-white/50 uppercase tracking-wider">
            Powered by Sound Proof
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

      <p className="text-xs text-[#625143] mt-3 text-center">
        Live preview of your proposal cover page.
      </p>
    </div>
  );
}