/**
 * TechnicalRp23Rows
 * -----------------
 * The Technical Report's RP23 — Horizontal Viewing Angle block: one result row per
 * seating row, using the row's representative (centre) seat.
 *
 * Values come from the shared published viewing authority via
 * resolveTechnicalViewingRows — the same authority the Visual Report's Viewing
 * Experience page and the Room Designer seat pop-up read. This component only
 * presents them; it never re-grades.
 *
 * Props:
 *   representativeSeats — one representative seat per row (centre seat)
 *   engineeringSummary  — the published engineering summary
 */

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { resolveTechnicalViewingRows } from "./technicalViewingRowAuthority";

const LEVEL_THRESHOLDS = [
  { level: "L4", range: "50°–65°" },
  { level: "L3", range: "45°–70°" },
  { level: "L2", range: "40°–80°" },
  { level: "L1", range: "33°–90°" },
];

export default function TechnicalRp23Rows({ representativeSeats, engineeringSummary }) {
  const { hasAny, rows } = resolveTechnicalViewingRows({
    representativeSeats,
    engineeringSummary,
  });

  if (!hasAny) return null;

  return (
    <Card className="bg-[#FFFFFF] border-[#DCDBD6]">
      <CardHeader className="pb-2">
        <CardTitle className="text-[#1B1A1A] font-header">RP23 — Horizontal Viewing Angle</CardTitle>
        <p className="text-xs text-[#625143] mt-1">
          Representative seat per row (centre seat of each row) · target range 50°–65° (L4)
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.rowNumber}
              className="flex items-center justify-between gap-3 py-1.5 border-b border-[#F0EFEA] last:border-0"
            >
              <span className="text-sm text-[#3E4349] font-medium whitespace-nowrap">Row {row.rowNumber}</span>
              <span className="text-xs text-[#625143] flex-1 truncate" title={`Representative seat: ${row.seatLabel}`}>
                Representative seat: {row.seatLabel}
              </span>
              <div className="flex items-center gap-3 whitespace-nowrap">
                <span className="text-sm font-bold text-[#1B1A1A]">{row.angleFormatted}</span>
                <RP22GradingPill level={row.level || "—"} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #E8E6E1' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              textAlign: 'center',
              fontSize: 12,
              color: '#6F6B64',
            }}
          >
            {LEVEL_THRESHOLDS.map((threshold) => (
              <div key={threshold.level}>
                <div style={{ fontWeight: 600 }}>{threshold.level}</div>
                <div>{threshold.range}</div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}