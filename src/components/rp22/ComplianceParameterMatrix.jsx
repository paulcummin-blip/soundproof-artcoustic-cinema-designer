// Compact, scannable Compliance Report matrix with expandable per-parameter detail.
// Pure presentation — all levels, values, per-seat pills and detail cards come from
// callbacks supplied by the parent (RP22CompliancePanel), so no RP22/RP23 calculation
// or bass-readiness logic lives here.
import React, { useState, useMemo } from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import SeatScopeBadge from "@/components/report/SeatScopeBadge";
import { ChevronDown } from "lucide-react";
import { getOfficialRp22Title } from "@/components/utils/rp22OfficialTitles";

const STATUS_PRESENTATION = {
  calculated: { label: "Calculated", color: "#2d7a4f" },
  assumed: { label: "Assumed", color: "#2d7a4f" },
  not_applicable: { label: "Not applicable", color: "#8B7F76" },
  not_verified: { label: "Not verified", color: "#8B7F76" },
};

const SummaryTile = ({ label, count, tone }) => (
  <div style={{ borderRadius: 6, border: "1px solid #E6E4DD", background: "#F8F8F7", padding: "5px 8px", minWidth: 0 }}>
    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#625143" }}>{label}</div>
    <div style={{ fontSize: 15, fontWeight: 700, color: tone === "fail" ? "#A7302F" : tone === "muted" ? "#8B7F76" : "#213428" }}>{count}</div>
  </div>
);

export default function ComplianceParameterMatrix({
  parameters,
  getLevelForParam,
  getValueForParam,
  renderDetailCard,
  seatCount = 0,
  summary = null,
}) {
  const [expandedId, setExpandedId] = useState(null);

  const rowsData = useMemo(
    () =>
      parameters.map((p) => {
        const lvl = getLevelForParam(p);
        const achievedValue = getValueForParam(p);
        const isSeatScope = String(p.scope || "").toLowerCase() === "seat";
        const statusKey = summary?.byParameter?.[`p${Number(p.id)}`]?.presentationStatus || "not_verified";
        const status = STATUS_PRESENTATION[statusKey] || STATUS_PRESENTATION.not_verified;
        return { p, lvl, achievedValue, isSeatScope, status };
      }),
    [parameters, getLevelForParam, getValueForParam, summary]
  );

  const publishedSummary = summary || {
    counts: { L4: 0, L3: 0, L2: 0, L1: 0, fail: 0, notVerified: 0 },
    lowestLabel: "—",
    active: 0,
    unavailable: 0,
    calculatedSeatParams: 0,
    seatParamCount: 0,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 1. Compliance Summary */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#625143", marginBottom: 6 }}>
          Compliance Summary
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(70px, 1fr))", gap: 6 }}>
          <SummaryTile label="L4" count={publishedSummary.counts.L4} />
          <SummaryTile label="L3" count={publishedSummary.counts.L3} />
          <SummaryTile label="L2" count={publishedSummary.counts.L2} />
          <SummaryTile label="L1" count={publishedSummary.counts.L1} />
          <SummaryTile label="Fail" count={publishedSummary.counts.fail} tone="fail" />
          <SummaryTile label="Not verified" count={publishedSummary.counts.notVerified} tone="muted" />
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11, color: "#625143", flexWrap: "wrap" }}>
          <span>Lowest achieved: <strong style={{ color: "#1B1A1A" }}>{publishedSummary.lowestLabel}</strong></span>
          <span>Active: <strong style={{ color: "#1B1A1A" }}>{publishedSummary.active}</strong></span>
          <span>Unavailable: <strong style={{ color: "#1B1A1A" }}>{publishedSummary.unavailable}</strong></span>
        </div>
        {publishedSummary.seatParamCount > 0 && (
          <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11, color: "#625143", flexWrap: "wrap" }}>
            <span>Calculated seat parameters: <strong style={{ color: "#1B1A1A" }}>{publishedSummary.calculatedSeatParams}</strong></span>
            <span>Seats evaluated: <strong style={{ color: "#1B1A1A" }}>{seatCount}</strong></span>
          </div>
        )}
      </div>

      {/* 2. Compact Parameter Matrix + 3. Expandable Detail */}
      <div style={{ border: "1px solid #DCDBD6", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
        <div style={{ padding: "6px 10px", background: "#F8F8F7", borderBottom: "1px solid #E6E4DD", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#625143", display: "flex", justifyContent: "space-between" }}>
          <span>Parameter</span>
          <span>Level</span>
        </div>
        {rowsData.map(({ p, lvl, achievedValue, isSeatScope, status }, idx) => {
          const isOpen = isSeatScope ? true : expandedId === p.id;
          return (
            <div key={p.id} style={{ borderTop: idx === 0 ? "none" : "1px solid #F0EFEA" }}>
              {isSeatScope ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 10px",
                    width: "100%",
                  }}
                >
                  <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1B1A1A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      P{p.id} {getOfficialRp22Title(p.id)}
                    </div>
                    <div style={{ fontSize: 10, color: "#625143", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.scope} · <span style={{ color: status.color }}>{status.label}</span>
                    </div>
                  </div>
                  <div style={{ flex: "0 0 auto" }}>
                    <SeatScopeBadge />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : p.id)}
                  aria-expanded={isOpen}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 10px",
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1B1A1A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      P{p.id} {getOfficialRp22Title(p.id)}
                    </div>
                    <div style={{ fontSize: 10, color: "#625143", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.scope} · <span style={{ color: status.color }}>{status.label}</span> · <span style={{ color: "#213428", fontWeight: 600 }}>{achievedValue}</span>
                    </div>
                  </div>
                  <div style={{ flex: "0 0 auto" }}>
                    <RP22GradingPill level={lvl} />
                  </div>
                  <div style={{ flex: "0 0 auto", color: "#625143", display: "inline-flex", alignItems: "center" }}>
                    <ChevronDown size={14} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }} />
                  </div>
                </button>
              )}
              {isOpen && (
                <div style={{ padding: "6px 10px 12px 10px", background: "#FBFAF8", borderTop: "1px solid #F0EFEA" }}>
                  {renderDetailCard(p)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}