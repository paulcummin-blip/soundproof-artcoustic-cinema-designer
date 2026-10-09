/**
 * ReportLevelValue — one reported value with its canonical level pill.
 * --------------------------------------------------------------------
 * THE way a performance level appears beside its own parameter in client-facing
 * report content. The parameter name and the published value stay ordinary text;
 * the level is always the shared RP22GradingPill, so its colours, border,
 * dimensions and typography come from the single grading authority
 * (rp22Colors.jsx) and never from a second set of rules.
 *
 * The level is passed as its own prop and never written into the label text, so
 * a level can neither be printed twice ("P16 L4" beside an L4 pill) nor drift
 * back into plain text.
 *
 * This is the content only — the surrounding chip, row or table cell is the
 * caller's own layout.
 *
 * Props:
 *   label          — the parameter/result name as plain text, e.g. "P16" or "RP23"
 *   level          — one published level: "L1"-"L4" | "FAIL" | "N/A" | null
 *   levels         — several published levels (e.g. one row whose seats differ);
 *                    each gets its own pill, separated by a thin rule
 *   value          — the published value/context text, e.g. "±0.5 dB"
 *   variant        — pill size; the report's print size by default
 *   gap            — space between the parts
 *   plainSeparator — the "·" between the label and the value when no pill sits
 *                    between them (the evidence line's own convention)
 */

import React from 'react';
import RP22GradingPill from '@/components/ui/RP22GradingPill';

export default function ReportLevelValue({
  label = null,
  level = null,
  levels = null,
  value = null,
  variant = 'printCompact',
  gap = 6,
  plainSeparator = '·',
}) {
  const published = (Array.isArray(levels) ? levels : [level]).filter(Boolean);
  if (!label && published.length === 0 && !value) return null;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap, flexWrap: 'wrap' }}>
      {label ? <span>{label}</span> : null}

      {published.map((entry, index) => (
        <React.Fragment key={`${entry}-${index}`}>
          {index > 0 ? <span style={{ opacity: 0.55 }}>/</span> : null}
          <RP22GradingPill level={entry} variant={variant} />
        </React.Fragment>
      ))}

      {value ? (
        <>
          {label && published.length === 0 && plainSeparator ? <span>{plainSeparator}</span> : null}
          <span>{value}</span>
        </>
      ) : null}
    </span>
  );
}