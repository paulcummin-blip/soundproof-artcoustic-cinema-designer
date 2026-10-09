/**
 * AdiDesignHighlightsPage
 * -----------------------
 * PAGE 2 of the consolidated Project Report: the ADI Design Highlights.
 *
 * This is the page ADI writes for THIS room and THIS design. Its highlights are
 * selected from the design's own frozen engineering evidence by
 * the ADI highlight authority — the strongest, most client-relevant results of
 * this actual system, each with the evidence it rests on. It is not a fixed
 * template and it states nothing the published assessment does not support.
 *
 * The page is a fixed A4 composition: the authority already fitted the
 * highlights to the page's own budget, so the page can never clip.
 *
 * Presentation only: no calculation, no grading, no invented claim.
 */

import React from 'react';
import AdiHighlightCard from './AdiHighlightCard';
import { COMPACT_HIGHLIGHT_THRESHOLD } from './projectReportPageBudget';
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from '@/components/report/typography/reportTypography';

const INK = '#213428';
const MUTED = '#625143';

export default function AdiDesignHighlightsPage({ highlights = [], print = false }) {
  const list = (Array.isArray(highlights) ? highlights : []).filter(Boolean);
  if (list.length === 0) return null;

  // A fuller page (more stories than the four-card layout the page grew from) is
  // composed compactly so five to seven genuine strengths are all stated on one
  // page. Only the space between cards tightens: each card keeps its own type
  // size and its own emphasis, so the strongest story still reads largest and a
  // supporting one still reads smaller.
  const compact = list.length > COMPACT_HIGHLIGHT_THRESHOLD;

  const containerStyle = print
    ? { width: '100%', fontFamily: FONT_BODY }
    : {
        padding: '28px 30px',
        background: '#FFFFFF',
        borderRadius: 16,
        border: '1px solid #DCDBD6',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
        fontFamily: FONT_BODY,
      };

  return (
    <div style={containerStyle}>
      <div className="client-report-print-heading">
        <h1
          className="client-report-print-heading__title"
          style={{
            margin: print ? 0 : '0 0 8px 0',
            fontFamily: FONT_HEADING,
            fontSize: print ? undefined : 22,
            fontWeight: 300,
            letterSpacing: '0.01em',
            color: INK,
          }}
        >
          ADI Design Highlights
        </h1>
        <p
          className={print ? 'client-report-print-heading__subtitle' : undefined}
          style={print ? undefined : {
            margin: 0,
            fontFamily: FONT_BODY,
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: MUTED,
          }}
        >
          Selected from this design's published RP22 and RP23 results
        </p>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: print ? (compact ? '2.2mm' : '3.4mm') : compact ? 8 : 12,
      }}>
        {list.map((highlight) => (
          <AdiHighlightCard key={highlight.id} highlight={highlight} print={print} />
        ))}
      </div>
    </div>
  );
}