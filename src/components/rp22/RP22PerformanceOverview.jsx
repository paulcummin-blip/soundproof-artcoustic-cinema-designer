/**
 * RP22PerformanceOverview.jsx
 * ---------------------------
 * Compact sidebar panel: the three RP22 performance pillars (Spatial
 * Resolution P1–P11, Dynamic Range P12–P16, Timbre Matching P17–P21) with a
 * Primary Seating and Secondary Seating pill each. Each pill reports the
 * WORST valid assessed RP22 level within that pillar for the relevant seating
 * group — the limiting level that most needs the designer's attention.
 *
 * This is a LIVE presentation only. It consumes the SAME live compliance
 * summary the Live RP22 Performance Summary consumes (buildLiveComplianceSummary
 * → liveSummary), projected by buildPillarOverview. No RP22 calculation,
 * threshold, grading or weight is duplicated or altered here.
 *
 * Scope is preserved in the projection:
 *   Seat-scoped  → worst level among the relevant seat group.
 *   Room-scoped   → counts for both groups (room-wide, never RSP-only).
 *   RSP-scoped (P19) → Primary group only, never attributed to secondary.
 * Unassessed parameters never become L1 or FAIL — a pillar with no assessed
 * parameter for a group renders a neutral dash.
 *
 * Hovering a pill opens a Radix Popover (the same portaled, collision-aware
 * component SpeakerInfo uses) listing every parameter responsible for
 * limiting that pillar to its displayed level, with parameter number, name
 * and affected seating positions.
 *
 * The Artcoustic System Design Rating and the Live RP22 Performance Summary
 * are unchanged and remain independently collapsible alongside this panel.
 */
import React, { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import {
  PARAM_CATEGORY_COLOURS,
} from "@/components/report/technical/technicalParameterMeta";
import {
  buildPillarOverview,
  formatLimiterDetail,
  PILLAR_ORDER,
} from "@/components/rp22/performanceOverviewPillarLimits";

const GROUP_LABELS = { primary: "PRIMARY", secondary: "SECONDARY" };

// ── Hover pill with a Radix Popover listing the limiting parameters ───────────
// Shared open/close timer keeps the popover open while the pointer travels
// between the pill and the portaled content.
function LimitingPill({ level, limiters, side, align }) {
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const cancelClose = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };
  const scheduleClose = () => {
    cancelClose();
    timer.current = setTimeout(() => setOpen(false), 120);
  };
  useEffect(() => () => cancelClose(), []);

  const hasLimiters = Array.isArray(limiters) && limiters.length > 0;
  const pillLevel = level || "—";

  const content = (
    <div
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      style={{ maxWidth: 280 }}
    >
      <div style={{
        fontSize: 11, fontWeight: 700, color: "#1B1A1A",
        letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6,
      }}>
        Limiting parameter{hasLimiters && limiters.length > 1 ? "s" : ""}
      </div>
      {hasLimiters ? (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
          {limiters.map((lim) => (
            <li
              key={`${lim.paramId}-${lim.scope}`}
              style={{
                fontSize: 11.5, color: "#3E4349", lineHeight: 1.35,
                padding: "4px 6px", background: "#F7F5F1", borderRadius: 4,
              }}
            >
              {formatLimiterDetail(lim)}
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ fontSize: 11, color: "#9B8E82", fontStyle: "italic" }}>
          No assessed parameters for this pillar and seating group.
        </div>
      )}
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          onMouseEnter={() => { cancelClose(); setOpen(true); }}
          onMouseLeave={scheduleClose}
          style={{ display: "inline-flex", cursor: hasLimiters ? "help" : "default" }}
        >
          <RP22GradingPill level={pillLevel} />
        </span>
      </PopoverTrigger>
      {open && hasLimiters && (
        <PopoverContent side={side || "bottom"} align={align || "center"} sideOffset={6}>
          {content}
        </PopoverContent>
      )}
    </Popover>
  );
}

// ── One pillar row: label + Primary pill + Secondary pill ────────────────────
function PillarRow({ pillar, overview }) {
  const data = overview?.[pillar] || { primary: {}, secondary: {} };
  const colour = PARAM_CATEGORY_COLOURS[pillar] || "#213428";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            display: "inline-block", width: 6, height: 6, borderRadius: 9999,
            background: colour, flexShrink: 0,
          }} />
          <span style={{
            fontSize: 12.5, fontWeight: 600, color: "#1B1A1A",
            lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {pillar}
          </span>
        </div>
      </div>
      <LimitingPill
        level={data.primary?.level}
        limiters={data.primary?.limiters}
        side="bottom"
        align="center"
      />
      <LimitingPill
        level={data.secondary?.level}
        limiters={data.secondary?.limiters}
        side="bottom"
        align="end"
      />
    </div>
  );
}

export default function RP22PerformanceOverview({ liveSummary = null }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem("b44_rp22_overview_panel_open") !== "0"; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem("b44_rp22_overview_panel_open", open ? "1" : "0"); } catch {}
  }, [open]);

  const overview = React.useMemo(
    () => (liveSummary ? buildPillarOverview(liveSummary) : null),
    [liveSummary],
  );

  return (
    <div style={{ margin: "0 16px 12px 16px" }}>
      <div
        style={{
          padding: "12px 16px",
          background: "#FFFFFF",
          border: "1px solid #DCDBD6",
          borderRadius: 8,
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{
            display: "flex", alignItems: "center", gap: 4, width: "100%",
            textAlign: "left", cursor: "pointer", background: "transparent",
            border: "none", padding: 0,
          }}
        >
          {open
            ? <ChevronDown style={{ width: 12, height: 12, color: "#625143", flexShrink: 0 }} />
            : <ChevronRight style={{ width: 12, height: 12, color: "#625143", flexShrink: 0 }} />}
          <div style={{ fontSize: 11, fontWeight: 600, color: "#3E4349", letterSpacing: "0.04em" }}>
            RP22 PERFORMANCE
            <br />
            OVERVIEW
          </div>
        </button>

        {open && (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #ECEAE6" }}>
            {/* Column headers */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr auto auto",
              gap: 10, marginBottom: 6,
            }}>
              <div />
              <div style={groupHeaderStyle}>PRIMARY</div>
              <div style={{ ...groupHeaderStyle, textAlign: "right" }}>SECONDARY</div>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {PILLAR_ORDER.map((pillar) => (
                <PillarRow key={pillar} pillar={pillar} overview={overview} />
              ))}
            </div>
            {!overview && (
              <div style={{ marginTop: 8, fontSize: 11, color: "#9B8E82", fontStyle: "italic" }}>
                Live RP22 results will appear here as the design takes shape.
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 9.5, color: "#9B8E82", letterSpacing: "0.02em" }}>
              Each pill shows the worst assessed level in that pillar. Hover a pill for the limiting parameters.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const groupHeaderStyle = {
  fontSize: 8.5,
  fontWeight: 700,
  color: "#625143",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};