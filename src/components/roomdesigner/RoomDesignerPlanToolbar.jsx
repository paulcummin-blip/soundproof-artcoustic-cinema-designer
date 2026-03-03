import React from "react";
import { Switch } from "@/components/ui/switch";

export function RoomDesignerPlanToolbar({
  allowExtraSurrounds,
  extraSurroundCount,
  dolbyPreset,
  frontSubsCfg,
  rearSubsCfg,
  viewEmphasis,
  setViewEmphasis,
  overlayRelevance,
  overlays,
  setOverlays,
  enableFrontWides,
  setEnableFrontWides,
  freeMoveLcr,
  setFreeMoveLcr,
  zoomMode,
  setZoomMode,
}) {
  return (
    <div
      className="plan-toolbar"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px',
        borderBottom: '1px solid #DCDBD6',
        background: '#FFFFFF',
        zIndex: 1
      }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <strong
          style={{
            fontSize: 40,
            fontWeight: 700,
            color: "#213428",
            display: "flex",
            alignItems: "center",
            height: "100%",
            marginLeft: "12px"
          }}>

          {(() => {
           const extraN = allowExtraSurrounds ? Number(extraSurroundCount || 0) : 0;
           const parts = dolbyPreset.split('.');
           const displayMajor = (parseInt(parts[0], 10) || 0) + extraN;

           const frontCount = Number(frontSubsCfg?.count ?? 0);
           const rearCount = Number(rearSubsCfg?.count ?? 0);
           const totalSubs = frontCount + rearCount;

           const heights = parts[2] || ""; // may be missing for "5.1"

           // If there are heights, show displayMajor.sub.heights. If not, show displayMajor.sub.
           return heights ? `${displayMajor}.${totalSubs}.${heights}` : `${displayMajor}.${totalSubs}`;
          })()}
        </strong>

        <div style={{ display: "flex", gap: 6, marginLeft: 10 }}>
          {[
          { key: "plan", label: "Plan" },
          { key: "balanced", label: "Balanced" },
          { key: "controls", label: "Controls" }].
          map((b) =>
          <button
            key={b.key}
            type="button"
            onClick={() => setViewEmphasis(b.key)}
            style={{
              fontSize: 12,
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #DCDBD6",
              background: viewEmphasis === b.key ? "#213428" : "#FFFFFF",
              color: viewEmphasis === b.key ? "#FFFFFF" : "#3E4349",
              lineHeight: 1.2,
              cursor: "pointer"
            }}
            aria-pressed={viewEmphasis === b.key}>

              {b.label}
            </button>
          )}
        </div>
      </div>

      {/* PLAN TOOLS — dynamic list, only show relevant items */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 12, alignItems: 'center' }}>
        {[
        { key: 'LCR', label: 'LCR' },
        { key: 'SIDE_SURROUND', label: 'Side Surrounds' },
        { key: 'REAR_SURROUND', label: 'Rear Surrounds' },
        { key: 'OVERHEADS_2', label: 'Overheads .2' },
        { key: 'OVERHEADS_4', label: 'Overheads .4' },
        { key: 'OVERHEADS_6', label: 'Overheads .6' },
        { key: 'enableDolbyZones', label: 'Dolby Zones' }].

        filter(({ key }) => overlayRelevance[key] !== false).
        map(({ key, label }) =>
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label htmlFor={`overlay-top-${key}`} style={{ fontSize: 12, color: '#3E4349' }}>{label}</label>
              <Switch
            id={`overlay-top-${key}`}
            checked={!!overlays?.[key]}
            onCheckedChange={() => {
              setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
            }} />

            </div>
        )}

        {overlayRelevance.FRONT_WIDES &&
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label htmlFor="overlay-top-front-wides" style={{ fontSize: 12, color: '#3E4349' }}>Front Wides</label>
            <Switch
            id="overlay-top-front-wides"
            checked={!!enableFrontWides}
            onCheckedChange={(checked) => {
              setEnableFrontWides(checked);
            }} />

          </div>
        }
      </div>
      
      {/* Free Move (LCR) toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderLeft: '2px solid #213428', paddingLeft: 12 }}>
        <label htmlFor="free-move-lcr" style={{ fontSize: 12, color: '#3E4349' }}>Free Move (LCR)</label>
        <Switch
          id="free-move-lcr"
          checked={freeMoveLcr}
          onCheckedChange={setFreeMoveLcr} />
      </div>

      {/* NEW: 3-state zoom toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderLeft: '1px solid #DCDBD6', paddingLeft: 12 }}>
        <span style={{ fontSize: 12, color: '#3E4349', fontWeight: 500 }}>Zoom</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {['off', 'in', 'out'].map((mode) =>
          <button
            key={mode}
            type="button"
            onClick={() => setZoomMode(mode)}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 4,
              border: '1px solid #DCDBD6',
              background: zoomMode === mode ? '#213428' : '#FFFFFF',
              color: zoomMode === mode ? '#FFFFFF' : '#3E4349',
              cursor: 'pointer',
              fontWeight: 500
            }}>

              {mode === 'off' ? 'Off' : mode === 'in' ? '+' : '−'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}