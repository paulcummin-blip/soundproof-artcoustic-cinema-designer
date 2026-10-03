/**
 * AtAGlancePage
 * -------------
 * The one page that orients the client: the project, the room and screen, the
 * system and the specified package, closing with the design's own constraint as
 * a single short note.
 *
 * This page carries the room and the brief as well: there is no second page
 * restating the same facts under another heading.
 *
 * Every field is read from the frozen engineering snapshot or the proposal's own
 * context. Nothing is written by AI and nothing is calculated here.
 */

import React from 'react';
import ProposalPageHeader from '@/components/proposal/print/ProposalPageHeader';
import ProposalFactCards from '@/components/proposal/print/ProposalFactCards';
import ProposalProductTable from '@/components/proposal/print/ProposalProductTable';
import { buildAtAGlance } from '@/components/proposal/print/proposalPackAuthority';

export default function AtAGlancePage({
  number,
  snapshot,
  projectName,
  dealerName,
  projectReference,
  generatedDate,
}) {
  const { projectCards, roomCards, systemCards, packageRows, briefNote } = buildAtAGlance({
    snapshot,
    projectName,
    dealerName,
    projectReference,
    generatedDate,
  });

  const isEmpty = projectCards.length === 0
    && roomCards.length === 0
    && systemCards.length === 0
    && packageRows.length === 0;
  if (isEmpty) return null;

  return (
    <section className="proposal-print-section pp-page pp-page--glance">
      <ProposalPageHeader
        number={number}
        kicker="System design"
        title="At a glance"
        lead="The project, the room it is designed for, and the system that has been specified."
      />

      <div className="pp-facts-group">
        <h3 className="pp-facts-group__title">Project</h3>
        <ProposalFactCards cards={projectCards} columns={3} />
      </div>

      <div className="pp-facts-group">
        <h3 className="pp-facts-group__title">Room and screen</h3>
        <ProposalFactCards cards={roomCards} columns={3} />
        {/* The one line of the room's own constraint, stated by the engineering
            authority. No other commentary belongs on this page. */}
        {briefNote ? (
          <div className="pp-note">
            <div className="pp-note__title">Design brief</div>
            <p className="pp-note__text">{briefNote}</p>
          </div>
        ) : null}
      </div>

      <div className="pp-facts-group">
        <h3 className="pp-facts-group__title">System</h3>
        <ProposalFactCards cards={systemCards} columns={3} />
        {packageRows.length > 0 ? <ProposalProductTable rows={packageRows} /> : null}
      </div>
    </section>
  );
}