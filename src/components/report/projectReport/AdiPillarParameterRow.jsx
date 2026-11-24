/**
 * AdiPillarParameterRow
 * ----------------------
 * ONE parameter inside a pillar section of the redesigned ADI Design Highlights
 * page: its RP22 number and human title, then its published result as the
 * canonical level pill(s).
 *
 * A seat-scoped parameter shows EVERY assessed seat's own level, grouped by
 * physical seating row — primary and secondary, limiting and better-performing
 * alike — so the client sees the full picture the publication states. A
 * room-scoped parameter shows its single published result; an RSP-scoped
 * parameter (P19) shows its reference-seat result.
 *
 * The level is always the shared RP22GradingPill, never plain text, so it reads as
 * the same result everywhere else in the report. Presentation only: nothing is
 * calculated, graded or inferred here.
 */

import React from 'react';
import RP22GradingPill from '@/components/ui/RP22GradingPill';
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from '@/components/report/typography/reportTypography';

const INK = '#213428';
const BODY = '#3E4349';
const MUTED = '#625143';
const RULE = '#DCDBD6';

function Pill({ level, print }) {
  return (
    <RP22GradingPill
      level={level || '—'}
      variant={print ? 'printCompact' : 'report'}
    />
  );
}

export default function AdiPillarParameterRow({ parameter, print = false }) {
  if (!parameter) return null;

  const scope = parameter.scope;
  const titleFont = print ? 9.5 : 12.5;
  const labelFont = print ? 7.5 : 9.5;
  const rowGap = print ? '1.2mm' : 5;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: print ? '1mm' : 4,
      padding: print ? '1.5mm 0' : '6px 0',
      borderBottom: `1px solid ${RULE}`,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: print ? '1.5mm' : 6,
        flexWrap: 'wrap',
      }}>
        <span style={{
          fontFamily: FONT_HEADING,
          fontSize: titleFont,
          fontWeight: 400,
          color: INK,
          letterSpacing: '0.01em',
        }}>
          {parameter.label}
        </span>
        <span style={{
          fontFamily: FONT_BODY,
          fontSize: titleFont,
          color: BODY,
          lineHeight: 1.2,
        }}>
          {parameter.title}
        </span>
        {scope === 'RSP' && (
          <span style={{
            fontFamily: FONT_BODY,
            fontSize: labelFont,
            color: MUTED,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>
            Reference seat
          </span>
        )}
      </div>

      {scope === 'Seat' && parameter.seats && parameter.seats.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          columnGap: print ? '3mm' : 12,
          rowGap: rowGap,
          marginTop: print ? '0.5mm' : 2,
        }}>
          {parameter.seats.map((row) => (
            <div
              key={row.label}
              style={{ display: 'flex', alignItems: 'center', gap: print ? '0.8mm' : 4 }}
            >
              <span style={{
                fontFamily: FONT_BODY,
                fontSize: labelFont,
                color: MUTED,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}>
                {row.label}
              </span>
              {row.seats.map((seat, i) => (
                <Pill key={`${row.label}-${seat.seatId || i}`} level={seat.level} print={print} />
              ))}
            </div>
          ))}
        </div>
      )}

      {scope !== 'Seat' && parameter.room && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: print ? '1.5mm' : 6,
          marginTop: print ? '0.5mm' : 2,
        }}>
          <Pill level={parameter.room.level} print={print} />
          {parameter.room.value && (
            <span style={{
              fontFamily: FONT_BODY,
              fontSize: labelFont,
              color: BODY,
            }}>
              {parameter.room.value}
            </span>
          )}
        </div>
      )}

      {scope !== 'Seat' && !parameter.room && (
        <div style={{
          fontFamily: FONT_BODY,
          fontSize: labelFont,
          color: MUTED,
          fontStyle: 'italic',
          marginTop: print ? '0.5mm' : 2,
        }}>
          No terminal result published
        </div>
      )}
    </div>
  );
}