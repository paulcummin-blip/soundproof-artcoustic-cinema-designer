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
      <ProposalFactCards cards={cards} columns={3} />
      <p className="pp-note">
        Performance is modelled against CEDIA/CTA-RP22 and RP23. The results in this
        document are predicted from the room model and the published product data.
      </p>
    </section>
  );
}