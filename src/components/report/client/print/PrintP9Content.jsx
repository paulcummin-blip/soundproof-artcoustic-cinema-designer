/**
 * PrintP9Content
 * -------------
 * Print-only P9 page content: heading + side-section drawing + result summary.
 *
 * The drawing is the shared P9SideSectionDrawing — the same true room section the
 * screen page shows, built from the same published P9 snapshot geometry — so the
 * printed page and the on-screen page can never disagree. It is the primary
 * scaling authority for the drawing region: it scales via CSS, not via a JS
 * transform on the whole card.
 *
 * Screen behaviour: this component is only rendered inside a print-only
 * container (client-report-print-only) and is never visible on screen.
 */

import React from "react";
import { resolveGradeToken } from "@/components/utils/rp22Colors";
import P9SideSectionDrawing from "@/components/report/client/P9SideSectionDrawing";
import { buildP9SideSection } from "@/components/report/client/p9SideSectionGeometry";

// ── Status copy (frozen — matches ClientSoundAboveListener) ───────────────
const STATUS_COPY = {
  L4: { label: "Overhead Speaker Spacing", explanation: "Maximum vertical angle between adjacent height speakers." },
  L3: { label: "Overhead Speaker Spacing", explanation: "Maximum vertical angle between adjacent height speakers." },
  L2: { label: "Overhead Speaker Spacing", explanation: "Maximum vertical angle between adjacent height speakers." },
  L1: { label: "Overhead Speaker Spacing", explanation: "Maximum vertical angle between adjacent height speakers." },
  Fail: { label: "Overhead Speaker Spacing", explanation: "Maximum vertical angle between adjacent height speakers." },
  "N/A": { label: "Single Overhead Row", explanation: "This layout uses one overhead row, so spacing between rows is not assessed." },
  "—": { label: "Overhead Speaker Spacing", explanation: "Maximum vertical angle between adjacent height speakers." },
};

function getStatusInfo(level) {
  const base = STATUS_COPY[level] || STATUS_COPY["—"];
  const { token } = resolveGradeToken(level);
  return { ...base, color: token.border, tokenBg: token.bg, tokenText: token.text, tokenSolid: token.solid };
}

function normaliseClientLevel(level) {
  const raw = String(level ?? "").trim().toUpperCase();
  if (/^[1-4]$/.test(raw)) return `L${raw}`;
  if (/^L[1-4]$/.test(raw)) return raw;
  if (raw === "N/A" || raw === "NA") return "N/A";
  return "—";
}

export default function PrintP9Content({ p9Snapshot, roomDims }) {
  // Built only from the published P9 snapshot's own geometry: the real RSP and
  // the real overhead row positions. Nothing is projected or repositioned.
  const sideSection = buildP9SideSection({ p9Snapshot, roomDims });

  const displayLevel = normaliseClientLevel(p9Snapshot?.level);
  const value = p9Snapshot?.value;
  const statusInfo = getStatusInfo(displayLevel);
  const displayExplanation = statusInfo.explanation;

  if (!p9Snapshot) return null;

  return (
    <>
      {/* ── Heading ── */}
      <div className="client-report-print-heading">
        <h1 className="client-report-print-heading__title">Spatial Resolution</h1>
        <p className="client-report-print-heading__subtitle">RP22 Parameter 9 — Overhead speaker spacing</p>
      </div>

      {/* ── Drawing: real room section, P9 angles measured from the RSP ── */}
      <div className="client-report-print-drawing">
        {sideSection && (
          <P9SideSectionDrawing
            geometry={sideSection}
            levelLabel={displayLevel}
            className="client-report-print-svg"
          />
        )}
      </div>

      {/* ── Result ── */}
      <div className="client-report-print-result" style={{ borderColor: `${statusInfo.color}40` }}>
        <div className="client-report-print-result__badge" style={{
          borderColor: statusInfo.color,
          background: statusInfo.tokenBg,
          color: statusInfo.tokenText,
        }}>
          {displayLevel}
        </div>
        <div className="client-report-print-result__content">
          <div className="client-report-print-result__label">{statusInfo.label}</div>
          <div className="client-report-print-result__explanation">{displayExplanation}</div>
          {Number.isFinite(value) && (
            <div className="client-report-print-result__supporting">
              {Math.round(value)}° largest gap — RP22 Parameter 9
            </div>
          )}
        </div>
      </div>
    </>
  );
}