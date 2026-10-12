/**
 * MethodPage
 * ----------
 * What makes great cinema sound: the three qualities every design in this pack
 * is balanced around, in plain English, and the considered approach that closes
 * the page.
 *
 * An editorial page rather than a parameter list. The copy is fixed and held in
 * proposalPackAuthority, so it cannot drift into marketing language, and it
 * states no result and no figure: this page explains how the design was
 * reached, while the design's own results are reported on the evidence and
 * highlights pages.
 */

import React from 'react';
import ProposalPageHeader from '@/components/proposal/print/ProposalPageHeader';
import MethodRow from '@/components/proposal/print/MethodRow';
import { METHOD_PAGE } from '@/components/proposal/print/proposalPackAuthority';

export default function MethodPage({ number }) {
  return (
    <section className="proposal-print-section pp-page pp-page--method">
      <ProposalPageHeader
        number={number}
        kicker="Method"
        title={METHOD_PAGE.title}
      />

      <div className="pp-method__intro">
        {METHOD_PAGE.intro.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      <div className="pp-method__rows">
        {METHOD_PAGE.sections.map((section) => (
          <MethodRow
            key={section.title}
            heading={section.title}
            lede={section.lede}
            paragraphs={section.body}
          />
        ))}
        <MethodRow
          heading={METHOD_PAGE.closing.title}
          paragraphs={METHOD_PAGE.closing.body}
          closing
        />
      </div>
    </section>
  );
}