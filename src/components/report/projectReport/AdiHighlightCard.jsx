/**
 * AdiHighlightCard
 * ----------------
 * ONE client-facing ADI highlight: a short title, its evidence in full, and one
 * short explanation. The evidence states the parameter and the published value
 * the claim rests on, so nothing on the page is asserted without its source.
 *
 * A highlight ADI ranked as a leading strength (weight 3) is given more
 * prominence than a supporting one — the page never forces every category to
 * take equal space.
 *
 * Presentation only. The copy and the evidence arrive from the ADI highlight
 * authority; nothing is composed, graded or inferred here.
 */

import React from 'react';
import { getSeatGradeColors } from '@/components/report/client/visualReportSeatStyle';
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from '@/components/report/typography/reportTypography';

const INK = '#213428';
const BODY = '#3E4349';
const MUTED = '#625143';
const RULE = '#DCDBD6';

function EvidencePill({ item, print, fontSize }) {
  const level = item?.level ? String(item.level).match(/^L?([1-4])$|^FAIL$/) : null;
  const grade = level ? getSeatGradeColors(item.level) : null;
  const text = [item?.key, item?.value].filter(Boolean).join(' · ');

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: print ? '1mm 2mm' : '4px 8px',
      borderRadius: 4,
      border: `1px solid ${grade ? grade.border : RULE}`,
      background: grade ? grade.fill : '#F8F8F7',
      color: grade ? grade.text : BODY,
      fontFamily: FONT_BODY,
      fontSize: fontSize ?? (print ? 8 : 11),
      lineHeight: 1.2,
    }}>
      {text}
    </span>
  );
}

export default function AdiHighlightCard({ highlight, print = false }) {
  if (!highlight) return null;

  // Emphasis follows ADI's own ranking of this design's evidence: the strongest
  // result states the highlight, a solid supporting result is stated plainly,
  // and a brief supporting note is stated smallest. The page therefore reads in
  // one visual order of importance instead of giving every item equal weight.
  const weight = Number(highlight.weight);
  const tier = weight >= 3 ? 'feature' : weight >= 2 ? 'standard' : 'supporting';
  const emphasis = {
    feature: { bar: print ? '1.2mm' : 3, title: print ? 12 : 17, titleWeight: 400, pillFont: print ? 8 : 11, copyFont: print ? 9 : 12.5, copyColor: BODY },
    standard: { bar: print ? '0.9mm' : 2, title: print ? 11 : 15.5, titleWeight: 400, pillFont: print ? 7.5 : 10.5, copyFont: print ? 9 : 12, copyColor: BODY },
    supporting: { bar: print ? '0.6mm' : 1, title: print ? 10 : 14, titleWeight: 300, pillFont: print ? 7 : 10, copyFont: print ? 8.5 : 11.5, copyColor: MUTED },
  }[tier];
  const prominent = tier === 'feature';
  const evidence = Array.isArray(highlight.evidence) ? highlight.evidence.filter(Boolean) : [];

  return (
    <div style={{
      display: 'flex',
      gap: print ? '3mm' : 12,
      padding: print ? '0' : '14px 16px',
      background: print ? 'transparent' : '#FFFFFF',
      borderRadius: 8,
      border: print ? 'none' : `1px solid ${RULE}`,
    }}>
      <div style={{
        width: emphasis.bar,
        flexShrink: 0,
        alignSelf: 'stretch',
        background: prominent ? INK : RULE,
        borderRadius: 2,
      }} />

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}>
          <div style={{
            fontFamily: FONT_HEADING,
            fontSize: emphasis.title,
            fontWeight: emphasis.titleWeight,
            color: INK,
            letterSpacing: '0.01em',
            lineHeight: 1.2,
          }}>
            {highlight.title}
          </div>
          {highlight.category && (
            <div style={{
              fontFamily: FONT_BODY,
              fontSize: print ? 7.5 : 9.5,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: MUTED,
              whiteSpace: 'nowrap',
            }}>
              {highlight.category}
            </div>
          )}
        </div>

        {evidence.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: print ? '1.6mm' : 6,
            marginTop: print ? '2mm' : 7,
          }}>
            {evidence.map((item, index) => (
              <EvidencePill
                key={`${highlight.id}-evidence-${index}`}
                item={item}
                print={print}
                fontSize={emphasis.pillFont}
              />
            ))}
          </div>
        )}

        <div style={{
          marginTop: print ? '2mm' : 7,
          fontFamily: FONT_BODY,
          fontSize: emphasis.copyFont,
          lineHeight: 1.45,
          color: emphasis.copyColor,
        }}>
          {highlight.explanation}
        </div>
      </div>
    </div>
  );
}