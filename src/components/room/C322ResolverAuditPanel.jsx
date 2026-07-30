import React, { useMemo } from "react";
import { rolesForLayout, getCanonicalRole } from "@/components/utils/surroundRoleMap";
import { isRenderableSpeaker } from "@/components/room/rv/RenderPrimitives";

/**
 * C3.22 — Resolver Decision Audit Panel
 *
 * Replicates the EXACT logic from resolveActiveSpeakerLayout.js to surface
 * the runtime resolver inputs and per-speaker gating decisions.
 *
 * This panel is READ-ONLY. It does not modify rendering, filtering, projector
 * logic, speaker positions, or export logic.
 *
 * Props must mirror what SideElevation passes to useResolvedSpeakerLayout:
 *   placedSpeakers, appState, dolbyLayout, getCanonicalRoleFn, getSpeakerVisibility
 */
export default function C322ResolverAuditPanel({
  placedSpeakers,
  appState,
  dolbyLayout,
  getCanonicalRoleFn,
  getSpeakerVisibility,
}) {
  const audit = useMemo(() => {
    // --- Exact mirror of resolveActiveSpeakerLayout internals ---
    const rawSpeakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];
    const afterRenderable = rawSpeakers.filter(isRenderableSpeaker);

    const speakerSystem = appState?.speakerSystem;
    const sevenBedLayoutType = appState?.sevenBedLayoutType;

    const layoutRaw =
      speakerSystem?.dolbyLayout ??
      speakerSystem?.dolbyPreset ??
      dolbyLayout ??
      "5.1";
    const layoutKey = (typeof layoutRaw === "string" ? layoutRaw : layoutRaw?.layout || "5.1")
      .toString()
      .trim()
      .split(" ")[0]
      .split("_")[0];
    const useWidesInsteadOfRears =
      !!speakerSystem?.useWidesInsteadOfRears ||
      speakerSystem?.sevenBedLayoutType === "wides" ||
      sevenBedLayoutType === "wides" ||
      false;

    const allowedRoles = new Set(
      rolesForLayout({ dolbyLayout: layoutKey, useWidesInsteadOfRears: !!useWidesInsteadOfRears })
    );

    const overheadGlobalModel =
      appState?.overheadGlobalModel ??
      appState?.overheadState?.globalModel ??
      speakerSystem?.overheadGlobalModel ??
      null;

    const overheadsAreOff = (() => {
      const ms = String(overheadGlobalModel ?? "").trim().toLowerCase();
      return !ms || ms === "off" || ms === "none";
    })();

    const canonFn = getCanonicalRoleFn || getCanonicalRole;
    const visFn = getSpeakerVisibility || (() => true);

    // --- Per-speaker gate decision (exact resolver order) ---
    const rows = rawSpeakers.map((s) => {
      const rawRole = String(s?.role ?? "");
      const canon = canonFn(s?.role);

      // Gate 0: renderability (applied before role logic in the resolver)
      if (!isRenderableSpeaker(s)) {
        return { rawRole, canon, allowed: false, gate: "NOT_RENDERABLE", reason: "isRenderableSpeaker=false" };
      }

      // Gate 1: LFE
      if (canon === "LFE") {
        return { rawRole, canon, allowed: false, gate: "LFE", reason: "canon===LFE" };
      }

      // Gate 2: Overheads (T*)
      if (String(canon).toUpperCase().startsWith("T")) {
        if (!allowedRoles.has(canon)) {
          return { rawRole, canon, allowed: false, gate: "NOT_ALLOWED_BY_LAYOUT", reason: "not in allowedRoles" };
        }
        if (overheadsAreOff) {
          return { rawRole, canon, allowed: false, gate: "OVERHEADS_OFF", reason: "overheadsAreOff" };
        }
        return { rawRole, canon, allowed: true, gate: "VISIBLE", reason: "—" };
      }

      // Gate 3: LCR bed
      if (canon === "FL" || canon === "FC" || canon === "FR") {
        return { rawRole, canon, allowed: true, gate: "VISIBLE", reason: "LCR bed" };
      }

      // Gate 4: Bed surrounds
      if (["SL", "SR", "SBL", "SBR", "LW", "RW"].includes(canon)) {
        const ok = allowedRoles.has(canon);
        return { rawRole, canon, allowed: ok, gate: ok ? "VISIBLE" : "NOT_ALLOWED_BY_LAYOUT", reason: ok ? "—" : "not in allowedRoles" };
      }

      // Gate 5: Extra side surrounds
      if (/^(SL|SR)\d+$/.test(canon)) {
        const ok = allowedRoles.has("SL");
        return { rawRole, canon, allowed: ok, gate: ok ? "VISIBLE" : "NOT_ALLOWED_BY_LAYOUT", reason: ok ? "—" : "SL not allowed" };
      }

      // Gate 6: fallback
      const ok = visFn(s?.role, s?.model);
      return { rawRole, canon, allowed: ok, gate: ok ? "VISIBLE" : "VIS_FN_FALSE", reason: ok ? "—" : "visFn=false" };
    });

    const overheadRows = rows.filter((r) => String(r.canon || "").toUpperCase().startsWith("T"));
    const visibleOverheads = overheadRows.filter((r) => r.gate === "VISIBLE");

    return {
      layoutRaw,
      layoutKey,
      useWidesInsteadOfRears,
      allowedRoles: Array.from(allowedRoles),
      overheadGlobalModel,
      overheadsAreOff,
      speakerSystemDolbyLayout: speakerSystem?.dolbyLayout ?? null,
      speakerSystemDolbyPreset: speakerSystem?.dolbyPreset ?? null,
      appStateOverheadGlobalModel: appState?.overheadGlobalModel ?? null,
      appStateOverheadStateGlobalModel: appState?.overheadState?.globalModel ?? null,
      speakerSystemOverheadGlobalModel: speakerSystem?.overheadGlobalModel ?? null,
      rows,
      overheadRows,
      visibleOverheadCount: visibleOverheads.length,
      rawCount: rawSpeakers.length,
      afterRenderableCount: afterRenderable.length,
    };
  }, [placedSpeakers, appState, dolbyLayout, getCanonicalRoleFn, getSpeakerVisibility]);

  const gateColor = (gate) => {
    switch (gate) {
      case "VISIBLE": return "#1a7a3a";
      case "NOT_RENDERABLE": return "#a33";
      case "LFE": return "#777";
      case "NOT_ALLOWED_BY_LAYOUT": return "#c0392b";
      case "OVERHEADS_OFF": return "#c0392b";
      default: return "#c0392b";
    }
  };

  return (
    <div style={{
      width: 420, maxHeight: 460, overflow: 'auto',
      background: 'rgba(255,255,255,0.97)', border: '1px solid #213428',
      borderRadius: 4, padding: 6, fontFamily: 'monospace', fontSize: 9,
      color: '#1B1A1A', pointerEvents: 'none'
    }}>
      <div style={{ fontWeight: 700, marginBottom: 3 }}>C3.22 RESOLVER DECISION AUDIT</div>

      <div style={{ borderTop: '1px solid #ccc', margin: '3px 0' }} />
      <div style={{ fontWeight: 700, marginBottom: 2 }}>RESOLVER INPUTS</div>
      <div>dolbyLayout: {JSON.stringify(dolbyLayout)}</div>
      <div>speakerSystem.dolbyLayout: {JSON.stringify(audit.speakerSystemDolbyLayout)}</div>
      <div>speakerSystem.dolbyPreset: {JSON.stringify(audit.speakerSystemDolbyPreset)}</div>
      <div>layoutRaw: {JSON.stringify(audit.layoutRaw)}</div>
      <div>layoutKey: {JSON.stringify(audit.layoutKey)}</div>
      <div style={{ borderTop: '1px solid #ccc', margin: '3px 0' }} />
      <div>appState.overheadGlobalModel: {JSON.stringify(audit.appStateOverheadGlobalModel)}</div>
      <div>appState.overheadState.globalModel: {JSON.stringify(audit.appStateOverheadStateGlobalModel)}</div>
      <div>speakerSystem.overheadGlobalModel: {JSON.stringify(audit.speakerSystemOverheadGlobalModel)}</div>
      <div style={{ fontWeight: 700 }}>selected overheadGlobalModel: {JSON.stringify(audit.overheadGlobalModel)}</div>
      <div style={{ fontWeight: 700, color: audit.overheadsAreOff ? '#c0392b' : '#1a7a3a' }}>
        overheadsAreOff: {String(audit.overheadsAreOff)}
      </div>
      <div style={{ borderTop: '1px solid #ccc', margin: '3px 0' }} />
      <div style={{ fontWeight: 700, marginBottom: 2 }}>allowedRoles ({audit.allowedRoles.length})</div>
      <div style={{ fontSize: 8, lineHeight: '1.3' }}>{audit.allowedRoles.join(', ') || '—'}</div>

      <div style={{ borderTop: '1px solid #ccc', margin: '3px 0' }} />
      <div style={{ fontWeight: 700, marginBottom: 2 }}>
        OVERHEAD ROWS ({audit.overheadRows.length} raw · {audit.visibleOverheadCount} visible)
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8 }}>
        <thead>
          <tr style={{ background: '#eee' }}>
            <th style={{ textAlign: 'left', padding: '1px 2px' }}>RAW ROLE</th>
            <th style={{ textAlign: 'left', padding: '1px 2px' }}>CANON</th>
            <th style={{ textAlign: 'left', padding: '1px 2px' }}>ALLOWED?</th>
            <th style={{ textAlign: 'left', padding: '1px 2px' }}>GATE</th>
            <th style={{ textAlign: 'left', padding: '1px 2px' }}>REMOVED BECAUSE</th>
          </tr>
        </thead>
        <tbody>
          {audit.overheadRows.length === 0 && (
            <tr><td colSpan={5} style={{ padding: '2px', color: '#999' }}>No T* speakers in placedSpeakers</td></tr>
          )}
          {audit.overheadRows.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: '1px 2px' }}>{r.rawRole}</td>
              <td style={{ padding: '1px 2px' }}>{r.canon}</td>
              <td style={{ padding: '1px 2px', color: r.allowed ? '#1a7a3a' : '#c0392b' }}>{String(r.allowed)}</td>
              <td style={{ padding: '1px 2px', color: gateColor(r.gate), fontWeight: 700 }}>{r.gate}</td>
              <td style={{ padding: '1px 2px' }}>{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ borderTop: '1px solid #ccc', margin: '3px 0' }} />
      <div style={{ fontWeight: 700, marginBottom: 2 }}>SUMMARY</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8 }}>
        <thead>
          <tr style={{ background: '#eee' }}>
            <th style={{ textAlign: 'left', padding: '1px 2px' }}>TEST</th>
            <th style={{ textAlign: 'left', padding: '1px 2px' }}>EXPECTED</th>
            <th style={{ textAlign: 'left', padding: '1px 2px' }}>ACTUAL</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>raw placedSpeakers</td><td>21</td><td>{audit.rawCount}</td></tr>
          <tr><td>afterRenderable</td><td>21</td><td>{audit.afterRenderableCount}</td></tr>
          <tr><td>overhead T* count</td><td>6</td><td>{audit.overheadRows.length}</td></tr>
          <tr><td>visible overheads</td><td>6</td><td style={{ color: audit.visibleOverheadCount === 6 ? '#1a7a3a' : '#c0392b', fontWeight: 700 }}>{audit.visibleOverheadCount}</td></tr>
        </tbody>
      </table>
    </div>
  );
}