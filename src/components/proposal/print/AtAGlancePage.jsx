/**
 * AtAGlancePage
 * -------------
 * The single orienting page of the pack: the project identity, the room and
 * screen the design answers, the system facts, the selected package and the one
 * short brief note. It replaces the separate "At a glance" and "The room and the
 * brief" pages, so nothing on the page is stated twice.
 *
 * Every field is read from the frozen engineering snapshot or the proposal's own
 * context. Nothing is written by AI and nothing is calculated here.
 */

import React from 'react';
import ProposalPageHeader from '@/components/proposal/print/ProposalPageHeader';
import ProposalFactCards from '@/components/proposal/print/ProposalFactCards';
import ProposalProductTable from '@/components/proposal/print/ProposalProductTable';
import {
  buildAtAGlanceCards,
  buildDesignBriefNote,
  buildSelectedPackageRows,
} from '@/components/proposal/print/proposalPackAuthority';

export default function AtAGlancePage({
  number,
  snapshot,
  projectName,
  dealerName,
  projectReference,
  generatedDate,
}) {
  const cards = buildAtAGlanceCards({
    snapshot,
    projectName,
    dealerName,
    projectReference,
    generatedDate,
  });
  const packageRows = buildSelectedPackageRows(snapshot);
  const briefNote = buildDesignBriefNote(snapshot);
  if (cards.length === 0 && packageRows.length === 0) return null;

  return (
    <section className="proposal-print-section pp-page pp-page--glance">
      <ProposalPageHeader
        number={number}
        kicker="System design"
        title="At a glance"
        lead="The design summary, the room it is designed for, and the system that has been specified."
      />

      {/* Brief and constraint, above the facts: what the design had to answer.
          Shown only where the design itself has something to say. */}
      {briefNote.length > 0 && (
        <div className="pp-notes pp-notes--brief">
          <div className="pp-note">
            {briefNote.map((line, index) => (
              <p
                key={line}
                className="pp-note__text"
                style={index > 0 ? { marginTop: '2mm' } : undefined}
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Facts only: the assessment basis belongs to Method and Notes, not to
          the page that orients the client. */}
      <ProposalFactCards cards={cards} columns={3} />

      {packageRows.length > 0 && (
        <div className="pp-block">
          <h3 className="pp-block__title">The selected package</h3>
          <ProposalProductTable rows={packageRows} />
        </div>
      )}
    </section>
  );
}