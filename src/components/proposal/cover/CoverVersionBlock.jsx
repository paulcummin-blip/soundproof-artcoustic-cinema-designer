/**
 * CoverVersionBlock
 * -----------------
 * The design version statement on a COMPARISON cover.
 *
 *   Comparing
 *   Level 4 version
 *   Level 1 version
 *
 * The names are the stored ProjectVersion names, printed exactly as saved. The
 * block states nothing when no name could be read, so a cover never shows a
 * generic or invented version label.
 *
 * A document that presents ONE design carries no version statement at all, so
 * the cover renders this block only for a System Design Comparison. `comparing`
 * is supplied by the cover from the proposal's own TYPE — never inferred from
 * how many names arrived — so the comparison's own heading is used whenever a
 * comparison is read, and a single-design cover renders none at all.
 */

import React from 'react';
import {
  PROPOSAL_FONT_HEADING,
  PROPOSAL_TRACKING_HEADING,
  PROPOSAL_LEADING_HEADING,
} from '@/components/proposal/typography/proposalTypography';

const WHITE = '#FFFFFF';

/** The letterspaced label above the names, matching the cover's other labels. */
function VersionLabel({ children }) {
  return (
    <div
      className="proposal-cover-label proposal-cover-version-label"
      style={{
        fontFamily: PROPOSAL_FONT_HEADING,
        fontSize: 8,
        fontWeight: 600,
        letterSpacing: '0.26em',
        textTransform: 'uppercase',
        color: WHITE,
      }}
    >
      {children}
    </div>
  );
}

export default function CoverVersionBlock({ versionNames = [], comparing: comparingProp = null }) {
  const names = (Array.isArray(versionNames) ? versionNames : [])
    .map((name) => (typeof name === 'string' ? name.trim() : ''))
    .filter(Boolean);
  if (names.length === 0) return null;

  // The report type decides this, not the number of names: a comparison states
  // its own heading even where only one name could be read.
  const comparing = typeof comparingProp === 'boolean' ? comparingProp : names.length > 1;

  return (
    <div style={{ width: '100%' }} className="proposal-cover-versions">
      <VersionLabel>{comparing ? 'Comparing' : 'Version'}</VersionLabel>
      {names.map((name, index) => (
        <div
          key={name}
          className="proposal-cover-version"
          style={{
            fontFamily: PROPOSAL_FONT_HEADING,
            fontSize: 13,
            fontWeight: 300,
            letterSpacing: '0.02em',
            lineHeight: PROPOSAL_LEADING_HEADING,
            color: WHITE,
            marginTop: index === 0 ? 8 : 4,
          }}
        >
          {name}
        </div>
      ))}
      {comparing && (
        <div
          className="proposal-cover-version-note"
          style={{
            fontFamily: PROPOSAL_FONT_HEADING,
            fontSize: 9,
            fontWeight: 300,
            letterSpacing: PROPOSAL_TRACKING_HEADING,
            textTransform: 'uppercase',
            color: WHITE,
            opacity: 0.85,
            marginTop: 8,
          }}
        >
          System Design Comparison
        </div>
      )}
    </div>
  );
}