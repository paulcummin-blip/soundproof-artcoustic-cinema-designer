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

export default function ProposalPageHeader({ number, title, lead, kicker }) {
  return (
    <header className="pp-header">
      <div className="pp-header__meta">
        {number ? <span className="pp-header__number">{number}</span> : null}
        {kicker ? <span className="pp-header__kicker">{kicker}</span> : null}
      </div>
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