/**
 * ClientDesignHighlights
 * ----------------------
 * Pure client-facing design highlights page.
 *
 * Renders a simple list of highlight items (icon + title + copy).
 * Works for both screen (card) and print (plain) contexts via the `print` prop.
 *
 * No parameter numbers, levels, scores or technical values are shown.
 */

import React from "react";
import { MessageCircle, Headphones, ChevronUp, Waves } from "lucide-react";

const ICONS = { MessageCircle, Headphones, ChevronUp, Waves };

export default function ClientDesignHighlights({ highlights, print }) {
  if (!highlights || highlights.length === 0) return null;

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

  return (
    <div style={containerStyle}>
      {highlights.map((h) => {
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
                marginBottom: 4,
                fontFamily: "Futura PT Light, Century Gothic, sans-serif",
              }}>
                {h.title}
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
  );
}