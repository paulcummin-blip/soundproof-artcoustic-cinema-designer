/**
 * ProposalPageHeader
 * ------------------
 * The page furniture for a designed proposal page: the section number, the
 * tracked uppercase title and an optional lead line, over a hairline rule.
 *
 * The number is assigned by the document composition, so the pack reads as one
 * numbered document rather than a stack of loose sections.
 */

import React from 'react';
import { proposalRoleStyle } from '@/components/proposal/typography/proposalTypography';

export default function ProposalPageHeader({
  number,
  title,
  lead,
  kicker,
  // A section that continues on a sheet another section opened: it keeps its own
  // heading and hierarchy, and does not state a second page number on one sheet.
  continued = false,
}) {
  return (
    <header className={`pp-header${continued ? ' pp-header--continued' : ''}`}>
      {/* A heading that states neither a number nor a kicker prints no track line
          at all — never an empty one. The three design structures read under the
          shared Sound Experience heading are exactly that case: the shared
          heading has already named this part of the document, so their own
          headings carry the structure's name and nothing repeated above it. */}
      {(number || kicker) ? (
        <div className="pp-header__meta">
          {number ? <span className="pp-header__number">{number}</span> : null}
          {kicker ? <span className="pp-header__kicker">{kicker}</span> : null}
        </div>
      ) : null}
      <h2 className="pp-header__title" style={proposalRoleStyle('header')}>
        {title}
      </h2>
      {lead ? (
        <p className="pp-header__lead" style={proposalRoleStyle('body')}>
          {lead}
        </p>
      ) : null}
      <div className="pp-header__rule" />
    </header>
  );
}