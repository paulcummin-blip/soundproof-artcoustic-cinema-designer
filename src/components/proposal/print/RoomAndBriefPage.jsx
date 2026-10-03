/**
 * RoomAndBriefPage
 * ----------------
 * The room, the brief and the package: what the room is, what was asked of the
 * design, where the room sets its own limits, and which products were selected.
 *
 * Mixed layout by design: facts as cards, the package as a table, and one
 * editorial image when the project has one. No long prose block.
 */

import React from 'react';
import ProposalPageHeader from '@/components/proposal/print/ProposalPageHeader';
import ProposalFactCards from '@/components/proposal/print/ProposalFactCards';
import ProposalProductTable from '@/components/proposal/print/ProposalProductTable';
import { buildRoomBriefFacts } from '@/components/proposal/print/proposalPackAuthority';

export default function RoomAndBriefPage({ number, snapshot, editorialImageUrl }) {
  const { facts, products } = buildRoomBriefFacts(snapshot);
  if (facts.length === 0 && products.length === 0) return null;

  return (
    <section className="proposal-print-section pp-page pp-page--room">
      <ProposalPageHeader
        number={number}
        kicker="The design"
        title="The room and the brief"
        lead="What the room is, and what the design had to answer."
      />

      <ProposalFactCards cards={facts} columns={3} />

      {editorialImageUrl ? (
        <figure className="pp-editorial">
          <img src={editorialImageUrl} alt="" />
        </figure>
      ) : null}

      {products.length > 0 && (
        <div className="pp-block">
          <h3 className="pp-block__title" style={{}}>
            The selected package
          </h3>
          <ProposalProductTable rows={products} />
        </div>
      )}
    </section>
  );
}