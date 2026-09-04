// BassPermanentSeatResults — permanently-visible P19/P20 per-seat results.
//
// PRESENTATION ONLY. A single visual seat map that mirrors the actual seating
// layout (same row/seat arrangement as the Seat Priority selector). Each seat
// appears once as a compact tile showing its P19 and P20 grade pills.
//
// Primary seats use a dark border (#1B1A1A) — the same dark colour used for
// Primary seats in the Seat Priority UI. Secondary seats use a neutral border.
// No "Primary"/"Secondary" text is written anywhere.
//
// States (keep the seat map visible in all states):
//   - No P14 target selected:  subtle "Select Bass Target" overlay
//   - Calculating:             neutral seat map (no partial results mixed in)
//   - Stale:                   neutral seat map with subtle stale treatment
//   - P14 failed / LIMITED:    "Not evaluated" — seat map visible, no pills
//   - Authoritative result:    all seat tiles populated with P19/P20 pills
//   - Never calculated:        subtle "—" placeholders
//
// Does NOT change P19/P20 calculations, grading, seat priority logic, or
// acoustic authority. Uses existing canonical seat-level results
// (buildP19SeatRows / buildP20SeatRows via formatOfficialBassResults).

import React, { useMemo } from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { formatOfficialBassResults } from "@/components/room/bass/bassResultsPresentation";
import { resolveP14TargetSelectionState } from "@/components/room/bass/p14TargetSelectionState";
import { PRIMARY } from "@/components/utils/seatPriorityAuthority";

const BODY_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

// Primary border colour — matches the dark fill used for Primary seats in the
// Seat Priority selector (#1B1A1A). Used as a BORDER here, not a fill.
const PRIMARY_BORDER = "#1B1A1A";
const SECONDARY_BORDER = "#C1B6AD";

// Compact seat label: S1, S2, … within its row (1-based column index).
function seatLabel(column) {
  return `S${column}`;
}

// Merge P19 and P20 rows into a single seat map keyed by seatId.
// Both row builders use the same seatingPositions authority, so the row/column
// geometry is identical. We merge by seatId so each tile shows both results.
function buildSeatMap(p19Rows, p20Rows) {
  const p19BySeatId = new Map();
  p19Rows.forEach((row) => row.seats.forEach((seat) => p19BySeatId.set(seat.seatId, seat)));
  const p20BySeatId = new Map();
  p20Rows.forEach((row) => row.seats.forEach((seat) => p20BySeatId.set(seat.seatId, seat)));

  // Use p19Rows as the structural authority (same as p20Rows). If p19 is empty
  // but p20 is not, fall back to p20Rows for the row structure.
  const structuralRows = p19Rows.length > 0 ? p19Rows : p20Rows;
  return structuralRows.map((row) => ({
    row: row.row,
    seats: row.seats.map((p19Seat) => {
      const p20Seat = p20BySeatId.get(p19Seat.seatId) || null;
      return {
        seatId: p19Seat.seatId,
        column: p19Seat.column,
        priority: p19Seat.priority,
        p19: p19Seat,
        p20: p20Seat,
      };
    }),
  }));
}

function hasPillValue(seatResult) {
  return seatResult && seatResult.level !== "—" && seatResult.displayVariationDb && seatResult.displayVariationDb !== "—";
}

// One compact seat tile. Shows the seat label, P19 pill, and P20 pill.
// Primary → dark border. Secondary → neutral border. No priority text.
function SeatTile({ seat, showResults }) {
  const isPrimary = seat.priority === PRIMARY;
  const borderColour = isPrimary ? PRIMARY_BORDER : SECONDARY_BORDER;
  const borderWidth = isPrimary ? "2px" : "1px";

  const p19Level = showResults ? seat.p19?.level : "—";
  const p19Value = showResults && hasPillValue(seat.p19) ? seat.p19.displayVariationDb : null;
  const p20Level = showResults ? seat.p20?.level : "—";
  const p20Value = showResults && hasPillValue(seat.p20) ? seat.p20.displayVariationDb : null;

  return (
    <div
      style={{
        border: `${borderWidth} solid ${borderColour}`,
        borderRadius: 8,
        padding: "6px 8px 7px",
        minWidth: 72,
        background: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        fontFamily: BODY_FONT,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: "#1B1A1A", lineHeight: 1 }}>
        {seatLabel(seat.column)}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 600, color: "#625143", letterSpacing: "0.02em" }}>P19</span>
          <RP22GradingPill level={p19Level} compact>{p19Level}</RP22GradingPill>
          {p19Value && (
            <span style={{ fontSize: 9, color: "#625143", tabularNums: true, fontVariantNumeric: "tabular-nums" }}>
              {p19Value}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 600, color: "#625143", letterSpacing: "0.02em" }}>P20</span>
          <RP22GradingPill level={p20Level} compact>{p20Level}</RP22GradingPill>
          {p20Value && (
            <span style={{ fontSize: 9, color: "#625143", tabularNums: true, fontVariantNumeric: "tabular-nums" }}>
              {p20Value}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SeatMap({ rows, showResults }) {
  if (!rows.length) {
    return (
      <div style={{ padding: "8px 4px", fontSize: 11, color: "#8A7B6A", fontFamily: BODY_FONT }}>
        No seats in layout.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((row) => (
        <div key={`row-${row.row}`} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 52,
              flexShrink: 0,
              fontSize: 12,
              fontWeight: 600,
              color: "#3E4349",
              fontFamily: BODY_FONT,
            }}
          >
            Row {row.row}
          </div>
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
              {row.seats.map((seat) => (
                <SeatTile key={seat.seatId} seat={seat} showResults={showResults} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Subtle state banner — keeps the seat map visible beneath it.
function StateBanner({ text }) {
  return (
    <div
      style={{
        marginBottom: 8,
        padding: "4px 10px",
        borderRadius: 6,
        border: "1px solid #DCDBD6",
        background: "#F8F8F7",
        fontSize: 11,
        fontWeight: 600,
        color: "#625143",
        letterSpacing: "0.02em",
        textAlign: "center",
        fontFamily: BODY_FONT,
      }}
    >
      {text}
    </div>
  );
}

export default function BassPermanentSeatResults() {
  const shared = useSharedBassResults();
  const authorityStatus = shared?.completedBassAuthority?.authorityStatus || "UNCALCULATED";
  const isCalculating = shared?.calculationInProgress === true;
  const hasResult = shared?.hasCurrentResult === true;
  const isStale = authorityStatus === "STALE";
  const p14Selection = resolveP14TargetSelectionState(shared?.authoritative?.requested);
  const noP14TargetSelected = p14Selection.noP14TargetSelected;

  const formatted = useMemo(() => {
    if (noP14TargetSelected || isCalculating || isStale || !hasResult) return null;
    return formatOfficialBassResults(
      shared.completedBassAuthority,
      shared.lifecycle,
      shared.seatingPositions,
      Date.now(),
      noP14TargetSelected,
      {
        p14TargetBasis: shared.authoritative?.requested?.p14TargetBasis,
        p18TargetBasis: shared.authoritative?.requested?.p18TargetBasis,
      },
    );
  }, [
    shared.completedBassAuthority,
    shared.lifecycle,
    shared.seatingPositions,
    hasResult,
    isStale,
    isCalculating,
    noP14TargetSelected,
  ]);

  const p19Rows = formatted?.p19Rows || [];
  const p20Rows = formatted?.p20Rows || [];
  const publicationVerified = formatted?.publicationVerified === true;
  const isLimited = formatted?.isLimited === true;

  const seatMap = useMemo(() => buildSeatMap(p19Rows, p20Rows), [p19Rows, p20Rows]);
  const seatCount = seatMap.reduce((sum, row) => sum + row.seats.length, 0);

  // Determine the display state. The seat map stays visible in all states;
  // only the banner text and whether pills are shown change.
  let bannerText = null;
  let showResults = false;

  if (noP14TargetSelected) {
    bannerText = "Select Bass Target";
  } else if (isCalculating) {
    bannerText = "Calculating…";
  } else if (isStale) {
    bannerText = "NEEDS RECALCULATION";
  } else if (hasResult && publicationVerified && seatCount === 0) {
    bannerText = isLimited ? "Not evaluated — P14 target unattainable" : "Not evaluated at requested operating point";
  } else if (hasResult && publicationVerified && seatCount > 0) {
    showResults = true;
  } else if (!hasResult) {
    bannerText = "NOT CALCULATED";
  }

  return (
    <div
      className="mt-3"
      aria-label="P19 and P20 per-seat results"
      style={{
        borderRadius: 10,
        border: "1px solid #E7E4DF",
        background: "#F8F8F7",
        padding: "12px 14px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#213428", fontFamily: BODY_FONT, letterSpacing: "0.01em" }}>
          Seat Results
        </span>
        <span style={{ fontSize: 10, color: "#8A7B6A", fontFamily: BODY_FONT }}>
          P19 · P20
        </span>
      </div>

      {bannerText && <StateBanner text={bannerText} />}

      {seatCount > 0 ? (
        <SeatMap rows={seatMap} showResults={showResults} />
      ) : (
        !bannerText && (
          <div style={{ padding: "8px 4px", fontSize: 11, color: "#8A7B6A", fontFamily: BODY_FONT }}>
            No seats in layout.
          </div>
        )
      )}
    </div>
  );
}