/**
 * AtAGlancePage
 * -------------
 * The one page that orients the client: the project, the room and screen, and the
 * system with the specified package.
 *
 * Every card states one fact and nothing else: no second line of explanation, no
 * count that repeats another card, and no restatement of the dealer, who is named
 * on the cover. The viewing geometry is stated one row at a time, because RP23 is
 * a per-row result.
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
  projectReference,
  generatedDate,
}) {
  const { projectCards, roomCards, systemCards, packageRows } = buildAtAGlance({
    snapshot,
    projectName,
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
      />

      <div className="pp-facts-group">
        <h3 className="pp-facts-group__title">Project</h3>
        <ProposalFactCards cards={projectCards} columns={3} />
      </div>

      <div className="pp-facts-group">
        <h3 className="pp-facts-group__title">Room and screen</h3>
        <ProposalFactCards cards={roomCards} columns={3} />
      </div>

      <div className="pp-facts-group">
        <h3 className="pp-facts-group__title">System</h3>
        <ProposalFactCards cards={systemCards} columns={3} />
        {packageRows.length > 0 ? <ProposalProductTable rows={packageRows} /> : null}
      </div>
    </section>
  );
}