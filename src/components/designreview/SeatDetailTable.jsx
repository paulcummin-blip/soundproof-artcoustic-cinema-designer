/**
 * SeatDetailTable.jsx
 * -------------------
 * Per-seat diagnostic table for SEAT-scope RP22 parameters in the Design Review
 * Parameter Explorer.
 *
 * Renders EVERY real seat with its achieved value and Performance Level:
 *
 *   | SEAT              | ACHIEVED VALUE | LEVEL |
 *   | Row 1 · Seat 1    | 6 dB          | L2    |
 *   | Row 1 · Seat 2    | 6 dB          | L2    |
 *   | Row 2 · Seat 1    | 9 dB          | L1    |
 *
 * The RSP / reference seat is identified with a neutral "RSP" tag.
 * No subjective status — only the achieved Performance Level per seat.
 */

import React from "react";
import TechnicalLevelBadge from "@/components/report/technical/TechnicalLevelBadge";

const BODY_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

export default function SeatDetailTable({ data, rspSeatId }) {
  if (!data || !data.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 100px 56px",
          gap: 8,
          padding: "5px 10px",
          fontSize: 9,
          fontWeight: 700,
          color: "#9B8E82",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          fontFamily: BODY_FONT,
          borderBottom: "1px solid #E6E4DD",
          background: "#F8F7F5",
        }}
      >
        <span>Seat</span>
        <span style={{ textAlign: "right" }}>Achieved Value</span>
        <span style={{ textAlign: "center" }}>Level</span>
      </div>

      {/* Seat rows */}
      {data.map((rowObj) =>
        (rowObj.seats || []).map((seat) => {
          const isRsp = seat.isPrimary || (rspSeatId && seat.id === rspSeatId);
          return (
            <div
              key={seat.id || `r${rowObj.row}-s${seat.indexInRow}`}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 100px 56px",
                gap: 8,
                padding: "5px 10px",
                fontSize: 11,
                color: "#3E4349",
                fontFamily: BODY_FONT,
                borderBottom: "1px solid #F0EFEA",
                alignItems: "center",
                background: isRsp ? "#F8F7F5" : "transparent",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>
                  Row {rowObj.row} · Seat {seat.indexInRow ?? "?"}
                </span>
                {isRsp && (
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      color: "#213428",
                      background: "#E6E4DD",
                      padding: "1px 5px",
                      borderRadius: 3,
                      letterSpacing: "0.04em",
                    }}
                  >
                    RSP
                  </span>
                )}
              </span>
              <span
                style={{
                  textAlign: "right",
                  color: "#213428",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {seat.value || "—"}
              </span>
              <span
                style={{
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <TechnicalLevelBadge level={seat.level} size="small" />
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}