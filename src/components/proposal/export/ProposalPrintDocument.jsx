/**
 * ProposalPrintDocument
 * ---------------------
 * The print-only composition of a full proposal: a branded cover followed by
 * every enabled section as flow content.
 *
 * Portalled directly to <body> so the export stylesheet can hide the entire
 * application shell and print this document alone. Mounted for the lifetime
 * of the editor so export never races a render.
 *
 * Content is read verbatim from the stored ProposalSection records — this
 * component never generates, rewrites, or reorders proposal copy.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { LOGO_URL } from '@/components/report/ReportCover';

function formatIssuedDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export default function ProposalPrintDocument({
  proposal,
  projectName,
  clientName,
  dealerCompanyName,
  sections,
  typeLabel,
}) {
  if (typeof document === 'undefined') return null;

  const enabled = (sections || []).filter((section) => section.is_enabled !== false);
  // The cover section record carries no body — the cover is composed here.
  const contentSections = enabled.filter((section) => section.section_type !== 'cover');

  const metaLine = [
    clientName ? `Prepared for ${clientName}` : null,
    dealerCompanyName || null,
    formatIssuedDate(proposal?.proposal_date || proposal?.created_date),
  ]
    .filter(Boolean)
    .join('  ·  ');

  return createPortal(
    <div className="proposal-print-portal">
      <header className="proposal-print-cover">
        <img className="proposal-print-cover__logo" src={LOGO_URL} alt="Sound Proof" />
        <div className="proposal-print-cover__kicker">
          Professional Home Cinema Engineering
        </div>
        <div className="proposal-print-cover__adi">
          Powered by Artcoustic Design Intelligence (ADI)
        </div>
        <div className="proposal-print-cover__rule" />
        <h1 className="proposal-print-cover__title">
          {proposal?.title || projectName || 'Cinema Design Proposal'}
        </h1>
        <div className="proposal-print-cover__type">{typeLabel}</div>
        {metaLine && <div className="proposal-print-cover__meta">{metaLine}</div>}
      </header>

      {contentSections.map((section) => (
        <section key={section.id} className="proposal-print-section">
          <h2 className="proposal-print-section__title">{section.title}</h2>
          <div
            className="proposal-print-section__body"
            dangerouslySetInnerHTML={{ __html: section.body || '' }}
          />
        </section>
      ))}
    </div>,
    document.body
  );
}