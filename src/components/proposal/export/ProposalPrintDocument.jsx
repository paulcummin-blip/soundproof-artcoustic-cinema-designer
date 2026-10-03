/**
 * ProposalPrintDocument
 * ---------------------
 * The print-only composition of a full client design report: a branded,
 * full-bleed cover followed by every enabled section as flow content.
 *
 * Portalled directly to <body> so the export stylesheet can hide the entire
 * application shell and print this document alone. Mounted for the lifetime
 * of the editor so export never races a render.
 *
 * Structure rules, all presentation:
 *   - the report's own section set is the structure authority: exactly one
 *     block per section type, in report order. A duplicated or legacy section
 *     (a second Key Performance Highlights, a leftover Performance Summary)
 *     can therefore never print.
 *   - each section heading prints once (sectionBodyAuthority drops a body that
 *     repeats its own title).
 *   - Key Performance Highlights prints as its short introduction plus the one
 *     calculated table.
 *   - Project Images prints uploaded images only, never generated copy.
 *
 * Content is read verbatim from the stored ProposalSection records — this
 * component never generates, rewrites, or reorders proposal copy.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import ProposalCoverPage from '@/components/proposal/cover/ProposalCoverPage';
import KeyPerformanceHighlightsTable from '@/components/proposal/KeyPerformanceHighlightsTable';
import ProjectImagesBlock from '@/components/proposal/ProjectImagesBlock';
import { getSectionsForProposalType } from '@/components/proposal/proposalSections';
import { prepareSectionBody } from '@/components/proposal/sectionBodyAuthority';

export default function ProposalPrintDocument({
  proposal,
  projectName,
  dealerName,
  projectReference,
  coverImageUrl,
  heroImageUrl,
  logoUrl,
  sections,
  projectImages = [],
}) {
  if (typeof document === 'undefined') return null;

  const enabled = (sections || []).filter((section) => section.is_enabled !== false);
  // One block per section type: the first stored section of a type wins, so a
  // report can never print the same section twice.
  const byType = new Map();
  enabled.forEach((section) => {
    if (!byType.has(section.section_type)) byType.set(section.section_type, section);
  });
  const contentSections = getSectionsForProposalType(proposal?.proposal_type)
    .filter((def) => def.type !== 'cover')
    .map((def) => ({ def, section: byType.get(def.type) }))
    .filter(({ section }) => Boolean(section));

  return createPortal(
    <div className="proposal-print-portal">
      <div className="proposal-print-cover">
        <ProposalCoverPage
          projectName={projectName}
          dealerName={dealerName}
          projectReference={projectReference}
          coverImageUrl={coverImageUrl}
          heroImageUrl={heroImageUrl}
          logoUrl={logoUrl}
          generatedDate={proposal?.proposal_date || proposal?.created_date}
        />
      </div>

      {contentSections.map(({ def, section }) => {
        const isHighlights = section.section_type === 'key_performance_highlights';
        const isImages = section.section_type === 'room_images';
        const title = section.title || def.title;
        const body = prepareSectionBody(section.body, {
          title,
          sectionType: section.section_type,
        });
        const modifiers = [
          isHighlights ? 'proposal-print-section--highlights' : '',
          isImages ? 'proposal-print-section--images' : '',
        ].filter(Boolean).join(' ');

        return (
          <section
            key={section.id}
            className={`proposal-print-section ${modifiers}`.trim()}
          >
            <h2 className="proposal-print-section__title">{title}</h2>

            {/* Project Images is imagery only: no generated narrative. */}
            {isImages && <ProjectImagesBlock images={projectImages} />}

            {!isImages && body ? (
              <div
                className="proposal-print-section__body"
                dangerouslySetInnerHTML={{ __html: body }}
              />
            ) : null}

            {isHighlights && (
              <KeyPerformanceHighlightsTable
                rows={section.metadata?.highlight_rows}
                comparisonRows={section.metadata?.comparison_rows}
                comparisonVersions={section.metadata?.comparison_versions}
              />
            )}
          </section>
        );
      })}
    </div>,
    document.body
  );
}