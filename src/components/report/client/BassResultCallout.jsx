/**
 * BassResultCallout
 * -----------------
 * The short P18 result statement for the Visual Report, shown directly above
 * the extension scale so the result reads at a glance.
 *
 * It states the same achieved extension and RP22 level the section already
 * carries — read from the canonical bass authority, never re-graded here.
 * Screen preview and PDF share it, at two sizes.
 */

import React from "react";

import {
  REPORT_FONT_HEADING as HEADING_FONT,
  REPORT_FONT_BODY as BODY_FONT,
} from '@/components/report/typography/reportTypography';
import { SOUND_PROOF_GREEN } from "./BassExtensionScale";

export default function BassResultCallout({ achievedHz, achievedLevel, variant = "screen" }) {
  const hz = Number(achievedHz);
  const hasHz = Number.isFinite(hz) && hz > 0;
  const levelMatch = String(achievedLevel ?? "").match(/([1-4])/);
  const levelNumber = levelMatch ? levelMatch[1] : null;

  const value = [
    hasHz ? `${Math.floor(hz)} Hz` : null,
    levelNumber ? `Level ${levelNumber}` : null,
  ].filter(Boolean).join(" · ");

  if (!value) return null;

  const isPrint = variant === "print";

  return (
    <div style={{
      display: "inline-flex",
      flexDirection: "column",
      gap: isPrint ? 2 : 4,
      minWidth: isPrint ? 150 : 170,
      marginTop: isPrint ? 12 : 16,
      padding: isPrint ? "10px 16px" : "12px 20px",
      background: "#F8F8F7",
      border: "1px solid #DCDBD6",
      borderLeft: `3px solid ${SOUND_PROOF_GREEN}`,
      borderRadius: 8,
      boxSizing: "border-box",
    }}>
      <div style={{
        fontSize: isPrint ? 9 : 10,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "#625143",
        fontFamily: BODY_FONT,
      }}>
        P18 result
      </div>
      <div style={{
        fontSize: isPrint ? 18 : 22,
        fontWeight: 600,
        lineHeight: 1.1,
        color: "#213428",
        fontFamily: HEADING_FONT,
      }}>
        {value}
      </div>
    </div>
  );
}