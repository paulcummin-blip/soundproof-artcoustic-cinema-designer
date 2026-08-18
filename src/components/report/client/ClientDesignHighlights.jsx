/**
 * ClientDesignHighlights
 * ----------------------
 * Pure client-facing design highlights page.
 *
 * Groups supported highlights under their RP22 category headings:
 *   - Spatial Resolution
 *   - Dynamic Range
 *   - Timbre Matching
 *
 * Each highlight shows its supporting parameter reference discreetly.
 * No scores, tables, threshold details or engineering explanations.
 *
 * Works for both screen (card) and print (plain) contexts via the `print` prop.
 * In print, the "Design Highlights" page title is rendered by ClientReportPage;
 * this component renders only the category groupings and highlights.
 */

import React, { useMemo } from "react";
import { MessageCircle, Headphones, ChevronUp, Waves, Zap } from "lucide-react";
import Rp22SeatCoverageSentence from "@/components/report/Rp22SeatCoverageSentence";

const ICONS = { MessageCircle, Headphones, ChevronUp, Waves, Zap };

const CATEGORY_ORDER = ["Spatial Resolution", "Dynamic Range", "Timbre Matching"];

export default function ClientDesignHighlights({ highlights, print, recommendationFooter, coverageSentence }) {
  const grouped = useMemo(() => {
    const map = {};
    for (const h of (highlights || [])) {
      if (!map[h.category]) map[h.category] = [];
      map[h.category].push(h);
    }
    return CATEGORY_ORDER
      .filter((cat) => map[cat] && map[cat].length > 0)
      .map((cat) => ({ category: cat, items: map[cat] }));
  }, [highlights]);

  if (grouped.length === 0) return null;

  const containerStyle = print
    ? { display: "flex", flexDirection: "column", gap: 28, padding: "24px 40px" }
    : {
        display: "flex",
        flexDirection: "column",
        gap: 24,
        padding: 32,
        background: "#FFFFFF",
        borderRadius: 16,
        border: "1px solid #DCDBD6",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
      };

  const categoryHeadingStyle = print
    ? {
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "#625143",
        marginBottom: 12,
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
      }
    : {
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "#625143",
        marginBottom: 12,
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
      };

  return (
    <div style={containerStyle}>
      {!print && (
        <div style={{ marginBottom: 24 }}>
          <h1 style={{
            margin: 0,
            fontSize: 34,
            fontWeight: 300,
            color: "#213428",
            letterSpacing: "0.01em",
            fontFamily: "Futura PT Light, Century Gothic, sans-serif",
          }}>
            Design Summary
          </h1>
        </div>
      )}
      {!print && coverageSentence && (
        <div style={{ marginBottom: 20 }}>
          <Rp22SeatCoverageSentence sentence={coverageSentence} variant="screen" />
        </div>
      )}
      {grouped.map(({ category, items }) => (
        <div key={category}>
          <div style={categoryHeadingStyle}>{category}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {items.map((h) => {
              const Icon = ICONS[h.icon] || MessageCircle;
              return (
                <div key={h.id} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    background: "#21342810",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Icon style={{ width: 24, height: 24, color: "#213428" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: "#213428",
                      marginBottom: 2,
                      fontFamily: "Futura PT Light, Century Gothic, sans-serif",
                    }}>
                      {h.title}
                    </div>
                    <div style={{
                      fontSize: 10,
                      fontWeight: 500,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#625143",
                      marginBottom: 6,
                      fontFamily: "Didact Gothic, Century Gothic, sans-serif",
                    }}>
                      {h.paramRef}
                    </div>
                    <div style={{
                      fontSize: 14,
                      color: "#625143",
                      lineHeight: 1.5,
                      fontFamily: "Didact Gothic, Century Gothic, sans-serif",
                    }}>
                      {h.copy}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {recommendationFooter}
    </div>
  );
}