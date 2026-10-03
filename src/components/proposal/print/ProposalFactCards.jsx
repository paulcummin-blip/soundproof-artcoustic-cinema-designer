/**
 * ProposalFactCards
 * -----------------
 * The designed fact block used across the pack: a field label, its value, and
 * an optional supporting line. Used for the at-a-glance summary and for the
 * room and brief facts page.
 *
 * Cards are read-only and print-safe: they never calculate or reword a value.
 */

import React from 'react';
import { proposalRoleStyle } from '@/components/proposal/typography/proposalTypography';

export default function ProposalFactCards({ cards = [], columns = 3, className = '' }) {
  const list = (cards || []).filter((card) => card && card.value);
  if (list.length === 0) return null;

  return (
    <div className={`pp-cards pp-cards--${columns} ${className}`.trim()}>
      {list.map((card) => (
        <div key={card.label} className={`pp-card${card.wide ? ' pp-card--wide' : ''}`}>
          <div className="pp-card__label" style={proposalRoleStyle('label')}>
            {card.label}
          </div>
          <div className="pp-card__value" style={proposalRoleStyle('body')}>
            {card.value}
          </div>
          {card.hint ? (
            <div className="pp-card__hint" style={proposalRoleStyle('caption')}>
              {card.hint}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}