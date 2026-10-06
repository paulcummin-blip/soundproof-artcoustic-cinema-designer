/**
 * LibraryStatusLabel
 * ------------------
 * The compact state label an asset row carries: Current live report, Exported
 * PDF, Current, Source changed, Missing source, Same as current, Older export,
 * Superseded by newer export.
 *
 * Presentation only.
 */

import React from 'react';
import { Check, AlertTriangle, CircleSlash, FileDown, History } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import {
  LIBRARY_SOURCE_LABEL,
  LIBRARY_SOURCE_STATE,
  LIVE_REPORT_STATE,
} from './librarySourceStatus';

const STATE_STYLE = {
  [LIBRARY_SOURCE_STATE.CURRENT]: { colour: '#213428', Icon: Check },
  // A version's own report row: exists and matches, needs updating, or not generated.
  [LIVE_REPORT_STATE.UPDATE_NEEDED]: { colour: '#7A5A10', Icon: AlertTriangle },
  [LIVE_REPORT_STATE.MISSING]: { colour: '#7A2E10', Icon: CircleSlash },
  [LIBRARY_SOURCE_STATE.SOURCE_CHANGED]: { colour: '#7A5A10', Icon: AlertTriangle },
  [LIBRARY_SOURCE_STATE.MISSING_SOURCE]: { colour: '#7A2E10', Icon: CircleSlash },
  [LIBRARY_SOURCE_STATE.SUPERSEDED]: { colour: '#8A8477', Icon: History },
  [LIBRARY_SOURCE_STATE.SAME_AS_CURRENT]: { colour: '#213428', Icon: Check },
  [LIBRARY_SOURCE_STATE.OLDER_EXPORT]: { colour: '#8A8477', Icon: History },
  'live-report': { colour: '#213428', Icon: Check },
  'exported-pdf': { colour: '#625143', Icon: FileDown },
};

export default function LibraryStatusLabel({ state = LIBRARY_SOURCE_STATE.CURRENT, label }) {
  const style = STATE_STYLE[state] || STATE_STYLE[LIBRARY_SOURCE_STATE.CURRENT];
  const { Icon } = style;

  return (
    <span className="inline-flex items-center gap-1.5" data-library-status={state}>
      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: style.colour }} />
      <span
        className="text-[11px] uppercase tracking-[0.12em] font-semibold"
        style={{ color: style.colour, fontFamily: REPORT_FONT_BODY }}
      >
        {label || LIBRARY_SOURCE_LABEL[state] || ''}
      </span>
    </span>
  );
}