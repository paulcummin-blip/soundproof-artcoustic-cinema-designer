import React, { useState } from 'react';

/**
 * PublicationPreview — a miniature multi-page publication preview.
 *
 * Replaces the former cover-only preview. Displays a stack of simplified
 * page thumbnails of a System Design report so the user immediately
 * understands they are configuring a professional publishing system, not just
 * a cover.
 *
 * The publication title is dynamic — a small selector lets the dealer see how
 * the cover reads for each report type (System Design Summary, System Design
 * Comparison, Technical Design Report).
 *
 * Brand colours are demonstrated naturally through the page elements
 * (headings, accent rules, labels) rather than displayed as separate swatches.
 *
 * Props:
 * - form: the brand assets form state object
 */
const PUBLICATION_TYPES = [
  { key: 'system_summary', label: 'System Design Summary' },
  { key: 'comparison', label: 'System Design Comparison' },
  { key: 'technical_report', label: 'Technical Design Report' },
];

// Both report types use the same report structure. The difference is one
// version (summary) versus two or more versions (comparison).
const REPORT_PAGES = [
  'cover',
  'system_design_summary',
  'spatial_resolution',
  'dynamic_range',
  'timbre_matching',
  'key_performance_highlights',
  'overall_design',
  'room_images',
];

const PAGE_SETS = {
  system_summary: REPORT_PAGES,
  comparison: REPORT_PAGES,
  technical_report: ['cover', 'project_overview', 'performance', 'technical_appendix'],
};

const PAGE_LABELS = {
  cover: 'Cover',
  system_design_summary: 'System Design Summary',
  spatial_resolution: 'Spatial Resolution',
  dynamic_range: 'Dynamic Range',
  timbre_matching: 'Timbre Matching',
  key_performance_highlights: 'Key Performance Highlights',
  overall_design: 'Overall Design',
  room_images: 'Project Images',
  project_overview: 'Project Overview',
  performance: 'Performance',
  technical_appendix: 'Technical Appendix',
};

const FONT = "'Didact Gothic', sans-serif";

function TextLines({ widths = ['100%', '92%', '96%', '70%'], color = '#E5E1D8', gap = '8%' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {widths.map((w, i) => (
        <div key={i} style={{ height: 2, width: w, backgroundColor: color }} />
      ))}
    </div>
  );
}

function PageLabel({ children }) {
  return (
    <div
      className="text-[9px] uppercase tracking-[0.18em] text-[#A79E8C] mt-2.5 text-center"
      style={{ fontFamily: FONT }}
    >
      {children}
    </div>
  );
}

function PageThumb({ label, children, bg = '#FBFAF7' }) {
  return (
    <div>
      <div
        className="shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        style={{ aspectRatio: '3 / 4', backgroundColor: bg, padding: '11% 10%' }}
      >
        {children}
      </div>
      <PageLabel>{label}</PageLabel>
    </div>
  );
}

function renderPage(pageKey, form, pubLabel) {
  const primary = form.primary_colour || '#213428';
  const secondary = form.secondary_colour || '#3E4349';
  const accent = form.accent_colour || '#625143';
  const companyName = form.company_name || 'Your Company Name';
  const lineColor = '#E5E1D8';
  const softBlock = '#F2EFE8';

  switch (pageKey) {
    case 'cover':
      return (
        <div className="flex flex-col justify-between h-full">
          <div>
            {form.dealer_logo_url ? (
              <img src={form.dealer_logo_url} alt="Dealer logo" className="h-6 object-contain" />
            ) : (
              <span className="text-[11px] tracking-wide text-[#1B1A1A]" style={{ fontFamily: FONT }}>
                {companyName}
              </span>
            )}
          </div>
          <div>
            <div className="text-[8px] uppercase tracking-[0.24em] mb-3" style={{ color: accent, fontFamily: FONT }}>
              {pubLabel}
            </div>
            <div className="text-[19px] leading-tight" style={{ color: primary, fontFamily: FONT }}>
              Project Name
            </div>
            <div className="h-px w-10 mt-4" style={{ backgroundColor: secondary }} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[8px] uppercase tracking-[0.12em] text-[#8A8477]" style={{ fontFamily: FONT }}>
              {companyName}
            </span>
            <span className="text-[8px] uppercase tracking-[0.12em] text-[#C9C3B4]" style={{ fontFamily: FONT }}>
              Sound Proof
            </span>
          </div>
        </div>
      );

    case 'system_design_summary':
      return (
        <div className="flex flex-col h-full">
          <div className="text-[8px] uppercase tracking-[0.18em] text-[#C9C3B4] mb-6" style={{ fontFamily: FONT }}>
            01
          </div>
          <div className="text-[13px] mb-3" style={{ color: primary, fontFamily: FONT }}>
            {PAGE_LABELS[pageKey]}
          </div>
          <div className="h-px w-8 mb-5" style={{ backgroundColor: accent }} />
          <TextLines widths={['100%', '94%', '88%', '60%']} />
          <div className="mt-auto">
            <TextLines widths={['40%']} color={lineColor} />
          </div>
        </div>
      );

    case 'spatial_resolution':
    case 'dynamic_range':
    case 'timbre_matching':
    case 'overall_design':
    case 'project_overview':
      return (
        <div className="flex flex-col h-full">
          <div className="text-[8px] uppercase tracking-[0.18em] text-[#C9C3B4] mb-6" style={{ fontFamily: FONT }}>
            02
          </div>
          <div className="text-[13px] mb-3" style={{ color: primary, fontFamily: FONT }}>
            {PAGE_LABELS[pageKey]}
          </div>
          <div className="h-px w-8 mb-5" style={{ backgroundColor: accent }} />
          <div className="mb-4" style={{ height: '38%', backgroundColor: softBlock }} />
          <TextLines widths={['90%', '78%']} />
        </div>
      );

    case 'performance':
      return (
        <div className="flex flex-col h-full">
          <div className="text-[8px] uppercase tracking-[0.18em] text-[#C9C3B4] mb-6" style={{ fontFamily: FONT }}>
            03
          </div>
          <div className="text-[13px] mb-3" style={{ color: primary, fontFamily: FONT }}>
            Performance
          </div>
          <div className="h-px w-8 mb-5" style={{ backgroundColor: accent }} />
          <div className="flex items-end gap-1.5 mb-4" style={{ height: '40%' }}>
            {[40, 65, 50, 80, 60, 90, 70].map((h, i) => (
              <div
                key={i}
                style={{ flex: 1, height: `${h}%`, backgroundColor: i === 5 ? accent : secondary, opacity: i === 5 ? 1 : 0.55 }}
              />
            ))}
          </div>
          <TextLines widths={['80%', '55%']} />
        </div>
      );

    case 'key_performance_highlights':
      return (
        <div className="flex flex-col h-full">
          <div className="text-[8px] uppercase tracking-[0.18em] text-[#C9C3B4] mb-6" style={{ fontFamily: FONT }}>
            05
          </div>
          <div className="text-[13px] mb-3" style={{ color: primary, fontFamily: FONT }}>
            {PAGE_LABELS[pageKey]}
          </div>
          <div className="h-px w-8 mb-5" style={{ backgroundColor: accent }} />
          {[0, 1].map((row) => (
            <div key={row} className="flex gap-3 mb-4">
              <div style={{ width: '30%', aspectRatio: '1', backgroundColor: softBlock }} />
              <div className="flex-1 flex flex-col justify-center gap-2">
                <div style={{ height: 2, width: '70%', backgroundColor: secondary }} />
                <TextLines widths={['90%', '60%']} gap="6%" />
              </div>
            </div>
          ))}
        </div>
      );

    case 'room_images':
      return (
        <div className="flex flex-col h-full">
          <div className="text-[8px] uppercase tracking-[0.18em] text-[#C9C3B4] mb-6" style={{ fontFamily: FONT }}>
            07
          </div>
          <div className="text-[13px] mb-3" style={{ color: primary, fontFamily: FONT }}>
            {PAGE_LABELS[pageKey]}
          </div>
          <div className="h-px w-8 mb-5" style={{ backgroundColor: accent }} />
          <div className="mb-3" style={{ height: '34%', backgroundColor: softBlock }} />
          <TextLines widths={['92%', '64%']} />
        </div>
      );

    case 'technical_appendix':
      return (
        <div className="flex flex-col h-full">
          <div className="text-[8px] uppercase tracking-[0.18em] text-[#C9C3B4] mb-6" style={{ fontFamily: FONT }}>
            04
          </div>
          <div className="text-[13px] mb-3" style={{ color: primary, fontFamily: FONT }}>
            Technical Appendix
          </div>
          <div className="h-px w-8 mb-5" style={{ backgroundColor: accent }} />
          <div className="mb-4" style={{ height: '30%', backgroundColor: softBlock }} />
          <TextLines widths={['95%', '88%', '72%']} />
        </div>
      );

    default:
      return null;
  }
}

export default function PublicationPreview({ form }) {
  const [pubType, setPubType] = useState('system_summary');
  const pubLabel = PUBLICATION_TYPES.find((p) => p.key === pubType).label;
  const pages = PAGE_SETS[pubType];

  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.24em] text-[#A79E8C] mb-4" style={{ fontFamily: FONT }}>
        Publication Preview
      </div>

      {/* Publication type selector */}
      <div className="mb-8">
        <select
          value={pubType}
          onChange={(e) => setPubType(e.target.value)}
          className="w-full bg-transparent border-0 border-b border-[#E5E1D8] text-[12px] text-[#1B1A1A] pb-2 focus:outline-none focus:border-[#213428] cursor-pointer"
          style={{ fontFamily: FONT }}
        >
          {PUBLICATION_TYPES.map(({ key, label }) => (
            <option key={key} value={key} className="bg-white">
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Multi-page thumbnail stack */}
      <div className="flex flex-col gap-7">
        {pages.map((pageKey) => (
          <PageThumb key={pageKey} label={PAGE_LABELS[pageKey]}>
            {renderPage(pageKey, form, pubLabel)}
          </PageThumb>
        ))}
      </div>
    </div>
  );
}