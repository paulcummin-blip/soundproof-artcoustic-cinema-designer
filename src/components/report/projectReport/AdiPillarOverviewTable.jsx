/**
 * AdiPillarOverviewTable
 * ----------------------
 * The compact RP22 Performance Overview table at the foot of the redesigned ADI
 * Design Highlights page: the three RP22 pillars (Spatial Resolution, Dynamic
 * Range, Timbre Matching) with a Primary Seating and Secondary Seating level
 * pill each.
 *
 * Each pill reports the WORST valid assessed RP22 level within that pillar for
 * the relevant seating group — the limiting level. It reuses the SAME
 * limiting-performance authority the restored RP22 Performance Overview in the
 * System Designer uses (buildPillarOverview), projected from the published
 * engineering summary, so no calculation, threshold or grading is duplicated.
 *
 * Scope is preserved in the projection:
 *   Seat-scoped  → worst level among the relevant seat group.
 *   Room-scoped   → counts for both groups (room-wide, never RSP-only).
 *   RSP-scoped (P19) → Primary group only, never attributed to secondary.
 * A pillar with no assessed parameter for a group renders a neutral dash.
 *
 * Presentation only. Print-friendly: uses the printCompact pill variant.
 */

import React from 'react';
import RP22GradingPill from '@/components/ui/RP22GradingPill';
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from '@/components/report/typography/reportTypography';
import {
  PARAM_CATEGORY_COLOURS,
} from '@/components/report/technical/technicalParameterMeta';
import { PILLAR_ORDER } from '@/components/rp22/performanceOverviewPillarLimits';

const INK = '#213428';
const MUTED = '#625143';
const RULE = '#DCDBD6';

const DASH = '—';

export default function AdiPillarOverviewTable({ overview = null, print = false }) {
  if (!overview) return null;

  const labelFont = print ? 8 : 10;
  const headerFont = print ? 7 : 8.5;
  const cellPad = print ? '1.2mm 1mm' : '5px 4px';

  return (
    <div style={{
      marginTop: print ? '3mm' : 14,
      borderTop: `2px solid ${INK}`,
      paddingTop: print ? '2mm' : 8,
    }}>
      <div style={{
        fontFamily: FONT_HEADING,
        fontSize: print ? 10 : 13,
        fontWeight: 400,
        color: INK,
        letterSpacing: '0.02em',
        marginBottom: print ? '1.5mm' : 6,
      }}>
        RP22 Performance Overview
      </div>
      <div style={{
        fontFamily: FONT_BODY,
        fontSize: labelFont,
        color: MUTED,
        marginBottom: print ? '1.5mm' : 6,
      }}>
        Each pill shows the worst assessed level in that pillar for the seating group.
      </div>

      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontFamily: FONT_BODY,
        fontSize: labelFont,
      }}>
        <thead>
          <tr>
            <th style={{
              textAlign: 'left',
              padding: cellPad,
              fontFamily: FONT_BODY,
              fontSize: headerFont,
              fontWeight: 700,
              color: MUTED,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              borderBottom: `1px solid ${RULE}`,
            }}>
              Pillar
            </th>
            <th style={{
              textAlign: 'center',
              padding: cellPad,
              fontFamily: FONT_BODY,
              fontSize: headerFont,
              fontWeight: 700,
              color: MUTED,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              borderBottom: `1px solid ${RULE}`,
            }}>
              Primary
            </th>
            <th style={{
              textAlign: 'center',
              padding: cellPad,
              fontFamily: FONT_BODY,
              fontSize: headerFont,
              fontWeight: 700,
              color: MUTED,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              borderBottom: `1px solid ${RULE}`,
            }}>
              Secondary
            </th>
          </tr>
        </thead>
        <tbody>
          {PILLAR_ORDER.map((pillar) => {
            const data = overview[pillar] || { primary: {}, secondary: {} };
            const colour = PARAM_CATEGORY_COLOURS[pillar] || INK;
            const primaryLevel = data.primary?.level || null;
            const secondaryLevel = data.secondary?.level || null;
            return (
              <tr key={pillar}>
                <td style={{
                  padding: cellPad,
                  borderBottom: `1px solid ${RULE}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: print ? '1.5mm' : 6 }}>
                    <span style={{
                      display: 'inline-block',
                      width: print ? '1.5mm' : 6,
                      height: print ? '1.5mm' : 6,
                      borderRadius: 9999,
                      background: colour,
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontFamily: FONT_HEADING,
                      fontSize: labelFont,
                      color: INK,
                      whiteSpace: 'nowrap',
                    }}>
                      {pillar}
                    </span>
                  </div>
                </td>
                <td style={{
                  textAlign: 'center',
                  padding: cellPad,
                  borderBottom: `1px solid ${RULE}`,
                }}>
                  <RP22GradingPill
                    level={primaryLevel || DASH}
                    variant={print ? 'printCompact' : 'report'}
                  />
                </td>
                <td style={{
                  textAlign: 'center',
                  padding: cellPad,
                  borderBottom: `1px solid ${RULE}`,
                }}>
                  <RP22GradingPill
                    level={secondaryLevel || DASH}
                    variant={print ? 'printCompact' : 'report'}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}