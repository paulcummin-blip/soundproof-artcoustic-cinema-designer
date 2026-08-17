import React, { useState } from "react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  amber: "#625143",
};

function DiagField({ label, value, highlight, ok, warn }) {
  let color = BRAND.subtext;
  if (highlight) color = "#2C5AA0";
  if (ok) color = "#213428";
  if (warn && value > 0) color = "#B23A3A";
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 700, color: BRAND.subtext,
        textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 13, fontWeight: 600, color,
        fontFamily: typeof value === "string" && value.length > 20 ? "monospace" : "inherit",
      }}>
        {value !== null && value !== undefined ? String(value) : <span style={{ color: "#B23A3A" }}>null</span>}
      </div>
    </div>
  );
}

function formatDate(val) {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return "—";
  }
}

/**
 * Collapsible diagnostics panel — moved from the main Admin Accounts view
 * so the production Commercial Control Centre is commercial-first.
 * Retained for support/debugging use.
 *
 * Props:
 * - effectiveUser: current user object
 * - diagTotalAccounts: number
 * - diagProjects: Project[]
 * - diagLoading: boolean
 * - showSetupButton: boolean
 * - setupRunning: boolean
 * - onSetup: Function
 * - setupMessage: { type, text } | null
 */
export default function DiagnosticsPanel({
  effectiveUser,
  diagTotalAccounts,
  diagProjects,
  diagLoading,
  showSetupButton,
  setupRunning,
  onSetup,
  setupMessage,
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginBottom: 24 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", borderRadius: 8,
          border: `1px solid ${BRAND.border}`,
          background: "#fffbe6", cursor: "pointer",
          fontSize: 12, fontWeight: 700, color: BRAND.amber,
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}
      >
        <span style={{ fontSize: 14 }}>{open ? "▾" : "▸"}</span>
        Diagnostics
      </button>

      {open && (
        <div style={{
          marginTop: 10, padding: 20,
          background: "#fffbe6", border: "1px solid #e6d88a",
          borderRadius: 12,
        }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: "#625143",
            marginBottom: 14, letterSpacing: "0.04em", textTransform: "uppercase",
          }}>
            Account Ownership Diagnostics
          </div>

          {/* Current User */}
          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: BRAND.subtext,
              textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6,
            }}>
              Current User
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <DiagField label="Email" value={effectiveUser?.email} />
              <DiagField label="Role" value={effectiveUser?.role} />
              <DiagField label="account_id" value={effectiveUser?.account_id} highlight />
            </div>
          </div>

          <div style={{ height: 1, background: "#e6d88a", marginBottom: 14 }} />

          {/* Counts */}
          <div style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: BRAND.subtext,
              textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6,
            }}>
              Totals
            </div>
            {diagLoading ? (
              <span style={{ fontSize: 13, color: BRAND.subtext }}>Loading…</span>
            ) : (
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                <DiagField label="Total Accounts" value={diagTotalAccounts} />
                <DiagField label="Total Projects" value={diagProjects?.length} />
                <DiagField
                  label="Projects WITH account_id"
                  value={diagProjects?.filter(p => p.account_id).length}
                  ok
                />
                <DiagField
                  label="Projects WITHOUT account_id"
                  value={diagProjects?.filter(p => !p.account_id).length}
                  warn
                />
              </div>
            )}
          </div>

          {/* Setup action */}
          {showSetupButton && (
            <div style={{ marginTop: 16, marginBottom: 4 }}>
              <div style={{ height: 1, background: "#e6d88a", marginBottom: 14 }} />
              <div style={{
                fontSize: 11, fontWeight: 700, color: BRAND.subtext,
                textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8,
              }}>
                Initial Setup
              </div>
              <button
                onClick={onSetup}
                disabled={setupRunning}
                style={{
                  padding: "10px 20px", borderRadius: 10,
                  background: setupRunning ? "#888" : "#213428",
                  color: "#fff", border: "none",
                  fontSize: 14, fontWeight: 700,
                  cursor: setupRunning ? "not-allowed" : "pointer",
                }}
              >
                {setupRunning ? "Setting up…" : "Create Sound Proof Admin Account"}
              </button>
            </div>
          )}
          {setupMessage && (
            <div style={{
              marginTop: 10, padding: "10px 14px", borderRadius: 8,
              background: setupMessage.type === "success" ? "#eafaf1" : "#fdecea",
              border: `1px solid ${setupMessage.type === "success" ? "#a3d9b1" : "#f5c6cb"}`,
              color: setupMessage.type === "success" ? "#213428" : "#B23A3A",
              fontSize: 13, fontWeight: 500,
            }}>
              {setupMessage.type === "success" ? "✅ " : "❌ "}{setupMessage.text}
            </div>
          )}

          <div style={{ height: 1, background: "#e6d88a", marginBottom: 14, marginTop: 14 }} />

          {/* Recent Projects */}
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: BRAND.subtext,
              textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8,
            }}>
              Most Recent 5 Projects
            </div>
            {diagLoading ? (
              <span style={{ fontSize: 13, color: BRAND.subtext }}>Loading…</span>
            ) : (
              <div style={{
                background: "#FFFFFF", border: `1px solid ${BRAND.border}`,
                borderRadius: 8, overflow: "hidden",
              }}>
                <div style={{
                  display: "grid", gridTemplateColumns: "2fr 2fr 2fr 1.5fr",
                  padding: "8px 12px",
                  background: "rgb(244 243 241)",
                  borderBottom: `1px solid ${BRAND.border}`,
                  fontSize: 10, fontWeight: 700, color: BRAND.subtext,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                }}>
                  <div>Project Name</div>
                  <div>created_by_id</div>
                  <div>account_id</div>
                  <div>Created</div>
                </div>
                {diagProjects?.slice(0, 5).map((p, i) => (
                  <div key={p.id} style={{
                    display: "grid", gridTemplateColumns: "2fr 2fr 2fr 1.5fr",
                    padding: "10px 12px",
                    borderBottom: i < 4 ? `1px solid ${BRAND.border}` : "none",
                    fontSize: 12,
                  }}>
                    <div style={{ fontWeight: 600, color: BRAND.text }}>{p.name || "—"}</div>
                    <div style={{ color: BRAND.subtext, fontFamily: "monospace", fontSize: 11 }}>{p.created_by_id || "—"}</div>
                    <div style={{
                      fontFamily: "monospace", fontSize: 11,
                      color: p.account_id ? "#213428" : "#B23A3A",
                      fontWeight: p.account_id ? 600 : 400,
                    }}>
                      {p.account_id || "null"}
                    </div>
                    <div style={{ color: BRAND.subtext }}>{formatDate(p.created_date)}</div>
                  </div>
                ))}
                {(!diagProjects || diagProjects.length === 0) && (
                  <div style={{ padding: "16px 12px", color: BRAND.subtext, fontSize: 13 }}>No projects found.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}