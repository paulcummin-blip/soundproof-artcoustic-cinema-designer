/**
 * RecommendationsBlock.jsx
 * ------------------------
 * Stage D — Recommendations & Products section for the Design Review workspace.
 *
 * Three parts:
 *   1. Design Recommendations — reuses TechnicalAsdrRecommendations (same
 *      presentation authority as the Technical Report, same display order).
 *   2. Products Selected — grouped line-item summary from the shared price
 *      breakdown published by the Room Designer.
 *   3. Price Breakdown — compact table with subtotal, multiplier, VAT, total.
 *
 * Does NOT mount DesignRecommendationEngine or usePriceCalculation. Reads
 * from the shared window.__ROOM_DESIGNER_ASDR__ and
 * window.__ROOM_DESIGNER_PRICE__ stores.
 */

import React, { useMemo } from "react";
import TechnicalAsdrRecommendations from "@/components/report/technical/TechnicalAsdrRecommendations";

const COLORS = {
  bg: "transparent",
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  divider: "#F0EFEA",
  muted: "#77736B",
  label: "#9B8E82",
};

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

function formatCurrency(amount, currency) {
  if (!Number.isFinite(Number(amount))) return "—";
  const sym = currency === "GBP" ? "£" : currency === "EUR" ? "€" : currency === "USD" ? "$" : "";
  return `${sym}${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function RecommendationsBlock({ asdrData, priceData }) {
  const recommendations = asdrData?.recommendations || null;
  const breakdown = priceData?.breakdown || [];
  const showPrices = !!priceData?.showPrices;
  const priceMode = priceData?.priceMode || "exVat";
  const territoryLabel = priceData?.territoryLabel || "";
  const currency = priceData?.currency || "GBP";
  const difficultyMultiplier = Number(priceData?.difficultyMultiplier) || 1.0;
  const incompletePriceCount = Number(priceData?.incompletePriceCount) || 0;

  // Group breakdown by category
  const groupedLines = useMemo(() => {
    const groups = {};
    for (const line of breakdown) {
      const cat = line.category || line.roles || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(line);
    }
    return groups;
  }, [breakdown]);

  const hasRecs = recommendations && (recommendations.isSettled || recommendations.isEvaluating);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "4px 0" }}>
      {/* Part 1: Design Recommendations */}
      <div style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: "16px 18px",
      }}>
        {hasRecs ? (
          <TechnicalAsdrRecommendations recommendations={recommendations} />
        ) : (
          <div style={{
            fontSize: 12,
            color: COLORS.muted,
            fontFamily: FONT_BODY,
            padding: "12px 0",
          }}>
            Recommendations not yet evaluated. Open the project in the Room Designer to populate.
          </div>
        )}
      </div>

      {/* Part 2: Products Selected */}
      {showPrices && breakdown.length > 0 && (
        <div style={{
          background: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          overflow: "hidden",
        }}>
          <div style={{
            padding: "10px 16px",
            fontSize: 10,
            fontWeight: 700,
            color: COLORS.secondary,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontFamily: FONT_BODY,
            borderBottom: `1px solid ${COLORS.border}`,
          }}>
            Products Selected
          </div>
          <div style={{ padding: "8px 16px" }}>
            {Object.entries(groupedLines).map(([category, lines]) => (
              <div key={category} style={{ marginBottom: 10 }}>
                <div style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: COLORS.label,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontFamily: FONT_BODY,
                  marginBottom: 4,
                }}>
                  {category}
                </div>
                {lines.map((line, i) => (
                  <div key={i} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 12,
                    padding: "3px 0",
                    fontSize: 12,
                    fontFamily: FONT_BODY,
                    color: COLORS.body,
                  }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {line.description || line.model}
                      {line.count > 1 ? ` ×${line.count}` : ""}
                    </span>
                    <span style={{
                      fontSize: 11,
                      color: line.unitPriceExVat == null ? COLORS.muted : COLORS.primary,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}>
                      {line.displaySubtotal || (line.unitPriceExVat == null ? "price not set" : "—")}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Price summary */}
          <div style={{
            borderTop: `1px solid ${COLORS.border}`,
            padding: "12px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}>
            <PriceRow label="Subtotal" value={priceData.baseTotal} muted />
            {difficultyMultiplier !== 1.0 && (
              <PriceRow label={`Difficulty multiplier ×${difficultyMultiplier.toFixed(2)}`} value={null} muted />
            )}
            {priceMode === "incVat" && Number.isFinite(Number(priceData.vatAmount)) && (
              <PriceRow label="VAT" value={formatCurrency(priceData.vatAmount, currency)} muted />
            )}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              paddingTop: 6,
              marginTop: 2,
              borderTop: `1px solid ${COLORS.divider}`,
            }}>
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                color: COLORS.primary,
                fontFamily: FONT_BODY,
              }}>
                Total ({priceMode === "incVat" ? "inc VAT" : "ex VAT"})
              </span>
              <span style={{
                fontSize: 16,
                fontWeight: 600,
                color: COLORS.primary,
                fontFamily: FONT_HEADING,
              }}>
                {priceData.finalTotal || "—"}
              </span>
            </div>
            {territoryLabel && (
              <div style={{
                fontSize: 10,
                color: COLORS.muted,
                fontFamily: FONT_BODY,
                marginTop: 2,
              }}>
                {territoryLabel} · {currency}
              </div>
            )}
            {incompletePriceCount > 0 && (
              <div style={{
                fontSize: 10,
                color: "#8B5E34",
                fontFamily: FONT_BODY,
                marginTop: 2,
              }}>
                {incompletePriceCount} item{incompletePriceCount !== 1 ? "s" : ""} with price not set
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state when no prices */}
      {!showPrices && (
        <div style={{
          background: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          padding: "16px 18px",
        }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            color: COLORS.secondary,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontFamily: FONT_BODY,
            marginBottom: 8,
          }}>
            Products Selected
          </div>
          <div style={{
            fontSize: 12,
            color: COLORS.muted,
            fontFamily: FONT_BODY,
          }}>
            Price display is not enabled. Open the project in the Room Designer to view the product selection.
          </div>
        </div>
      )}
    </div>
  );
}

function PriceRow({ label, value, muted }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: 12,
    }}>
      <span style={{
        fontSize: 11,
        color: muted ? COLORS.muted : COLORS.body,
        fontFamily: FONT_BODY,
      }}>
        {label}
      </span>
      {value != null && (
        <span style={{
          fontSize: 11,
          color: muted ? COLORS.muted : COLORS.body,
          fontFamily: FONT_BODY,
          whiteSpace: "nowrap",
        }}>
          {value}
        </span>
      )}
    </div>
  );
}