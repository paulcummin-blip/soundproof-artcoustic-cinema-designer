/**
 * AtAGlancePage
 * -------------
 * The page that orients the client before the technical story: the project
 * identity and the design's headline facts, as designed cards.
 *
 * Every field is read from the frozen engineering snapshot or the proposal's own
 * context. Nothing is written by AI and nothing is calculated here.
 */

import React from 'react';
import ProposalPageHeader from '@/components/proposal/print/ProposalPageHeader';
import ProposalFactCards from '@/components/proposal/print/ProposalFactCards';
import { buildAtAGlanceCards } from '@/components/proposal/print/proposalPackAuthority';

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
  if (cards.length === 0) return null;

  return (
    <section className="proposal-print-section pp-page pp-page--glance">
      <ProposalPageHeader
        number={number}
        kicker="System design"
        title="At a glance"
        lead="The design summary, the room it is designed for, and the system that has been specified."
      />
      {/* Facts only: the prediction and assessment basis belongs to Method and
          Notes, not to the page that orients the client. */}
      <ProposalFactCards cards={cards} columns={3} />
    </section>
  );
}