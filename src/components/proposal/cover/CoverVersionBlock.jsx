/**
 * CoverVersionBlock
 * -----------------
 * The design version statement on a proposal cover.
 *
 *   One version        Several versions
 *   Version            Comparing
 *   Level 4 version    Level 4 version
 *                      Level 1 version
 *
 * The names are the stored ProjectVersion names, printed exactly as saved. The
 * block states nothing when no name could be read, so a cover never shows a
 * generic or invented version label.
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

export default function CoverVersionBlock({ versionNames = [] }) {
  const names = (Array.isArray(versionNames) ? versionNames : [])
    .map((name) => (typeof name === 'string' ? name.trim() : ''))
    .filter(Boolean);
  if (names.length === 0) return null;

  const comparing = names.length > 1;

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