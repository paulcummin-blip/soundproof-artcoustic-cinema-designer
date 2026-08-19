import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import RP22GradingPill from '@/components/ui/RP22GradingPill';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * SeatScopedParameterCard — displays a single SEAT-scoped RP22 parameter
 * with a seat selector and an expandable per-seat detail table.
 *
 * Props:
 *   param           — { id, title, scope, unit, ... } from RP22_SEAT_PARAMETERS
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
        <p className="text-xs mt-1 text-[#3E4349]">
          Scope: <strong>SEAT</strong> • {param.unit}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary row */}
        <div className="text-xs font-medium text-[#625143]">
          Seat · {isCalculated ? 'Calculated' : 'Not Calculated'} · {seatCount} {seatCount === 1 ? 'seat' : 'seats'}
        </div>

        {/* Seat selector */}
        <div className="flex flex-wrap gap-1">
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

        {/* Selected seat result */}
        {selected && (
          <div className="flex items-center justify-between text-sm pt-2 border-t border-[#F0EFEA]">
            <div>
              <div className="text-xs text-[#625143]">
                {selected.seatLabel}{selected.suffix ? ` ${selected.suffix}` : ''}
              </div>
              <div className="font-bold text-[#1B1A1A]">
                Achieved: {selected.valueFormatted ?? '—'}
              </div>
            </div>
            <RP22GradingPill level={selected.level || '—'} />
          </div>
        )}

        {/* Expandable per-seat detail table */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-[#625143] hover:text-[#1B1A1A] print:hidden"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Hide' : 'Show'} all seat results
        </button>
        {expanded && (
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
        )}
      </CardContent>
    </Card>
  );
}