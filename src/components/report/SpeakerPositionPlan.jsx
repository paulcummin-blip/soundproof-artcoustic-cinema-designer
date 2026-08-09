import React, { useMemo } from 'react';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { calculateAzimuth } from '@/components/utils/aimingUtils';

// ---------------------------------------------------------------------------
// SpeakerPositionPlan
// A print-ready installer set-out drawing for the RP22 report (Page 6).
// Adopts Page 18 drawing language: Futura PT Light headings, Didact Gothic body,
// strong room boundary, restrained dimensions, clean drawing/data separation.
// ---------------------------------------------------------------------------

const HEADING_FONT = '"Futura PT Light", "Century Gothic", sans-serif';
const BODY_FONT = '"Didact Gothic", "Century Gothic", sans-serif';

const COLORS = {
  text: '#1B1A1A',
  muted: '#625143',
  border: '#D9D5CE',
  dim: '#8b8b8b',
  headerBg: '#F5F5F5',
  altBg: '#FAFAFA',
  panelBg: '#FAFAFA',
  panelBorder: '#D3D3D3',
  divider: '#E6E4DD',
};

// Role categories for schedule ordering
const SCREEN_ROLES = ['FL', 'FC', 'FR', 'FCL', 'FCR'];
const WIDE_ROLES = ['FWL', 'FWR', 'LW', 'RW'];
const SURROUND_ROLES = ['SL', 'SR', 'SBL', 'SBR', 'LS', 'RS', 'LR', 'RR'];
const CAT_ORDER = { Screen: 0, Wides: 1, Surrounds: 2, Upper: 3, Other: 4 };

function isUpperRole(role) {
  return /^(T|U)/.test(String(role || '').toUpperCase());
}

function fmtM(v) {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(2)} m` : '—';
}

function fmtDimsMm(dims) {
  if (!dims) return '—';
  const w = Math.round(dims.widthM * 1000);
  const h = Math.round(dims.heightM * 1000);
  const d = Math.round(dims.depthM * 1000);
  return `${w} × ${h} × ${d}`;
}

function fmtDeg(deg) {
  const d = Number(deg);
  if (!Number.isFinite(d) || Math.abs(d) < 0.05) return '0°';
  return `${d > 0 ? '+' : ''}${d.toFixed(1)}°`;
}

function getSpeakerDims(model) {
  if (!model) return null;
  const meta = getSpeakerModelMeta(model);
  if (meta && !meta.notFound) {
    return {
      widthM: Number(meta.widthM) || 0,
      heightM: Number(meta.heightM) || 0,
      depthM: Number(meta.depthM) || 0,
    };
  }
  return null;
}

function categorizeRole(role) {
  const r = String(role || '').toUpperCase();
  if (SCREEN_ROLES.includes(r)) return 'Screen';
  if (WIDE_ROLES.includes(r)) return 'Wides';
  if (SURROUND_ROLES.includes(r) || /^SL\d+$/.test(r) || /^SR\d+$/.test(r)) return 'Surrounds';
  if (isUpperRole(r)) return 'Upper';
  return 'Other';
}

export default function SpeakerPositionPlan({
  projectName,
  clientName,
  planImageDataUrl,
  placedSpeakers = [],
  subwooferInstances = [],
  subwoofers = [],
  roomWidthM,
  roomLengthM,
  screenFrontPlaneM,
  projector,
  primarySeatingPosition,
  lcrAimMode,
  getSpeakerVisibility = () => true,
  dolbyLayout,
}) {
  // ── Speaker schedule rows ──────────────────────────────────────────────
  const speakerRows = useMemo(() => {
    const aim = String(lcrAimMode || 'flat').toLowerCase();
    const mlp = primarySeatingPosition;
    const rows = [];

    (Array.isArray(placedSpeakers) ? placedSpeakers : []).forEach((item) => {
      const role = String(item?.role || '').toUpperCase();
      if (!role) return;
      if (!getSpeakerVisibility(role, item?.model)) return;
      const pos = item?.position;
      if (!pos || !Number.isFinite(Number(pos.x)) || !Number.isFinite(Number(pos.y))) return;

      const x = Number(pos.x);
      const y = Number(pos.y);
      const z = Number(pos.z);

      // Compute yaw — same canonical convention as Room Designer / Page 18
      let yaw = 0;
      if (SCREEN_ROLES.includes(role)) {
        if (aim === 'angled' && mlp && Number.isFinite(mlp.x) && Number.isFinite(mlp.y)) {
          yaw = calculateAzimuth(pos, { x: mlp.x, y: mlp.y }) ?? 0;
        }
      } else {
        yaw = Number(item?.rotation_deg) || Number(item?.rotationDeg) || 0;
      }

      rows.push({
        role,
        model: item?.model || '—',
        category: categorizeRole(role),
        x,
        y,
        z,
        dims: getSpeakerDims(item?.model),
        yaw,
      });
    });

    rows.sort((a, b) => {
      if (CAT_ORDER[a.category] !== CAT_ORDER[b.category]) return CAT_ORDER[a.category] - CAT_ORDER[b.category];
      return a.role.localeCompare(b.role);
    });

    return rows;
  }, [placedSpeakers, lcrAimMode, primarySeatingPosition, getSpeakerVisibility]);

  // ── Subwoofer schedule rows ──────────────────────────────────────────────
  const subRows = useMemo(() => {
    // Prefer canonical subwooferInstances, fall back to subwoofers
    const instances = Array.isArray(subwooferInstances) && subwooferInstances.length > 0
      ? subwooferInstances.filter(s => s?.enabled !== false)
      : (Array.isArray(subwoofers) ? subwoofers : []);

    return instances.map((sub, i) => {
      const pos = sub?.position || {};
      const x = Number.isFinite(Number(pos.x)) ? Number(pos.x)
        : (Number.isFinite(Number(sub?.x)) ? Number(sub.x) : null);
      const y = Number.isFinite(Number(pos.y)) ? Number(pos.y)
        : (Number.isFinite(Number(sub?.y)) ? Number(sub.y) : null);
      const bottomH = Number(sub?.bottomHeightM) || 0;
      const dims = getSpeakerDims(sub?.model);
      const centreH = dims ? bottomH + dims.heightM / 2 : bottomH;
      const orientation = Number(sub?.rotationDeg) || Number(sub?.rotation_deg) || 0;

      return {
        label: sub?.label || sub?.id || `SUB${i + 1}`,
        model: sub?.model || '—',
        x,
        y,
        dims,
        orientation,
        bottomH,
        centreH,
      };
    }).filter(r => r.x !== null);
  }, [subwooferInstances, subwoofers]);

  // ── Projector throw (D2.1 canonical: lens to screen) ────────────────────
  const throwDistM = useMemo(() => {
    const lensY = Number(projector?.y_lens_m);
    const screenY = Number(screenFrontPlaneM);
    if (!Number.isFinite(lensY) || !Number.isFinite(screenY)) return null;
    return Math.abs(lensY - screenY);
  }, [projector, screenFrontPlaneM]);

  // ── Table helpers ────────────────────────────────────────────────────────
  const thStyle = {
    border: `1px solid ${COLORS.border}`,
    padding: '4px 6px',
    fontSize: 8,
    fontWeight: 700,
    color: COLORS.muted,
    background: COLORS.headerBg,
    textAlign: 'center',
    letterSpacing: '0.02em',
    whiteSpace: 'nowrap',
  };
  const tdStyle = {
    border: `1px solid ${COLORS.border}`,
    padding: '3px 6px',
    fontSize: 9,
    color: COLORS.text,
    textAlign: 'center',
    whiteSpace: 'nowrap',
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', background: '#FFFFFF', padding: '8mm 10mm', fontFamily: BODY_FONT, color: COLORS.text }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, borderBottom: `1.5px solid ${COLORS.text}`, paddingBottom: 5 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: HEADING_FONT, color: COLORS.text, letterSpacing: '0.01em' }}>
            SPEAKER POSITION PLAN
          </div>
          {(projectName || clientName) && (
            <div style={{ fontSize: 9, color: COLORS.muted, marginTop: 2 }}>
              {projectName && <span style={{ fontWeight: 600 }}>{projectName}</span>}
              {projectName && clientName && <span style={{ margin: '0 6px', color: COLORS.border }}>|</span>}
              {clientName && <span>{clientName}</span>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'flex-end' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 7, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Drawing</div>
            <div style={{ fontSize: 9, fontWeight: 600, color: COLORS.text }}>SP-01</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 7, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: COLORS.text }}>NOT FOR SCALING</div>
          </div>
        </div>
      </div>

      {/* ── Plan image ── */}
      <div style={{ width: '100%', border: `1px solid ${COLORS.border}`, borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
        {planImageDataUrl ? (
          <img src={planImageDataUrl} alt="Speaker position plan" style={{ width: '100%', display: 'block', maxHeight: '115mm', objectFit: 'contain' }} />
        ) : (
          <div style={{ height: '115mm', display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.muted, fontSize: 10 }}>
            Plan capture unavailable
          </div>
        )}
      </div>

      {/* ── Coordinate datum + key dimensions ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 8, color: COLORS.muted }}>
        <div>
          <strong style={{ color: COLORS.text }}>Coordinate datum:</strong>{' '}
          X = distance from left room wall · Y = distance from front room datum · Z = centre height above finished floor
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <span><strong style={{ color: COLORS.text }}>Room:</strong> {fmtM(roomWidthM)} × {fmtM(roomLengthM)}</span>
          {Number.isFinite(Number(screenFrontPlaneM)) && <span><strong style={{ color: COLORS.text }}>Screen plane:</strong> {fmtM(screenFrontPlaneM)}</span>}
          {throwDistM != null && <span><strong style={{ color: COLORS.text }}>Throw:</strong> {throwDistM.toFixed(2)} m</span>}
        </div>
      </div>

      {/* ── Speaker position schedule ── */}
      {speakerRows.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, fontFamily: HEADING_FONT, color: COLORS.text, marginBottom: 3, letterSpacing: '0.02em' }}>
            SPEAKER POSITION SCHEDULE
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 60 }}>ROLE</th>
                <th style={{ ...thStyle, width: 150, textAlign: 'left' }}>MODEL</th>
                <th style={{ ...thStyle, width: 65 }}>X</th>
                <th style={{ ...thStyle, width: 65 }}>Y</th>
                <th style={{ ...thStyle, width: 65 }}>Z</th>
                <th style={{ ...thStyle, width: 130 }}>W × H × D (mm)</th>
                <th style={{ ...thStyle, width: 65 }}>YAW</th>
              </tr>
            </thead>
            <tbody>
              {speakerRows.map((row, i) => (
                <tr key={row.role} style={{ background: i % 2 === 0 ? '#FFFFFF' : COLORS.altBg }}>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{row.role}</td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>{row.model}</td>
                  <td style={tdStyle}>{fmtM(row.x)}</td>
                  <td style={tdStyle}>{fmtM(row.y)}</td>
                  <td style={tdStyle}>{fmtM(row.z)}</td>
                  <td style={tdStyle}>{fmtDimsMm(row.dims)}</td>
                  <td style={tdStyle}>{fmtDeg(row.yaw)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Subwoofer position schedule ── */}
      {subRows.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, fontFamily: HEADING_FONT, color: COLORS.text, marginBottom: 3, letterSpacing: '0.02em' }}>
            SUBWOOFER POSITION SCHEDULE
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 60 }}>INSTANCE</th>
                <th style={{ ...thStyle, width: 140, textAlign: 'left' }}>MODEL</th>
                <th style={{ ...thStyle, width: 60 }}>X</th>
                <th style={{ ...thStyle, width: 60 }}>Y</th>
                <th style={{ ...thStyle, width: 120 }}>W × H × D (mm)</th>
                <th style={{ ...thStyle, width: 60 }}>ORIENT</th>
                <th style={{ ...thStyle, width: 70 }}>BOTTOM H</th>
                <th style={{ ...thStyle, width: 70 }}>CENTRE H</th>
              </tr>
            </thead>
            <tbody>
              {subRows.map((row, i) => (
                <tr key={row.label} style={{ background: i % 2 === 0 ? '#FFFFFF' : COLORS.altBg }}>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{row.label}</td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>{row.model}</td>
                  <td style={tdStyle}>{fmtM(row.x)}</td>
                  <td style={tdStyle}>{row.y !== null ? fmtM(row.y) : '—'}</td>
                  <td style={tdStyle}>{fmtDimsMm(row.dims)}</td>
                  <td style={tdStyle}>{fmtDeg(row.orientation)}</td>
                  <td style={tdStyle}>{fmtM(row.bottomH)}</td>
                  <td style={tdStyle}>{fmtM(row.centreH)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Notes ── */}
      <div style={{ marginTop: 'auto', paddingTop: 6, borderTop: `1px solid ${COLORS.divider}`, fontSize: 7.5, color: COLORS.muted, lineHeight: 1.5 }}>
        <div>Dimensions govern. Do not scale from drawing.</div>
        <div>All positions are generated from the current Sound Proof design.</div>
        <div>Coordinates refer to speaker/subwoofer centres unless stated otherwise.</div>
        <div>Verify final site dimensions and mounting requirements before installation.</div>
      </div>

    </div>
  );
}