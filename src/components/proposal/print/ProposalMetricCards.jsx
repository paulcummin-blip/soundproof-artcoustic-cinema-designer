/**
 * ProposalMetricCards
 * -------------------
 * The designed evidence block for a design-structure section: one card per
 * parameter, showing the parameter source, its calculated result and what that
 * result gives the room.
 *
 * The card model comes from the highlights authority, so the result shown here
 * is the same calculated value, rounded by the same policy, that appears in the
 * Key Performance Highlights table.
 */

import React from 'react';
import { proposalRoleStyle } from '@/components/proposal/typography/proposalTypography';

export default function ProposalMetricCards({ cards = [], className = '' }) {
  const list = (cards || []).filter((card) => card && card.parameter);
  if (list.length === 0) return null;

  return (
    <div className={`pp-metrics ${className}`.trim()}>
      {list.map((card) => (
        <div key={card.key} className="pp-metric">
          <div className="pp-metric__parameter" style={proposalRoleStyle('label')}>
            {card.parameter}
          </div>
          <div className="pp-metric__result" style={proposalRoleStyle('header')}>
            {card.result}
          </div>
          <div className="pp-metric__gain" style={proposalRoleStyle('caption')}>
            {card.gain}
          </div>
        </div>
      ))}
    </div>
  );
}