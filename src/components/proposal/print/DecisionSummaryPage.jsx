/**
 * DecisionSummaryPage
 * -------------------
 * The page a client reads first in a System Design Comparison: which option to
 * choose, and why.
 *
 * It exists because a comparison that opens with its evidence asks the client to
 * work out the decision for themselves. This page answers the question the
 * client is actually holding — "if both options use the same layout, why spend
 * more?" — before any table appears.
 *
 * Every value on the page is read from the calculated comparison rows, which are
 * themselves read from each version's frozen engineering evidence. Nothing is
 * calculated, graded or invented here, and no benefit is claimed that the rows
 * do not support: where an area is shared it is stated as shared, and where the
 * evidence states Level 1 or Level 2 the page says so plainly.
 *
 * A single-version pack has no choice to present and never prints this page.
 *
 * One page by design: short paragraphs, one shared-architecture sentence, one
 * evidence-backed headroom paragraph, one honest list of what does not change,
 * and the choice stated in two lines.
 */

import React from 'react';
import ProposalPageHeader from '@/components/proposal/print/ProposalPageHeader';

/** A leading RP22 level, from either "L4" or "Level 4". */
const LEVEL = /^\s*(?:L([1-4])|Level\s*([1-4]))\b/i;

/** The saved version name is the option's name; the position letter is a fallback. */
function optionName(column, index) {
  return column?.version_name || column?.label || `Option ${String.fromCharCode(65 + index)}`;
}

function levelRank(value) {
  const match = LEVEL.exec(String(value || ''));
  if (!match) return -1;
  return Number(match[1] || match[2]);
}

function rowFor(rows, key) {
  return rows.find((row) => row?.key === key) || null;
}

/** The value every option shares for a row, or null when the row differs. */
function sharedValue(row) {
  return row && row.identical === true ? row.values?.[0] || null : null;
}

export default function DecisionSummaryPage({
  number,
  comparisonRows = null,
  comparisonVersions = null,
}) {
  const rows = Array.isArray(comparisonRows) ? comparisonRows : [];
  const options = Array.isArray(comparisonVersions) ? comparisonVersions : [];
  if (rows.length === 0 || options.length < 2) return null;

  const names = options.map(optionName);
  const p12 = rowFor(rows, 'p12');
  const p13 = rowFor(rows, 'p13');
  const p14 = rowFor(rows, 'p14');
  const p20 = rowFor(rows, 'p20');
  const lcr = rowFor(rows, 'lcr');
  const subwoofers = rowFor(rows, 'subwoofers');
  const screen = sharedValue(rowFor(rows, 'screen_size'));
  const layout = sharedValue(rowFor(rows, 'system_layout'));

  // Which option the evidence grades highest on the screen stage, then around
  // the seating. Derived from the rows only: the page never assumes which of the
  // options is the performance-led one, and states no ranking it cannot show.
  const rankedOption = (() => {
    for (const row of [p12, p13]) {
      if (!row || row.identical === true) continue;
      const ranks = options.map((_, index) => levelRank(row.values?.[index]));
      const top = Math.max(...ranks);
      if (top < 0) continue;
      const leaders = ranks.map((rank, index) => (rank === top ? index : -1)).filter((index) => index >= 0);
      if (leaders.length === 1) return { index: leaders[0], row };
    }
    return null;
  })();

  const lowerIndex = rankedOption ? options.findIndex((_, index) => index !== rankedOption.index) : -1;
  const performanceName = rankedOption ? names[rankedOption.index] : null;
  const restrainedName = lowerIndex >= 0 ? names[lowerIndex] : null;

  // What both options keep, read from the rows themselves.
  const sharedFacts = ['screen_size', 'seating', 'system_layout', 'acoustic_treatment']
    .map((key) => rowFor(rows, key))
    .filter((row) => row && row.identical === true && row.values?.[0])
    .map((row) => ({ label: row.area, value: row.values[0] }));

  // The headroom story, each line backed by the parameters it names.
  const headroom = [];
  if (p12 && p12.identical !== true) {
    headroom.push(
      `Screen stage headroom (P12) is ${p12.values.join(' against ')}. That is a large practical difference: dialogue, music and screen effects have more space before the system reaches its limits.`,
    );
  }
  if (p13 && p13.identical !== true) {
    headroom.push(
      `Around and above the seating, the surround and height layers (P13) are ${p13.values.join(' against ')}. Effects in those layers are less likely to be masked by the front stage during demanding scenes.`,
    );
  }
  if (p14 && p14.identical !== true) {
    headroom.push(
      `Low-frequency capability (P14) is ${p14.values.join(' against ')}. This adds bass authority and physical impact, and it does not on its own solve seat-to-seat bass variation.`,
    );
  }

  const sharedArchitecture = [screen ? `a ${screen} screen` : null, layout ? `a ${layout} layout` : null]
    .filter(Boolean)
    .join(' and ');

  return (
    <section className="proposal-print-section pp-page pp-page--decision">
      <ProposalPageHeader number={number} kicker="Decision" title="Which option should you choose?" />

      <div className="pp-body pp-decision">
        <p>
          {sharedArchitecture
            ? `Both options share the same cinema architecture: ${sharedArchitecture}. Both place sound around and above the audience in broadly the same way.`
            : 'Both options share the same cinema architecture, the same room and the same seating plan. Both place sound around and above the audience in broadly the same way.'}
        </p>

        <p>
          {performanceName && restrainedName
            ? `The difference is capability, not layout. The ${restrainedName} gives the room the correct format; the ${performanceName} gives that format more authority.`
            : 'The difference is capability, not layout: how much performance each part of the system can deliver once a soundtrack becomes demanding.'}
          {lcr && lcr.identical !== true ? ` The screen stage is specified as ${lcr.values.join(' against ')}.` : ''}
          {subwoofers && subwoofers.identical !== true ? ` The bass system is specified as ${subwoofers.values.join(' against ')}.` : ''}
        </p>

        {headroom.length > 0 ? <p>{headroom.join(' ')}</p> : null}

        {p20 && p20.identical === true ? (
          <p>
            What does not change: both designs still need calibration attention for seat-to-seat bass
            consistency. The stronger specification improves output authority, not full-seat uniformity.
          </p>
        ) : null}

        {sharedFacts.length > 0 ? (
          <div className="pp-decision__same">
            <h3 className="pp-decision__title">What stays the same</h3>
            <dl>
              {sharedFacts.map((fact) => (
                <div className="pp-comparison-option__row" key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {performanceName && restrainedName ? (
          <div className="pp-decision__choice">
            <div className="pp-decision__choice-item">
              <dt>Choose the {restrainedName}</dt>
              <dd>
                If the priority is this same layout, screen and seating plan with a more restrained
                specification. It remains a credible multi-row cinema design.
              </dd>
            </div>
            <div className="pp-decision__choice-item">
              <dt>Choose the {performanceName}</dt>
              <dd>
                If the priority is performance. Every major part of the system has more capability, so
                the room sounds more controlled and more convincing at cinema playback levels.
              </dd>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}