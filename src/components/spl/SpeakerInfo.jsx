// SpeakerInfo.jsx
// ---------------------------------------------------------------------------
// The source-data info panel used on the RP22 Speaker Capability page.
//
// Built on the application's shared Radix Popover (shadcn `@/components/ui/popover`):
//   • the panel anchors directly to the (i) button (PopoverTrigger), opening
//     below it, left-aligned, and flips to above when there is no room below;
//   • it is portaled to document.body, so it renders above all page content and
//     is immune to transformed/will-change ancestors that would break a naive
//     position:fixed panel;
//   • Radix keeps it inside the viewport (collision detection + sticky edges);
//   • it opens and closes on click (Radix default), with the in-panel (x)
//     button and outside-click/Escape also closing it.
//
// The panel accepts either `rows` (a [label, value] list, used by the Artcoustic
// row) or `dataQuality` (a ReactNode, used by the competitor row's status
// section) — or both. No custom positioning, scroll listeners or narrow-screen
// modal are needed: the shared Popover handles anchoring, flipping and viewport
// fit on every screen size.

import React, { useState } from "react";
import { Info, X } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

const BRAND = {
  border: "#DCDBD6",
  soft: "#F1F0EE",
  text: "#1B1A1A",
  subtext: "#3E4349",
  hint: "#625143",
};

export default function SpeakerInfo({
  rows = null,
  sourceUrl = null,
  datasheetUrl = null,
  dataQuality = null,
  title = "Published / comparison data",
}) {
  const [open, setOpen] = useState(false);

  const hasContent = (Array.isArray(rows) && rows.length > 0) || dataQuality != null;
  if (!hasContent) return <div />;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Show source speaker data"
          style={{
            width: 26,
            height: 26,
            borderRadius: 999,
            border: `1px solid ${BRAND.border}`,
            background: "#FFF",
            color: BRAND.hint,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <Info size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        style={{
          width: 390,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          padding: 14,
          background: "#FFF",
          border: `1px solid ${BRAND.border}`,
          borderRadius: 12,
          boxShadow: "0 12px 30px rgba(0,0,0,0.14)",
          color: BRAND.text,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            style={{ border: 0, background: "transparent", cursor: "pointer", color: BRAND.hint, padding: 2, display: "inline-flex", alignItems: "center" }}
          >
            <X size={14} />
          </button>
        </div>
        {dataQuality}
        {Array.isArray(rows) && rows.length > 0 && (
          <div style={{ display: "grid", gap: 0 }}>
            {rows.map(([label, value], idx) => (
              <div
                key={`${label}-${idx}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.15fr 1fr",
                  gap: 10,
                  padding: "6px 0",
                  borderTop: idx === 0 ? 0 : `1px solid ${BRAND.soft}`,
                  fontSize: 11,
                  lineHeight: 1.35,
                }}
              >
                <div style={{ color: BRAND.subtext }}>{label}</div>
                <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{value || "—"}</div>
              </div>
            ))}
          </div>
        )}
        {(sourceUrl || datasheetUrl) && (
          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: `1px solid ${BRAND.border}`,
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              fontSize: 11,
            }}
          >
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noreferrer" style={{ color: BRAND.hint, textDecoration: "underline" }}>
                Manufacturer source
              </a>
            )}
            {datasheetUrl && (
              <a href={datasheetUrl} target="_blank" rel="noreferrer" style={{ color: BRAND.hint, textDecoration: "underline" }}>
                Datasheet
              </a>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}