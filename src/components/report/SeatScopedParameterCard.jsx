import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import RP22GradingPill from '@/components/ui/RP22GradingPill';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * SeatScopedParameterCard — displays a single SEAT-scoped RP22 parameter.
 *
 * The collapsed compliance row shows a neutral "SEAT" scope badge (white bg,
 * black text, subtle border, no performance colour) — never an L1/L2/L3/L4/FAIL
 * badge.  L-level badges appear only inside the expanded per-seat detail table
 * and the selected-seat result block.
 *
 * Props:
 *   param           — { id, number, title, short, scope, unit, ... }
 *   perSeatResults  — [{ seatId, seatLabel, suffix, valueFormatted, level, isRsp, isPrimary }, ...]
 *   seatCount       — total number of seats
 */
export default function SeatScopedParameterCard({ param, perSeatResults, seatCount }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [expanded, setExpanded] = useState(true); // default expanded for print

  if (!param || !Array.isArray(perSeatResults)) return null;

  const calculatedCount = perSeatResults.filter(
    (r) => r && r.level && r.level !== '—' && r.level !== 'N/A'
  ).length;
  const isCalculated = calculatedCount > 0;
  const selected = perSeatResults[selectedIdx] || perSeatResults[0];

  return (
    <Card className="border bg-white border-[#E6E4DD] h-full">
      <CardHeader className="pb-2">
        <CardTitle
          className="text-sm font-semibold text-[#1B1A1A] leading-snug"
          style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}
        >
          P{param.id} — {param.title}
        </CardTitle>
        {param.short && (
          <p className="text-xs mt-1 text-[#3E4349]">{param.short}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Collapsed summary row — neutral SEAT badge, no performance colour */}
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-[#625143]">
            Seat · {isCalculated ? 'Calculated' : 'Not Calculated'} · {seatCount} {seatCount === 1 ? 'seat' : 'seats'}
          </div>
          <span
            style={{
              border: '1px solid #D9D5CE',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 600,
              background: '#FFFFFF',
              color: '#1B1A1A',
              whiteSpace: 'nowrap',
              lineHeight: '1.2',
              letterSpacing: '0.04em',
            }}
          >
            SEAT
          </span>
        </div>

        {/* Selected seat view */}
        {selected && (
          <div className="border-t border-[#F0EFEA] pt-3 space-y-2">
            <div className="flex flex-wrap gap-1 print:hidden">
              {perSeatResults.map((result, idx) => (
                <button
                  key={result?.seatId || idx}
                  onClick={() => setSelectedIdx(idx)}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    idx === selectedIdx
                      ? 'bg-[#213428] text-white border-[#213428]'
                      : 'bg-white text-[#3E4349] border-[#DCDBD6] hover:bg-[#F0EFEA]'
                  }`}
                >
                  {result?.seatLabel || '—'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-[#625143]">Selected seat:</div>
                <div className="font-semibold text-[#1B1A1A]">
                  {selected.seatLabel}{selected.suffix ? ` ${selected.suffix}` : ''}
                </div>
              </div>
              <div>
                <div className="text-[#625143]">Result:</div>
                <div className="font-semibold text-[#1B1A1A]">
                  {selected.valueFormatted ?? '—'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#625143]">Level:</span>
              <RP22GradingPill level={selected.level || '—'} compact />
            </div>
          </div>
        )}

        {/* Expandable per-seat detail table — L badges live only here */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-[#625143] hover:text-[#1B1A1A] print:hidden"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Hide' : 'Show'} all seat results
        </button>
        {expanded && (
          <div>
            <div className="text-xs font-semibold text-[#1B1A1A] mb-1">
              P{param.id} Seat Results
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E6E4DD]">
                  <th className="text-left py-1 text-[#625143] font-medium">Seat</th>
                  <th className="text-right py-1 text-[#625143] font-medium">Result</th>
                  <th className="text-right py-1 text-[#625143] font-medium">Level</th>
                </tr>
              </thead>
              <tbody>
                {perSeatResults.map((result, idx) => (
                  <tr key={result?.seatId || idx} className="border-b border-[#F0EFEA]">
                    <td className="py-1 text-[#1B1A1A]">
                      {result?.seatLabel || '—'}{result?.suffix ? ` ${result.suffix}` : ''}
                    </td>
                    <td className="py-1 text-right text-[#3E4349]">{result?.valueFormatted ?? '—'}</td>
                    <td className="py-1 text-right">
                      <RP22GradingPill level={result?.level || '—'} compact />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}