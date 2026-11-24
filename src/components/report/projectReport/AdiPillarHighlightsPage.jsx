/**
 * AdiPillarHighlightsPage
 * ------------------------
 * PAGE 2 of the consolidated Project Report: the redesigned ADI Design Highlights.
 *
 * The page consolidates this design's performance into the THREE RP22 pillars —
 * Spatial Resolution, Dynamic Range and Timbre Matching — each with the
 * adaptively-selected parameters ADI ranked strongest from the design's own
 * frozen engineering evidence. Seat-specific parameters show every assessed
 * seat's own published level; room and RSP parameters show their single result.
 * A compact RP22 Performance Overview table sits at the foot of the page.
 *
 * The page preserves the report's existing design, typography, colours and green
 * vertical divider lines: each pillar carries a coloured bar on its left edge,
 * the same brand tones the Technical Report's category dividers use. Every level
 * is the shared canonical RP22GradingPill.
 *
 * Presentation only: no calculation, no grading, no invented claim. The content
 * arrives from buildAdiPillarHighlights; nothing is composed here.
 */

import React from 'react';
import AdiPillarParameterRow from './AdiPillarParameterRow';
import AdiPillarOverviewTable from './AdiPillarOverviewTable';
import { ADI_PILLARS } from './adiPillarHighlights';
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from '@/components/report/typography/reportTypography';

const INK = '#213428';
const MUTED = '#625143';
const RULE = '#DCDBD6';

export default function AdiPillarHighlightsPage({ highlights = null, print = false }) {
  const pillars = highlights?.pillars || ADI_PILLARS;
  const overview = highlights?.overview || null;
  const list = (Array.isArray(pillars) ? pillars : []).filter(Boolean);
  if (list.length === 0) return null;

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

  const pillarGap = print ? '3mm' : 14;

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
          Selected from this design's published RP22 results, grouped by performance pillar
        </p>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: pillarGap,
        marginTop: print ? '3mm' : 14,
      }}>
        {list.map((pillar) => (
          <PillarSection key={pillar.id} pillar={pillar} print={print} />
        ))}
      </div>

      <AdiPillarOverviewTable overview={overview} print={print} />
    </div>
  );
}

function PillarSection({ pillar, print = false }) {
  const titleFont = print ? 12 : 16;
  const commentaryFont = print ? 9 : 12;

  return (
    <div style={{
      display: 'flex',
      gap: print ? '2.5mm' : 10,
    }}>
      {/* Green vertical divider — the same brand tone the Technical Report
          category dividers use. */}
      <div style={{
        width: print ? '1.2mm' : 3,
        flexShrink: 0,
        alignSelf: 'stretch',
        background: pillar.colour || INK,
        borderRadius: 2,
      }} />

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontFamily: FONT_HEADING,
          fontSize: titleFont,
          fontWeight: 400,
          color: INK,
          letterSpacing: '0.01em',
          lineHeight: 1.2,
          marginBottom: print ? '1.5mm' : 6,
        }}>
          {pillar.title}
        </div>

        {pillar.hasEvidence ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {pillar.parameters.map((parameter) => (
              <AdiPillarParameterRow
                key={parameter.key}
                parameter={parameter}
                print={print}
              />
            ))}
          </div>
        ) : (
          <div style={{
            fontFamily: FONT_BODY,
            fontSize: commentaryFont,
            fontStyle: 'italic',
            color: MUTED,
            padding: print ? '1mm 0' : '4px 0',
          }}>
            No terminal result was published for this pillar.
          </div>
        )}

        <div style={{
          marginTop: print ? '1.5mm' : 6,
          fontFamily: FONT_BODY,
          fontSize: commentaryFont,
          lineHeight: 1.45,
          color: '#3E4349',
        }}>
          {pillar.commentary}
        </div>
      </div>
    </div>
  );
}