import React from "react";
import { Switch } from "@/components/ui/switch";

export default function RoomDesignerPlanToolbar({
  allowExtraSurrounds,
  extraSurroundCount,
  dolbyPreset,
  frontSubsCfg,
  rearSubsCfg,
  overlayRelevance,
  overlays,
  setOverlays,
  enableFrontWides,
  setEnableFrontWides,
  liveImpactMode,
  setLiveImpactMode,
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
      
      {/* Live Impact dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderLeft: '1px solid #DCDBD6', paddingLeft: 12 }}>
        <span style={{ fontSize: 12, color: '#3E4349', fontWeight: 500 }}>Live Impact</span>
        <select
          value={liveImpactMode || 'summary'}
          onChange={(e) => setLiveImpactMode?.(e.target.value)}
          style={{ fontSize: 11, padding: '4px 6px', borderRadius: 4, border: '1px solid #DCDBD6', background: '#FFFFFF', color: '#3E4349', cursor: 'pointer', fontWeight: 500 }}
        >
          <option value="off">Off</option>
          <option value="summary">Summary</option>
          <option value="detailed">Detailed</option>
        </select>
      </div>

      {/* 3-state zoom toggle */}
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