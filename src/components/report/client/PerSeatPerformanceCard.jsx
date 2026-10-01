/**
 * PerSeatPerformanceCard
 * ----------------------
 * One compact seat card for the Visual Report's Per-Seat Performance section:
 * the seat's identity in the seating plan, its priority, and its published
 * RP22 / RP23 levels as pills with the metric value beside each one.
 *
 * The report version of the Room Designer seat pop-up — same authority, same
 * presenters — laid out far more tightly because many cards sit side by side.
 *
 * The card takes its width, padding, type and row rhythm from the section's
 * layout authority (perSeatCardLayout), so a 4-seat cinema gets large, generous
 * cards and a 12-seat cinema gets smaller, denser ones — by the same rules, in
 * the preview and in the PDF alike. At the densest tier the level pills stay
 * (they ARE the result) while the numeric value beside them is dropped.
 *
 * Presentation only: every level and value arrives already published. Nothing
 * here grades, measures or recomputes.
 *
 * Seat PRIORITY drives the outline: a Primary seat carries a heavy outline, a
 * Secondary seat a light one. The reference seating position is marked with its
 * own RSP chip and is never presented as a Primary seat.
 *
 * Props:
 *   seat   — { label, priority, isRsp, rp23, parameters, spl } from
 *            selectClientPerSeatPerformance
 *   layout — from resolveSeatRowLayout: card width, gap and tier metrics
 *   print  — print (PDF) context: slightly tighter outline weight
 */

import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { CARD_TIERS } from "./perSeatCardLayout";

const FONT_BODY = "Didact Gothic, Century Gothic, sans-serif";

// Outline weights: Primary heavy, Secondary light. Identical on screen and in
// the PDF, so a printed card cannot change what the seat's priority looks like.
const OUTLINE = {
  primary: { screen: 2.5, print: 2 },
  secondary: { screen: 1, print: 0.8 },
};
const OUTLINE_COLOR = { primary: "#213428", secondary: "#D9D5CE" };

const PRIORITY_LABEL = { primary: "Primary", secondary: "Secondary" };

function Badge({ text, tone, card, print }) {
  const style = tone === "primary"
    ? { background: "#213428", color: "#FFFFFF", border: "1px solid #213428" }
    : tone === "rsp"
    ? { background: "#F1F0EE", color: "#625143", border: "1px solid #B9AE9F" }
    : { background: "#FFFFFF", color: "#625143", border: "1px solid #D9D5CE" };
  return (
    <span style={{
      ...style,
      borderRadius: 3,
      padding: `${card.badgePaddingY}px ${card.badgePaddingX}px`,
      fontSize: print ? card.badgeSize - 0.5 : card.badgeSize,
      fontWeight: 700,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      lineHeight: 1.4,
      whiteSpace: "nowrap",
    }}>
      {text}
    </span>
  );
}

export default function PerSeatPerformanceCard({ seat, layout, print }) {
  if (!seat) return null;

  const tier = layout?.tier || CARD_TIERS.standard;
  const card = tier.card;
  const outline = OUTLINE[seat.priority] || OUTLINE.secondary;
  const lineSize = (size) => (print ? Math.max(7, size - 0.5) : size);

  const rows = [
    { key: "rp23", label: "RP23", ...seat.rp23 },
    ...(seat.parameters || []),
  ];

  return (
    <div
      className="per-seat-performance-card"
      style={{
        // Every card in the section shares one width, taken from the widest row
        // — so rows of different lengths still read as one seating plan, and the
        // row can never overflow the page.
        width: layout?.cardWidth || "100%",
        maxWidth: layout?.maxCardWidth || undefined,
        boxSizing: "border-box",
        border: `${print ? outline.print : outline.screen}px solid ${OUTLINE_COLOR[seat.priority] || OUTLINE_COLOR.secondary}`,
        borderRadius: Math.max(5, card.gap + 4),
        background: "#FFFFFF",
        padding: `${card.paddingTop}px ${card.paddingX}px ${card.paddingBottom}px`,
        display: "flex",
        flexDirection: "column",
        gap: card.gap,
        breakInside: "avoid",
        pageBreakInside: "avoid",
        fontFamily: FONT_BODY,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: card.headerGap }}>
        <span style={{
          fontSize: lineSize(card.labelSize),
          fontWeight: 700,
          color: "#213428",
          letterSpacing: "0.02em",
          lineHeight: 1.25,
        }}>
          {seat.label}
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          <Badge text={PRIORITY_LABEL[seat.priority] || "Secondary"} tone={seat.priority} card={card} print={print} />
          {seat.isRsp && <Badge text="RSP" tone="rsp" card={card} print={print} />}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: card.rowGap }}>
        {rows.map((row) => (
          <div key={row.key} style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            minHeight: card.rowMinHeight,
          }}>
            <span style={{
              width: card.parameterLabelWidth,
              flexShrink: 0,
              fontSize: lineSize(card.parameterLabelSize),
              fontWeight: 600,
              color: "#3E4349",
              letterSpacing: "0.02em",
            }}>
              {row.label}
            </span>
            <RP22GradingPill level={row.level} variant="compact" />
            {tier.showValues && (
              <span style={{
                marginLeft: "auto",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: lineSize(card.valueSize),
                color: "#8A7B6A",
                letterSpacing: "0.01em",
              }}>
                {row.valueText && row.valueText !== "—" ? row.valueText : ""}
              </span>
            )}
          </div>
        ))}
      </div>

      {tier.showSpl && (seat.spl || []).length > 0 && (
        <div style={{
          borderTop: "1px solid #EFEEE9",
          paddingTop: card.splPaddingTop,
          display: "flex",
          flexWrap: "wrap",
          columnGap: 6,
          rowGap: 2,
        }}>
          {(seat.spl || []).map((entry) => (
            <span key={entry.role} style={{
              fontSize: lineSize(card.splSize),
              color: "#625143",
              whiteSpace: "nowrap",
            }}>
              {entry.role} {entry.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}