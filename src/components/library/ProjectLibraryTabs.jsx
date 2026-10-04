/**
 * ProjectLibraryTabs
 * ------------------
 * The Project Library's own section tabs: Images, Generated Reports, Proposals.
 *
 * Phase 1 shows exactly these three. Drawings / CAD and Documents are not shown
 * as empty tabs — they arrive when there is real content to put in them.
 *
 * Presentation only.
 */

import React from 'react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';

export const PROJECT_LIBRARY_TAB = Object.freeze({
  IMAGES: 'images',
  REPORTS: 'reports',
  PROPOSALS: 'proposals',
});

const TABS = [
  { key: PROJECT_LIBRARY_TAB.IMAGES, label: 'Images' },
  { key: PROJECT_LIBRARY_TAB.REPORTS, label: 'Generated Reports' },
  { key: PROJECT_LIBRARY_TAB.PROPOSALS, label: 'Proposals' },
];

export default function ProjectLibraryTabs({ active, onChange }) {
  return (
    <div className="flex gap-10 border-b border-[#E5E1D8] mb-10">
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`relative pb-4 text-[13px] uppercase tracking-[0.12em] transition-colors ${
            active === key ? 'text-[#1B1A1A]' : 'text-[#A79E8C] hover:text-[#625143]'
          }`}
          style={{ fontFamily: REPORT_FONT_BODY }}
        >
          {label}
          {active === key && (
            <span className="absolute left-0 right-0 -bottom-px h-[2px]" style={{ backgroundColor: '#213428' }} />
          )}
        </button>
      ))}
    </div>
  );
}