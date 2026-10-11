/**
 * ComparisonPagesPreview
 * ----------------------
 * The editor preview of each comparison group's own page, composed from the SAME
 * plan the printed pack reads — so the preview and the PDF show the same page,
 * with the same message and the same options in the same order.
 *
 * It previews exactly what prints: the group's name as the page title, the
 * designer's own message above the images, and each option full width beneath,
 * captioned with what it stands for. Presentation only.
 */

import React from 'react';
import ComparisonOptionsPage from '@/components/proposal/print/ComparisonOptionsPage';

export default function ComparisonPagesPreview({ groups = [], roleStyle = null, validatedCopy = '' }) {
  const list = Array.isArray(groups) ? groups : [];
  if (list.length === 0) return null;

  return (
    <>
      {list.map((group) => (
        <div key={group.id} className="mb-12 border-t border-dashed border-[#DCDBD6] pt-8">
          <h2
            className="proposal-section-title text-[#1B1A1A] mb-4"
            style={roleStyle ? roleStyle('header') : undefined}
          >
            {group.title}
          </h2>
          <div className="rounded-xl overflow-hidden border border-[#DCDBD6] p-6">
            <ComparisonOptionsPage
              title={group.title}
              validatedCopy={validatedCopy}
              placements={group.placements}
              showHeader={false}
            />
          </div>
        </div>
      ))}
    </>
  );
}