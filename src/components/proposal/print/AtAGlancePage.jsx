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
 * A comparison covers two or more design versions, so this page carries one block
 * per selected version instead of a single system: the project and the room stay
 * shared facts, and everything the versions can differ on (layout, speakers,
 * subwoofers, seating, screen, viewing geometry) is stated once per version from
 * the same calculated comparison rows the Key Differences table prints.
 *
 * Every field is read from the frozen engineering snapshot, the calculated
 * comparison rows or the proposal's own context. Nothing is written by AI and
 * nothing is calculated here.
 */

import React from 'react';
import ProposalPageHeader from '@/components/proposal/print/ProposalPageHeader';
import ProposalFactCards from '@/components/proposal/print/ProposalFactCards';
import ProposalProductTable from '@/components/proposal/print/ProposalProductTable';
import { buildAtAGlance } from '@/components/proposal/print/proposalPackAuthority';
import { buildComparisonGlance } from '@/components/proposal/print/atAGlanceVersions';

export default function AtAGlancePage({
  number,
  snapshot,
  projectName,
  projectReference,
  generatedDate,
  comparisonRows = null,
  comparisonVersions = null,
}) {
  const base = buildAtAGlance({
    snapshot,
    projectName,
    projectReference,
    generatedDate,
  });

  const comparison = buildComparisonGlance({
    comparisonRows,
    comparisonVersions,
    projectCards: base.projectCards,
    roomCards: base.roomCards,
  });
  const isComparison = comparison.versionGroups.length > 0;

  // A comparison states the room once and each version in its own block: the
  // single-version screen, seating, viewing and package are not printed, because
  // they belong to one version and this page covers all of them.
  const projectCards = isComparison ? comparison.projectCards : base.projectCards;
  const roomCards = isComparison ? comparison.roomCards : base.roomCards;

  const isEmpty = projectCards.length === 0
    && roomCards.length === 0
    && !isComparison
    && base.systemCards.length === 0
    && base.packageRows.length === 0;
  if (isEmpty) return null;

  return (
    <section className="proposal-print-section pp-page pp-page--glance">
      <ProposalPageHeader
        number={number}
        kicker={isComparison ? 'System comparison' : 'System design'}
        title="At a glance"
      />

      {projectCards.length > 0 ? (
        <div className="pp-facts-group">
          <h3 className="pp-facts-group__title">Project</h3>
          <ProposalFactCards cards={projectCards} columns={3} />
        </div>
      ) : null}

      {roomCards.length > 0 ? (
        <div className="pp-facts-group">
          <h3 className="pp-facts-group__title">Room and screen</h3>
          <ProposalFactCards cards={roomCards} columns={3} />
        </div>
      ) : null}

      {isComparison ? (
        comparison.versionGroups.map((group) => (
          <div className="pp-facts-group" key={group.name}>
            <h3 className="pp-facts-group__title">{group.name}</h3>
            <ProposalFactCards cards={group.cards} columns={3} />
          </div>
        ))
      ) : (
        <div className="pp-facts-group">
          <h3 className="pp-facts-group__title">System</h3>
          <ProposalFactCards cards={base.systemCards} columns={3} />
          {base.packageRows.length > 0 ? <ProposalProductTable rows={base.packageRows} /> : null}
        </div>
      )}
    </section>
  );
}