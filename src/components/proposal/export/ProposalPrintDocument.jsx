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
import ProposalCoverPage from '@/components/proposal/cover/ProposalCoverPage';

export default function ProposalPrintDocument({
  proposal,
  projectName,
  clientName,
  coverImageUrl,
  heroImageUrl,
  logoUrl,
  sections,
}) {
  if (typeof document === 'undefined') return null;

  const enabled = (sections || []).filter((section) => section.is_enabled !== false);
  // The cover section record carries no body — the cover is composed here.
  const contentSections = enabled.filter((section) => section.section_type !== 'cover');

  return createPortal(
    <div className="proposal-print-portal">
      <div className="proposal-print-cover">
        <ProposalCoverPage
          title={proposal?.title || projectName}
          clientName={clientName}
          coverImageUrl={coverImageUrl}
          heroImageUrl={heroImageUrl}
          logoUrl={logoUrl}
          generatedDate={proposal?.proposal_date || proposal?.created_date}
        />
      </div>

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