/**
 * ReportStatePanel
 * ----------------
 * Shared presentation of the canonical report states
 * (reportReadinessAuthority.js). Used by the Visual Report and available to
 * any other report surface.
 *
 * It renders the state it is given — it derives nothing and never decides
 * whether a report is ready.
 *
 * Views:
 *   not-ready  explanation, missing-item checklist, next action, no export
 *   preparing  bounded loading shell with progress
 *   failed     reason, Retry, Return to Project
 *   stale      viewing-only warning, regenerate required before export
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { REPORT_STATE } from "./reportReadinessAuthority";
import { ArrowLeft, CheckCircle2, CircleDashed, Loader2, RefreshCw, AlertTriangle, Clock } from "lucide-react";
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from "@/components/report/typography/reportTypography";

const COLORS = {
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#DCDBD6",
  muted: "#8A8580",
  warnBg: "#F7F1E6",
  warnBorder: "#E2D7BE",
  warnText: "#7A6640",
  failBg: "#F6E7E1",
  failBorder: "#E4C9BC",
  failText: "#8B4A2B",
};

const cardStyle = {
  background: COLORS.cardBg,
  borderRadius: 16,
  padding: "40px 36px",
  color: COLORS.secondary,
  fontFamily: FONT_BODY,
  boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
  border: `1px solid ${COLORS.border}`,
  maxWidth: 560,
  margin: "0 auto",
};

const headingStyle = {
  margin: 0,
  fontFamily: FONT_HEADING,
  fontSize: 20,
  fontWeight: 400,
  color: COLORS.primary,
  lineHeight: 1.25,
};

const textStyle = {
  fontSize: 14,
  color: COLORS.secondary,
  lineHeight: 1.6,
  margin: 0,
};

const primaryButtonStyle = {
  fontFamily: FONT_BODY,
  backgroundColor: COLORS.primary,
  border: `1px solid ${COLORS.primary}`,
  color: "#FFFFFF",
  whiteSpace: "nowrap",
};

const secondaryButtonStyle = {
  fontFamily: FONT_BODY,
  backgroundColor: "#F8F8F7",
  border: `1px solid ${COLORS.secondary}`,
  color: COLORS.secondary,
  whiteSpace: "nowrap",
};

function StateActions({ onReturn, onRetry, retryLabel = "Retry" }) {
  const hasActions = !!onReturn || !!onRetry;
  if (!hasActions) return null;
  return (
    <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
      {onRetry && (
        <Button type="button" onClick={onRetry} style={primaryButtonStyle}>
          <RefreshCw className="w-4 h-4 mr-2" style={{ color: "#FFFFFF", flexShrink: 0 }} />
          {retryLabel}
        </Button>
      )}
      {onReturn && (
        <Button type="button" onClick={onReturn} style={secondaryButtonStyle}>
          <ArrowLeft className="w-4 h-4 mr-2" style={{ color: COLORS.secondary, flexShrink: 0 }} />
          Return to Project
        </Button>
      )}
    </div>
  );
}

export default function ReportStatePanel({
  state,
  reportLabel = "Visual Report",
  missing = [],
  nextAction = null,
  reason = null,
  progressItems = [],
  elapsedSeconds = 0,
  onReturn,
  onRetry,
  retryLabel = "Retry",
}) {
  // ── Preparing ──────────────────────────────────────────────────────────
  if (state === REPORT_STATE.PREPARING) {
    return (
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <Loader2 className="animate-spin" style={{ color: COLORS.secondary, width: 22, height: 22 }} />
          <h2 style={headingStyle}>Preparing {reportLabel}…</h2>
        </div>
        <p style={{ ...textStyle, marginBottom: 16 }}>
          Reading the saved project state. This takes a few seconds.
        </p>
        {progressItems.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {progressItems.map((item) => (
              <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {item.done ? (
                  <CheckCircle2 style={{ color: COLORS.primary, width: 18, height: 18 }} />
                ) : item.running ? (
                  <Loader2 className="animate-spin" style={{ color: COLORS.secondary, width: 18, height: 18 }} />
                ) : (
                  <CircleDashed style={{ color: "#C4C0BA", width: 18, height: 18 }} />
                )}
                <span style={{ fontSize: 14, color: item.done ? COLORS.primary : COLORS.secondary }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        )}
        <p style={{ ...textStyle, marginTop: 16, fontSize: 12, color: COLORS.muted }}>
          {elapsedSeconds > 10
            ? "Still working. If it cannot complete, the report will return to a clear Not Ready state."
            : "If the report cannot be prepared, it will return to a clear Not Ready state."}
        </p>
      </div>
    );
  }

  // ── Failed ─────────────────────────────────────────────────────────────
  if (state === REPORT_STATE.FAILED) {
    return (
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <AlertTriangle style={{ color: COLORS.failText, width: 22, height: 22 }} />
          <h2 style={headingStyle}>{reportLabel} generation failed</h2>
        </div>
        <div style={{
          background: COLORS.failBg,
          border: `1px solid ${COLORS.failBorder}`,
          borderRadius: 8,
          padding: "12px 16px",
          fontSize: 13,
          color: COLORS.failText,
          lineHeight: 1.55,
        }}>
          {reason || "The report could not be generated."}
        </div>
        <p style={{ ...textStyle, marginTop: 16 }}>
          PDF export is disabled until the report generates successfully.
        </p>
        <StateActions onRetry={onRetry} onReturn={onReturn} retryLabel={retryLabel} />
      </div>
    );
  }

  // ── Stale ──────────────────────────────────────────────────────────────
  if (state === REPORT_STATE.STALE) {
    return (
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <Clock style={{ color: COLORS.warnText, width: 22, height: 22 }} />
          <h2 style={headingStyle}>{reportLabel} is out of date</h2>
        </div>
        <div style={{
          background: COLORS.warnBg,
          border: `1px solid ${COLORS.warnBorder}`,
          borderRadius: 8,
          padding: "12px 16px",
          fontSize: 13,
          color: COLORS.warnText,
          lineHeight: 1.55,
        }}>
          {reason || "The project has changed since this report was generated."}
        </div>
        <p style={{ ...textStyle, marginTop: 16 }}>
          You can view this report, but it must be regenerated before it is exported
          or issued to a client.
        </p>
        <StateActions onRetry={onRetry} onReturn={onReturn} retryLabel="Regenerate" />
      </div>
    );
  }

  // ── Not ready ──────────────────────────────────────────────────────────
  return (
    <div style={cardStyle}>
      <h2 style={headingStyle}>{reportLabel} not ready</h2>
      <p style={{ ...textStyle, marginTop: 12 }}>
        This project has not been fully assessed yet.
      </p>
      <p style={{ ...textStyle, marginTop: 6 }}>
        Complete the missing items below before generating the client report.
      </p>

      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        {missing.map((item) => (
          <div key={item.key} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <CircleDashed style={{ color: COLORS.secondary, width: 18, height: 18, marginTop: 2, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.primary }}>
                {item.label}
              </div>
              {item.action && (
                <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2, lineHeight: 1.5 }}>
                  Next action: {item.action}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {nextAction && (
        <div style={{
          marginTop: 20,
          paddingTop: 16,
          borderTop: `1px solid ${COLORS.border}`,
          fontSize: 13,
          color: COLORS.body,
          lineHeight: 1.55,
        }}>
          <span style={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 10, color: COLORS.muted }}>
            Next action
          </span>
          <div style={{ marginTop: 4 }}>{nextAction}</div>
        </div>
      )}

      <p style={{ ...textStyle, marginTop: 16, fontSize: 12, color: COLORS.muted }}>
        PDF export is disabled until the report is ready.
      </p>

      <StateActions onReturn={onReturn} onRetry={onRetry} retryLabel={retryLabel} />
    </div>
  );
}