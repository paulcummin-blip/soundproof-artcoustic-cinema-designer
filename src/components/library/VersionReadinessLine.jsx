/**
 * VersionReadinessLine
 * --------------------
 * The one line under a design version's name on the Generated Reports tab that
 * answers the designer's question for THAT version: "Ready for Proposal", or
 * exactly what it still needs — "Needs updated Technical Report".
 *
 * The line is supplied by the caller, from the same readiness authority the
 * banner uses, so a version's line and the banner can never disagree.
 *
 * Presentation only.
 */

import React from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';

export default function VersionReadinessLine({ line, ready = false }) {
  if (!line) return null;

  return (
    <p
      className="mt-1 inline-flex items-center gap-1.5 text-[12px]"
      style={{ color: ready ? '#213428' : '#7A5A10', fontFamily: REPORT_FONT_BODY }}
      data-version-readiness={ready ? 'ready' : 'blocked'}
    >
      {ready ? <Check className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
      {line}
    </p>
  );
}