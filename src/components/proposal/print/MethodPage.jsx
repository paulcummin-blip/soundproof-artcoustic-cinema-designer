/**
 * MethodPage
 * ----------
 * How the design was reached, in plain English: the room is modelled first and
 * equipment is selected second, and RP22 grades the result through three design
 * structures.
 *
 * This page is deliberately not a parameter list. The copy is fixed and held in
 * proposalPackAuthority, so it cannot drift into marketing language.
 */

import React from 'react';
import ProposalPageHeader from '@/components/proposal/print/ProposalPageHeader';
import { METHOD_PAGE } from '@/components/proposal/print/proposalPackAuthority';

export default function MethodPage({ number }) {
  return (
    <section className="proposal-print-section pp-page pp-page--method">
      <ProposalPageHeader
        number={number}
        kicker="Method"
        title="How the design was reached"
        lead={METHOD_PAGE.lead}
      />

      <div className="pp-structures">
        {METHOD_PAGE.blocks.map((block) => (
          <div key={block.title} className="pp-structure">
            <div className="pp-structure__title">{block.title}</div>
            <p className="pp-structure__text">{block.text}</p>
          </div>
        ))}
      </div>

      <div className="pp-notes">
        {METHOD_PAGE.notes.map((note) => (
          <p key={note} className="pp-note">
            {note}
          </p>
        ))}
      </div>
    </section>
  );
}