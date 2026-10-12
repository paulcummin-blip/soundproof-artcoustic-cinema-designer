/**
 * MethodRow
 * ---------
 * One row of the Method page's editorial grid: a heading and its opening
 * sentence in the left column, the explanation beside it in the right.
 *
 * Every row on the page shares this alignment, so the eye reads down the labels
 * and across the prose. The closing statement uses the same row with its own
 * modifier, because it is the page's conclusion rather than another principle.
 *
 * Pure presentation: the copy arrives as props from proposalPackAuthority.
 */

import React from 'react';

export default function MethodRow({ heading, lede, paragraphs, closing = false }) {
  return (
    <div className={`pp-method__row${closing ? ' pp-method__row--closing' : ''}`}>
      <div className="pp-method__label">
        <h3 className="pp-method__heading">{heading}</h3>
        {lede ? <p className="pp-method__lede">{lede}</p> : null}
      </div>
      <div className="pp-method__body">
        {(paragraphs || []).map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </div>
  );
}