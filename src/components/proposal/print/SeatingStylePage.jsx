/**
 * SeatingStylePage
 * ----------------
 * The seating-style page of the client specification pack: the large lifestyle
 * alternatives, with the choice stated for what it is.
 *
 * This is not an engineering comparison. It says plainly that the seating style
 * is a comfort and interior decision, that both alternatives work with the
 * seating layout this document specifies, and that the style does not change the
 * system performance — what matters to the engineering is where the seating
 * positions actually are, and that is what the design already specifies.
 *
 * The copy is fixed, approved text held in proposalPackAuthority. Nothing on this
 * page is written by an LLM, and nothing here reads or states a performance
 * result.
 */

import React from 'react';
import ProposalPageHeader from '@/components/proposal/print/ProposalPageHeader';
import ProposalImagePlacement from '@/components/proposal/print/ProposalImagePlacement';


export default function SeatingStylePage({
  number,
  title = 'Seating Style',
  kicker = 'Comfort',
  placements = [],
  validatedCopy = '',
  // The first seating page carries the framing copy; a continuation page does not
  // repeat it.
  showCopy = true,
  // The printed pack draws its own page header; the editor preview draws the
  // section heading itself, so it does not ask for a second one.
  showHeader = true,
}) {
  if (!placements.length) return null;

  return (
    <section className="proposal-print-section pp-page pp-page--seating">
      {showHeader ? <ProposalPageHeader number={number} kicker={kicker} title={title} /> : null}

      {showCopy && validatedCopy ? (
        <div className="pp-body pp-seating__lead">
          <p>{validatedCopy}</p>
        </div>
      ) : null}

      <div className={`pp-seating pp-seating--${placements.length}`}>
        {placements.map((placement) => (
          <ProposalImagePlacement key={placement.id} placement={placement} />
        ))}
      </div>


    </section>
  );
}