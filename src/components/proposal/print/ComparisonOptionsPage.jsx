/**
 * ComparisonOptionsPage
 * ---------------------
 * A comparison group's own page in the client specification pack: what is being
 * compared, in the designer's own words, with both options shown full width
 * beneath it.
 *
 * This page is neither a gallery nor an engineering comparison. Each image is one
 * option the designer marked as part of a comparison set, captioned with what it
 * stands for, and the message above them is the one the designer supplied — the
 * page never invents it. Where no note exists, the neutral text says plainly that
 * these are two visual options for the same design.
 *
 * The options are shown at the full width of the content column and at one
 * visual scale, so they can be read against each other rather than cropped into
 * small boxes.
 *
 * Pure presentation: no fetching, no calculation, no writing.
 */

import React from 'react';
import ProposalPageHeader from '@/components/proposal/print/ProposalPageHeader';
import ProposalImagePlacement from '@/components/proposal/print/ProposalImagePlacement';

export default function ComparisonOptionsPage({
  number,
  title,
  kicker = 'Options',
  validatedCopy = '',
  placements = [],
  // The printed pack draws its own page header; the editor preview draws the
  // section heading itself, so it does not ask for a second one.
  showHeader = true,
}) {
  const list = (Array.isArray(placements) ? placements : []).filter((placement) => placement?.source_file_url);
  if (list.length === 0) return null;

  return (
    <section className="proposal-print-section pp-page pp-page--comparison">
      {showHeader ? <ProposalPageHeader number={number} kicker={kicker} title={title} /> : null}

      {validatedCopy ? (
        <div className="pp-body pp-comparison__lead">
          <p>{validatedCopy}</p>
        </div>
      ) : null}

      <div className={`pp-comparison pp-comparison--${list.length}`}>
        {list.map((placement) => (
          <ProposalImagePlacement
            key={placement.id}
            placement={placement}
            // The option's own label leads: it is what the designer says this
            // option is. The image's caption stands in only when none is given.
            caption={placement.comparison_option_label || placement.source_caption || null}
          />
        ))}
      </div>
    </section>
  );
}