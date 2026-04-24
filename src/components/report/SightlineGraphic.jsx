import React from 'react';

// ---------------------------------------------------------------------------
// SightlineGraphic
// A print-ready side-elevation page for the RP22 report.
// ---------------------------------------------------------------------------

const PALETTE = {
  room:       '#1B1A1A',
  floor:      '#625143',
  screenFrame:'#3E4349',
  viewable:   '#213428',
  projector:  '#625143',
  sightline:  '#213428',
  beam:       '#B45309',
  eyePoint:   '#213428',
  label:      '#1B1A1A',
  subLabel:   '#625143',
  gridLine:   '#E6E4DD',
  tableBorder:'#D9D5CE',
  tableHead:  '#F8F7F4',
};

const STROKE = {
  room:      { stroke: PALETTE.room,       strokeWidth: 1.5, fill: 'none' },
  floor:     { stroke: PALETTE.floor,      strokeWidth: 1,   fill: 'none', strokeDasharray: '4 3' },
  frame:     { stroke: PALETTE.screenFrame,strokeWidth: 1,   fill: 'none' },
  viewable:  { stroke: PALETTE.viewable,   strokeWidth: 2,   fill: 'rgba(33,52,40,0.07)' },
  projBody:  { stroke: PALETTE.projector,  strokeWidth: 1,   fill: 'rgba(98,81,67,0.12)' },
  sightline: { stroke: PALETTE.sightline,  strokeWidth: 0.6, fill: 'none', strokeDasharray: '5 3', opacity: 0.7 },
  comfort:   { stroke: '#4B5563',          strokeWidth: 0.6, fill: 'none', strokeDasharray: '4 3', opacity: 0.28 },
  beam:      { stroke: PALETTE.beam,       strokeWidth: 0.8, fill: 'none', strokeDasharray: '6 2', opacity: 0.8 },
};

// Map room-space (Y=depth, Z=height) → SVG (x,y)
// Origin top-left; room front-wall is right edge; floor is bottom.
function makeTransform({ roomLengthM, roomHeightM, svgW, svgH, pad }) {
  const usableW = svgW - pad * 2;
  const usableH = svgH - pad * 2;
  const scaleX = usableW / roomLengthM;
  const scaleY = usableH / roomHeightM;
  const scale = Math.min(scaleX, scaleY);

  // Centre the drawing in the usable area
  const drawW = roomLengthM * scale;
  const drawH = roomHeightM * scale;
  const offsetX = pad + (usableW - drawW) / 2;
  const offsetY = pad + (usableH - drawH) / 2;

  // Room Y (0 = front wall, positive = rear) → SVG x (left = front, right = rear)
  // Room Z (0 = floor, positive = ceiling) → SVG y (top = ceiling, bottom = floor)
  const toX = (roomY) => offsetX + roomY * scale;
  const toY = (roomZ) => offsetY + drawH - roomZ * scale;

  return { toX, toY, scale, drawW, drawH, offsetX, offsetY };
}

function fmt1(n) { return Number.isFinite(n) ? n.toFixed(1) : '—'; }
function fmtM(n) { return Number.isFinite(n) ? `${n.toFixed(2)} m` : '—'; }

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SvgDrawing({ svgW, svgH, pad, room, screen, projector, rowData }) {
  const { roomLengthM, roomHeightM } = room;
  const {
    screenFrontPlaneY, screenBottomHeightM, screenTopHeightM,
    screenWidthM, screenHeightM, screenTotalHeightM, screenTotalWidthM,
  } = screen;

  const { toX, toY, scale } = makeTransform({ roomLengthM, roomHeightM, svgW, svgH, pad });

  // Room corners
  const rx0 = toX(0), ry0 = toY(0);
  const rx1 = toX(roomLengthM), ry1 = toY(roomHeightM);

  // Screen frame (total)
  const frameCentreZ = (screenBottomHeightM + screenTopHeightM) / 2;
  const frameHalfH = (screenTotalHeightM || (screenTopHeightM - screenBottomHeightM) + 0.16) / 2;
  const frameTop    = frameCentreZ + frameHalfH;
  const frameBottom = frameCentreZ - frameHalfH;
  const frameDepth  = (screenTotalWidthM || (screenWidthM + 0.16)) * 0.025; // thin in side view

  // Viewable image Y positions
  const vImgTop    = screenTopHeightM;
  const vImgBottom = screenBottomHeightM;

  // Projector body
  const { projectorLensX, projectorLensY, projectorLensZ,
          projectorBodyWidth, projectorBodyHeight, projectorBodyDepth } = projector;
  const bodyDepth  = projectorBodyDepth  || 0.3;
  const bodyHeight = projectorBodyHeight || 0.12;
  const pbFront = projectorLensY;
  const pbRear  = projectorLensY + bodyDepth;
  const pbBot   = projectorLensZ - bodyHeight / 2;
  const pbTop   = projectorLensZ + bodyHeight / 2;

  // Colours for rows
  const rowColors = ['#213428','#625143','#3E4349','#B45309','#1B1A1A'];
  const rowColor = (i) => rowColors[i % rowColors.length];
  const comfortAngleRad = 15 * Math.PI / 180;
  const comfortUpperTargetZ = (eyeZ, eyeY) => eyeZ + Math.tan(comfortAngleRad) * (screenFrontPlaneY - eyeY);
  const comfortLowerTargetZ = (eyeZ, eyeY) => eyeZ - Math.tan(comfortAngleRad) * (screenFrontPlaneY - eyeY);
  const comfortZoneLowerZ = screenBottomHeightM + (screenTopHeightM - screenBottomHeightM) / 6;
  const comfortZoneUpperZ = screenBottomHeightM + (screenTopHeightM - screenBottomHeightM) / 3;

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      width={svgW}
      height={svgH}
      style={{ display: 'block', fontFamily: 'sans-serif' }}
    >
      {/* Room outline */}
      <rect
        x={rx1} y={ry1}
        width={rx0 - rx1} height={ry0 - ry1}
        {...STROKE.room}
      />

      {/* Floor line */}
      <line x1={rx0} y1={ry0} x2={rx1} y2={ry0} {...STROKE.floor} />

      {/* Vertical viewing comfort guides — drawn behind sightlines */}
      {rowData.map((row, i) => {
        const ex = toX(row.eyeY);
        const ez = toY(row.eyeZ);
        const stx = toX(screenFrontPlaneY);
        const upperZ = comfortUpperTargetZ(row.eyeZ, row.eyeY);
        const lowerZ = comfortLowerTargetZ(row.eyeZ, row.eyeY);
        const upperY = toY(upperZ);
        const lowerY = toY(lowerZ);
        return (
          <g key={`comfort-${row.rowNumber}`}>
            <polygon
              points={`${ex},${ez} ${stx},${upperY} ${stx},${lowerY}`}
              fill="#4B5563"
              opacity="0.05"
            />
            <line x1={ex} y1={ez} x2={stx} y2={upperY} {...STROKE.comfort} />
            <line x1={ex} y1={ez} x2={stx} y2={lowerY} {...STROKE.comfort} />
            {i === 0 && (
              <text x={stx - 6} y={upperY - 6} fontSize={6} fill="#4B5563" opacity={0.75} textAnchor="end">
                ±15° comfort guide
              </text>
            )}
          </g>
        );
      })}

      {/* Sightlines & beam lines — drawn first so they sit behind elements */}
      {rowData.map((row, i) => {
        const ex = toX(row.eyeY);
        const ez = toY(row.eyeZ);
        const stx = toX(screenFrontPlaneY);
        const sTop = toY(vImgTop);
        const sBot = toY(vImgBottom);
        const col = rowColor(i);
        return (
          <g key={`lines-${row.rowNumber}`}>
            {/* Sightline to top */}
            <line x1={ex} y1={ez} x2={stx} y2={sTop}
              stroke={col} strokeWidth={0.7} strokeDasharray="5 3" fill="none" opacity={0.6} />
            {/* Sightline to bottom */}
            <line x1={ex} y1={ez} x2={stx} y2={sBot}
              stroke={col} strokeWidth={0.7} strokeDasharray="3 3" fill="none" opacity={0.6} />
          </g>
        );
      })}

      {/* Projector beam lines */}
      {Number.isFinite(projectorLensY) && Number.isFinite(projectorLensZ) && (
        <g>
          <line
            x1={toX(projectorLensY)} y1={toY(projectorLensZ)}
            x2={toX(screenFrontPlaneY)} y2={toY(vImgTop)}
            {...STROKE.beam}
          />
          <line
            x1={toX(projectorLensY)} y1={toY(projectorLensZ)}
            x2={toX(screenFrontPlaneY)} y2={toY(vImgBottom)}
            {...STROKE.beam}
          />
        </g>
      )}

      {/* Screen frame outline */}
      <rect
        x={toX(screenFrontPlaneY) - 3}
        y={toY(frameTop)}
        width={6}
        height={toY(frameBottom) - toY(frameTop)}
        {...STROKE.frame}
      />

      {/* Viewable image area */}
      <rect
        x={toX(screenFrontPlaneY) - 2}
        y={toY(vImgTop)}
        width={4}
        height={toY(vImgBottom) - toY(vImgTop)}
        {...STROKE.viewable}
      />

      {/* Eye-line comfort zone markers: 1/6–1/3 screen height from bottom */}
      <g>
        <line
          x1={toX(screenFrontPlaneY) + 8}
          y1={toY(comfortZoneLowerZ)}
          x2={toX(screenFrontPlaneY) + 16}
          y2={toY(comfortZoneLowerZ)}
          stroke="#4B5563"
          strokeWidth={0.7}
          opacity={0.55}
        />
        <line
          x1={toX(screenFrontPlaneY) + 8}
          y1={toY(comfortZoneUpperZ)}
          x2={toX(screenFrontPlaneY) + 16}
          y2={toY(comfortZoneUpperZ)}
          stroke="#4B5563"
          strokeWidth={0.7}
          opacity={0.55}
        />
        <line
          x1={toX(screenFrontPlaneY) + 16}
          y1={toY(comfortZoneUpperZ)}
          x2={toX(screenFrontPlaneY) + 16}
          y2={toY(comfortZoneLowerZ)}
          stroke="#4B5563"
          strokeWidth={0.7}
          opacity={0.45}
          strokeDasharray="2 2"
        />
        <text x={toX(screenFrontPlaneY) + 20} y={toY(comfortZoneUpperZ) - 4} fontSize={6} fill="#4B5563" opacity={0.8} textAnchor="start">
          Eye-line comfort zone
        </text>
        <text x={toX(screenFrontPlaneY) + 20} y={toY(comfortZoneLowerZ) + 8} fontSize={6} fill="#4B5563" opacity={0.7} textAnchor="start">
          1/6–1/3 screen height
        </text>
      </g>

      {/* Projector body */}
      {Number.isFinite(projectorLensY) && (
        <rect
          x={toX(pbFront)}
          y={toY(pbTop)}
          width={toX(pbRear) - toX(pbFront)}
          height={toY(pbBot) - toY(pbTop)}
          {...STROKE.projBody}
        />
      )}

      {/* Projector lens point */}
      {Number.isFinite(projectorLensY) && (
        <g>
          <circle cx={toX(projectorLensY)} cy={toY(projectorLensZ)} r={3} fill={PALETTE.beam} />
          <circle cx={toX(projectorLensY)} cy={toY(projectorLensZ)} r={6} fill="none" stroke={PALETTE.beam} strokeWidth={0.8} />
        </g>
      )}

      {/* Eye points per row */}
      {rowData.map((row, i) => {
        const ex = toX(row.eyeY);
        const ez = toY(row.eyeZ);
        const col = rowColor(i);
        return (
          <g key={`eye-${row.rowNumber}`}>
            <circle cx={ex} cy={ez} r={3.5} fill={col} opacity={0.9} />
            <text x={ex + 6} y={ez + 1} fontSize={7} fill={col} fontWeight={600}>
              R{row.rowNumber}
            </text>
          </g>
        );
      })}

      {/* Axis labels */}
      {/* Floor */}
      <text x={rx1 - 4} y={ry0 - 4} fontSize={6} fill={PALETTE.subLabel} textAnchor="end">Floor</text>
      {/* Left ceiling label removed — ceiling is labelled near projector annotations instead */}
      {/* Screen label */}
      <text x={toX(screenFrontPlaneY)} y={ry1 - 4} fontSize={6} fill={PALETTE.screenFrame} textAnchor="middle">Screen</text>
      {/* Projector label — shifted above body top to avoid overlap with dim line */}
      {Number.isFinite(projectorLensY) && (
        <text x={toX(projectorLensY)} y={toY(pbTop) - 14} fontSize={6} fill={PALETTE.beam} textAnchor="middle">Projector</text>
      )}
      {/* Room length annotation */}
      <text x={(rx0 + rx1) / 2} y={ry0 + 10} fontSize={6} fill={PALETTE.subLabel} textAnchor="middle">
        Room depth: {roomLengthM.toFixed(2)} m
      </text>
      {/* Screen height annotation — rotated label on left side */}
      <text x={rx0 + 10} y={(ry0 + ry1) / 2} fontSize={6} fill={PALETTE.subLabel} textAnchor="middle"
        transform={`rotate(-90, ${rx0 + 10}, ${(ry0 + ry1) / 2})`}>
        Screen: {Number.isFinite(screenHeightM) ? screenHeightM.toFixed(2) : (vImgTop - vImgBottom).toFixed(2)} m
      </text>

      {/* ── Projector height dimension line ── */}
      {Number.isFinite(projectorLensY) && Number.isFinite(projectorLensZ) && (() => {
        const dimX = toX(pbRear) + 10;   // just to the right of projector body
        const floorSvgY = ry0;           // SVG y of floor
        const lensSvgY  = toY(projectorLensZ);
        const topSvgY   = toY(pbTop);
        const ceilSvgY  = ry1;
        const ceilingClearance = roomHeightM - pbTop;
        return (
          <g>
            {/* Vertical dimension line: floor → lens */}
            <line x1={dimX} y1={floorSvgY} x2={dimX} y2={lensSvgY}
              stroke={PALETTE.projector} strokeWidth={0.6} fill="none" opacity={0.7} strokeDasharray="3 2" />
            {/* Tick at floor */}
            <line x1={dimX - 3} y1={floorSvgY} x2={dimX + 3} y2={floorSvgY}
              stroke={PALETTE.projector} strokeWidth={0.7} fill="none" opacity={0.7} />
            {/* Tick at lens */}
            <line x1={dimX - 3} y1={lensSvgY} x2={dimX + 3} y2={lensSvgY}
              stroke={PALETTE.projector} strokeWidth={0.7} fill="none" opacity={0.7} />
            {/* Lens height label — 4px below the lens tick for downward spacing */}
            <text x={dimX + 5} y={lensSvgY + 10} fontSize={6} fill={PALETTE.projector} textAnchor="start">
              Lens: {projectorLensZ.toFixed(2)} m
            </text>

            {/* Vertical dim line: projector top → ceiling */}
            <line x1={dimX} y1={topSvgY} x2={dimX} y2={ceilSvgY}
              stroke={PALETTE.subLabel} strokeWidth={0.6} fill="none" opacity={0.6} strokeDasharray="3 2" />
            {/* Tick at projector top */}
            <line x1={dimX - 3} y1={topSvgY} x2={dimX + 3} y2={topSvgY}
              stroke={PALETTE.subLabel} strokeWidth={0.7} fill="none" opacity={0.7} />
            {/* Tick at ceiling */}
            <line x1={dimX - 3} y1={ceilSvgY} x2={dimX + 3} y2={ceilSvgY}
              stroke={PALETTE.subLabel} strokeWidth={0.7} fill="none" opacity={0.7} />
            {/* Clearance label — midpoint between projector top and ceiling, shifted up 4px for spacing */}
            <text x={dimX + 5} y={(topSvgY + ceilSvgY) / 2 - 4} fontSize={6} fill={PALETTE.subLabel} textAnchor="start">
              Clr: {ceilingClearance.toFixed(2)} m
            </text>
            {/* Ceiling height label — 9px above the ceiling tick */}
            <text x={dimX + 5} y={ceilSvgY - 9} fontSize={6} fill={PALETTE.subLabel} textAnchor="start">
              Ceiling: {roomHeightM.toFixed(2)} m
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

function DataTable({ rowData }) {
  const cols = [
    { label: 'Row',                   key: 'rowNumber',               fmt: (v) => `Row ${v}` },
    { label: 'Viewing Distance',      key: 'viewingDistanceM',        fmt: fmtM },
    { label: 'Horiz. Viewing Angle',  key: 'horizontalViewingAngleDeg', fmt: (v) => `${fmt1(v)}°` },
    { label: 'Vert. Angle to Top',    key: 'verticalAngleToTopDeg',   fmt: (v) => `${fmt1(v)}°` },
    { label: 'Vert. Angle to Bottom', key: 'verticalAngleToBottomDeg',fmt: (v) => `${fmt1(v)}°` },
    { label: 'Total Vert. Angle',     key: 'totalVerticalAngleDeg',   fmt: (v) => `${fmt1(v)}°` },
    { label: 'Compliance Note',       key: 'complianceNote',          fmt: (v) => v || '—' },
  ];

  const tdStyle = {
    border: `1px solid ${PALETTE.tableBorder}`,
    padding: '4px 8px',
    fontSize: 9,
    color: PALETTE.label,
    textAlign: 'center',
    whiteSpace: 'nowrap',
  };
  const thStyle = {
    ...tdStyle,
    background: PALETTE.tableHead,
    fontWeight: 700,
    fontSize: 8,
    color: PALETTE.subLabel,
    letterSpacing: '0.02em',
  };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
      <thead>
        <tr>
          {cols.map(c => <th key={c.key} style={thStyle}>{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rowData.map((row, i) => (
          <tr key={row.rowNumber} style={{ background: i % 2 === 0 ? '#FFFFFF' : PALETTE.tableHead }}>
            {cols.map(c => (
              <td key={c.key} style={{ ...tdStyle, fontWeight: c.key === 'rowNumber' ? 700 : 400 }}>
                {c.fmt(row[c.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export default function SightlineGraphic({
  projectName,
  clientName,
  roomWidthM,
  roomLengthM,
  roomHeightM,
  screenWidthM,
  screenHeightM,
  screenTotalWidthM,
  screenTotalHeightM,
  screenFrontPlaneY,
  screenCenterHeightM,
  screenBottomHeightM,
  screenTopHeightM,
  projectorLensX,
  projectorLensY,
  projectorLensZ,
  projectorBodyWidth,
  projectorBodyHeight,
  projectorBodyDepth,
  rowData = [],
  dolbyConfig,
}) {
  if (!rowData.length) return null;

  const throwDistM = Number.isFinite(projectorLensY) && Number.isFinite(screenFrontPlaneY)
    ? Math.abs(projectorLensY - screenFrontPlaneY)
    : null;

  const screenInches = screenWidthM
    ? `${(screenWidthM / 0.0254).toFixed(0)}" width (${screenWidthM.toFixed(2)} m)`
    : null;

  const room  = { roomLengthM, roomHeightM };
  const screen = { screenFrontPlaneY, screenBottomHeightM, screenTopHeightM, screenWidthM, screenHeightM, screenTotalHeightM, screenTotalWidthM };
  const proj  = { projectorLensX, projectorLensY, projectorLensZ, projectorBodyWidth, projectorBodyHeight, projectorBodyDepth };

  // SVG drawing dimensions (matches A4 landscape proportions, slightly shorter to leave room for table)
  const svgW = 700;
  const svgH = 320;
  const pad  = 28;

  return (
    <div style={{ width: '100%', background: '#FFFFFF', pageBreakBefore: 'always' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, borderBottom: `2px solid ${PALETTE.room}`, paddingBottom: 6 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: PALETTE.label, letterSpacing: '0.02em' }}>
            Sightlines &amp; Viewing Angles
          </div>
          {(projectName || clientName) && (
            <div style={{ fontSize: 9, color: PALETTE.subLabel, marginTop: 2 }}>
              {projectName && <span style={{ fontWeight: 600 }}>{projectName}</span>}
              {projectName && clientName && <span style={{ margin: '0 6px', color: PALETTE.tableBorder }}>|</span>}
              {clientName && <span>{clientName}</span>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {[
            ['Room', `${roomLengthM?.toFixed(2)} × ${roomWidthM?.toFixed(2)} × ${roomHeightM?.toFixed(2)} m`],
            ['Screen', screenInches],
            ['Throw', throwDistM != null ? `${throwDistM.toFixed(2)} m` : null],
            ['System', dolbyConfig],
          ].filter(([, v]) => v).map(([label, value]) => (
            <div key={label} style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 7, color: PALETTE.subLabel, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: PALETTE.label }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SVG side elevation ── */}
      <div style={{ width: '100%', border: `1px solid ${PALETTE.tableBorder}`, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
        <SvgDrawing
          svgW={svgW} svgH={svgH} pad={pad}
          room={room} screen={screen} projector={proj}
          rowData={rowData}
        />
      </div>

      {/* Legend row */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 6, flexWrap: 'wrap' }}>
        {[
          { color: PALETTE.sightline, dash: true, label: 'Sightlines (seat to screen)' },
          { color: '#4B5563',         dash: true, label: '±15° viewing comfort guide' },
          { color: PALETTE.beam,      dash: true, label: 'Projector beam' },
          { color: PALETTE.viewable,  dash: false, label: 'Viewable image area' },
        ].map(({ color, dash, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width={20} height={8}>
              <line x1={0} y1={4} x2={20} y2={4}
                stroke={color} strokeWidth={1.5}
                strokeDasharray={dash ? '4 2' : undefined}
              />
            </svg>
            <span style={{ fontSize: 7, color: PALETTE.subLabel }}>{label}</span>
          </div>
        ))}
        {/* Row dots */}
        {rowData.map((row, i) => {
          const cols = ['#213428','#625143','#3E4349','#B45309','#1B1A1A'];
          const c = cols[i % cols.length];
          return (
            <div key={row.rowNumber} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width={10} height={10}>
                <circle cx={5} cy={5} r={3.5} fill={c} />
              </svg>
              <span style={{ fontSize: 7, color: PALETTE.subLabel }}>Row {row.rowNumber}</span>
            </div>
          );
        })}
      </div>

      {/* ── Data table ── */}
      <DataTable rowData={rowData} />

      {/* Footer note */}
      <div style={{ marginTop: 6, fontSize: 7, color: PALETTE.subLabel }}>
        Calculations use viewable image area only. Vertical angles are measured from viewer eye level to the top and bottom of the viewable image. The ±15° guide is a visual comfort reference based on common CEDIA/SMPTE sightline guidance and is not part of RP22 audio scoring.
      </div>
    </div>
  );
}