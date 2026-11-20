/**
 * LiveRP22PerformanceSummary.jsx
 * -----------------------------
 * Live Room Designer presentation of every currently-calculated RP22
 * parameter, grouped under the three RP22 pillar headings:
 *   Spatial Resolution  (P1–P11)
 *   Dynamic Range       (P12–P16)
 *   Timbre Matching      (P17–P21)
 *
 * This is a LIVE presentation only. It consumes the SAME live compliance
 * summary the Room Designer's "Live RP22 Analysis" panel already builds
 * (buildLiveComplianceSummary — a read-only projection of the live
 * useRP22AnalysisEngine result + verified bass authority into the
 * engineeringSummary shape). No RP22 calculation, threshold or grading is
 * duplicated or altered here: every level, value and formatted string is the
 * engine's own output.
 *
 * It never requires a minimum speaker configuration, a completed bass analysis
 * or a finished design: a parameter whose inputs do not yet exist resolves to
 * "Not assessed" / "—" and is never described as failed or Level 1.
 *
 * It introduces NO overall RP22 level, pillar score or alternative scoring
 * formula. The Artcoustic System Design Rating (ASDR) remains a separate
 * surface in the sidebar.
 */
import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { firstStatedPrimitive } from "@/components/utils/renderSafe";
import {
  PARAM_CATEGORIES,
  PARAM_CATEGORY_COLOURS,
  getHumanTitleForParam,
} from "@/components/report/technical/technicalParameterMeta";
import {
  RP22_PRESENTATION_PARAMETERS,
  isSeatScopedParameterKey,
} from "@/components/utils/rp22ParameterPresentation";
import {
  ASSUMED_P15_OPTIONS,
  ASSUMED_P21_OPTIONS,
} from "@/components/utils/assumedParameterAuthority";
import { requestAssumedLevelChange } from "@/components/state/assumedLevelStore";

const PILLAR_ORDER = ["Spatial Resolution", "Dynamic Range", "Timbre Matching"];

const isSeatParam = (id) => isSeatScopedParameterKey(`p${id}`);

// ── Value extraction (room / RSP scope) ─────────────────────────────────────
const roomAchievedValue = (roomResult) => firstStatedPrimitive(
  [roomResult?.formatted, roomResult?.hudLabel, roomResult?.value],
  null,
);

// ── Presentation status → display label ─────────────────────────────────────
const NOT_ASSESSED_LABEL = "Not assessed";

const statusLabel = (presentationStatus, level, seatAllNa) => {
  if (presentationStatus === "not_applicable" || seatAllNa) return "N/A";
  if (level) return null; // a real level needs no status line
  if (presentationStatus === "assumed") return "Assumed";
  return NOT_ASSESSED_LABEL;
};

// ── Per-seat pill grid for a seat-scoped parameter ──────────────────────────
// One centred row per seating row, so the seating pattern reads at a glance.
// Primary seats carry a thicker, bolder outline; secondary seats a lighter one
// — the same distinction the Plan View uses, applied to the pill frame only.
// No seating geometry, priority logic or calculation is changed here.
const SEAT_GAP = 5;
const ROW_GAP = 5;

function SeatPillGrid({ rows }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: ROW_GAP }}>
      {rows.map((rowObj) => (
        <div
          key={`row-${rowObj.row}`}
          style={{
            display: "flex",
            flexWrap: "nowrap",
            justifyContent: "center",
            alignItems: "center",
            gap: SEAT_GAP,
          }}
        >
          {(rowObj.seats || []).map((seat) => {
            const isPrimary = seat?.isPrimary === true;
            const titleText = `${seat?.seatId || ""}  Row ${seat?.row} Seat ${seat?.column}${isPrimary ? " (Primary)" : " (Secondary)"}${seat?.valueFormatted && seat?.valueFormatted !== "—" ? ` · ${seat.valueFormatted}` : ""}`;
            return (
              <span
                key={seat?.seatId || `${rowObj.row}-${seat?.column}`}
                title={titleText}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "0 0 auto",
                  borderRadius: 6,
                  boxShadow: isPrimary
                    ? "0 0 0 2px rgba(33,52,40,0.55)"
                    : "0 0 0 1px rgba(98,81,67,0.30)",
                }}
              >
                <RP22GradingPill level={seat?.level || "—"} />
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Compact inline L1–L4 selector for editable assumed parameters ──────────
function AssumedLevelSelector({ paramId, currentLevel, onSelect }) {
  const options = paramId === 15 ? ASSUMED_P15_OPTIONS : ASSUMED_P21_OPTIONS;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
      {options.map((opt) => {
        const selected = opt.level === currentLevel;
        return (
          <button
            key={opt.level}
            type="button"
            onClick={() => onSelect(opt.level)}
            title={opt.sublabel}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              padding: "2px 6px 2px 2px",
              borderRadius: 9999,
              border: selected ? "1.5px solid #213428" : "1px solid #DCDBD6",
              background: selected ? "rgba(33,52,40,0.06)" : "transparent",
              cursor: "pointer",
            }}
          >
            <RP22GradingPill level={opt.level} />
            <span style={{
              fontSize: 9,
              fontWeight: 600,
              color: selected ? "#213428" : "#9B8E82",
              whiteSpace: "nowrap",
            }}>
              {opt.sublabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── One parameter row ───────────────────────────────────────────────────────
function ParameterRow({ param, summary, pillarColour }) {
  const pid = param.id;
  const key = `p${pid}`;
  const seatScoped = isSeatParam(pid);
  const isAssumedParam = pid === 15 || pid === 21;
  const [selectorOpen, setSelectorOpen] = useState(false);

  const roomResult = summary?.roomResultsByParameter?.[pid] || null;
  const presentationStatus =
    summary?.project?.compliance?.byParameter?.[key]?.presentationStatus || null;

  const seatRows = seatScoped
    ? (summary?.reportCounts?.seatResultRowsByParameter?.[key] || [])
    : [];
  const seatResults = seatScoped
    ? (summary?.reportCounts?.seatResultsByParameter?.[key] || [])
    : [];
  const seatHasAnyLevel = seatScoped
    && seatResults.some((r) => r?.level && r.level !== "—");
  const seatAllNa = seatScoped
    && seatResults.length > 0
    && seatResults.every((r) => r?.level === "N/A");

  const level = seatScoped
    ? (summary?.parameterSummaries?.project?.[key]?.level || null)
    : (roomResult?.level || null);
  const achieved = seatScoped ? null : roomAchievedValue(roomResult);
  const status = statusLabel(presentationStatus, level, seatAllNa);

  const title = getHumanTitleForParam(pid);
  const scopeTag = seatScoped ? "Seat" : (param.scope || "Room");

  const handleSelect = (selectedLevel) => {
    setSelectorOpen(false);
    requestAssumedLevelChange(pid, selectedLevel);
  };

  return (
    <div
      style={{
        borderTop: "1px solid #F0EFEA",
        padding: "10px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1B1A1A", lineHeight: 1.25 }}>
            P{pid}. {title}
          </div>
          <div style={{ fontSize: 10, color: "#9B8E82", marginTop: 2, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {scopeTag}
          </div>
        </div>

        {!seatScoped && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
            {achieved != null && (
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#213428",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}>
                {achieved}
              </span>
            )}
            {isAssumedParam ? (
              <button
                type="button"
                onClick={() => setSelectorOpen((o) => !o)}
                title="Click to change the assumed level"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: 2,
                  borderRadius: 9999,
                  border: selectorOpen ? "1.5px solid #213428" : "1px solid transparent",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                <RP22GradingPill level={level || "—"} />
              </button>
            ) : (
              <RP22GradingPill level={level || (seatAllNa ? "N/A" : "—")} />
            )}
          </div>
        )}
      </div>

      {isAssumedParam && selectorOpen && !seatScoped && (
        <AssumedLevelSelector
          paramId={pid}
          currentLevel={level || "L2"}
          onSelect={handleSelect}
        />
      )}

      {seatScoped && (
        <div style={{ marginTop: 8 }}>
          {seatHasAnyLevel ? (
            <SeatPillGrid rows={seatRows} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: "#9B8E82", fontStyle: "italic" }}>
                {seatAllNa ? "Not applicable to this design" : NOT_ASSESSED_LABEL}
              </span>
              <RP22GradingPill level={seatAllNa ? "N/A" : "—"} />
            </div>
          )}
        </div>
      )}

      {!seatScoped && status && (
        <div style={{ marginTop: 6, fontSize: 11, color: "#9B8E82", fontStyle: "italic" }}>
          {status === "N/A" ? "Not applicable to this design" : status}
        </div>
      )}
    </div>
  );
}

// ── Pillar section ──────────────────────────────────────────────────────────
function PillarSection({ label, colour, parameters, summary }) {
  if (!parameters.length) return null;
  return (
    <div style={{ border: "1px solid #DCDBD6", borderRadius: 8, background: "#fff", overflow: "hidden" }}>
      <div style={{
        padding: "9px 12px",
        background: colour,
        color: "#fff",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}>
        {label}
      </div>
      {parameters.map((p) => (
        <ParameterRow key={p.id} param={p} summary={summary} pillarColour={colour} />
      ))}
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────
export default function LiveRP22PerformanceSummary({
  liveSummary = null,
  assumedP15Level = null,
  assumedP21Level = null,
}) {
  // The live summary already carries the assumed P15/P21 resolution; these
  // props are accepted for interface symmetry with RP22CompliancePanel but are
  // not needed to compute any value here (no calculation is performed).
  void assumedP15Level;
  void assumedP21Level;

  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('b44_live_rp22_panel_open') !== '0'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('b44_live_rp22_panel_open', open ? '1' : '0'); } catch {}
  }, [open]);

  if (!liveSummary) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: "#625143" }}>
        Live RP22 results will appear here as the design takes shape.
      </div>
    );
  }

  const grouped = { "Spatial Resolution": [], "Dynamic Range": [], "Timbre Matching": [] };
  for (const p of RP22_PRESENTATION_PARAMETERS) {
    const pillar = PARAM_CATEGORIES[p.id];
    if (!pillar || !grouped[pillar]) continue;
    grouped[pillar].push(p);
  }

  return (
    <div style={{ border: "1px solid #DCDBD6", borderRadius: 8, background: "#fff", overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ display: "flex", alignItems: "center", gap: 4, width: "100%", textAlign: "left", cursor: "pointer", background: "transparent", border: "none", padding: "12px 16px" }}
      >
        {open
          ? <ChevronDown style={{ width: 12, height: 12, color: "#625143", flexShrink: 0 }} />
          : <ChevronRight style={{ width: 12, height: 12, color: "#625143", flexShrink: 0 }} />}
        <div style={{ fontSize: 11, fontWeight: 600, color: "#3E4349", letterSpacing: "0.04em" }}>
          LIVE RP22
          <br />
          PERFORMANCE SUMMARY
        </div>
      </button>

      {open && (
        <div style={{ display: "grid", gap: 12, padding: "0 12px 12px 12px" }}>
          {PILLAR_ORDER.map((label) => (
            <PillarSection
              key={label}
              label={label}
              colour={PARAM_CATEGORY_COLOURS[label]}
              parameters={grouped[label]}
              summary={liveSummary}
            />
          ))}
        </div>
      )}
    </div>
  );
}