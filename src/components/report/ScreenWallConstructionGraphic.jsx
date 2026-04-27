import React, { useMemo } from 'react';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';

const PAGE = {
  width: 1120,
  height: 720,
  margin: 36,
  headerH: 56,
  footerH: 54,
};

const COLORS = {
  bg: '#ffffff',
  line: '#111111',
  light: '#b8b8b8',
  text: '#111111',
  muted: '#5f5f5f',
};

const SPEAKER_FALLBACKS = {
  'evolve 2 1': { widthM: 0.2, heightM: 0.082, depthM: 0.082 },
  'evolve 3 1': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'evolve 4 2': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'evolve 6 3': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'evolve 8 4': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'spitfire q4 3': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'spitfire q6 3': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'spitfire q4 5': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'spitfire q8 5': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'q4 3': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'q6 3': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'q4 5': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'q8 5': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
};

const SUB_FALLBACKS = {
  'sub2-12': { widthM: 0.5, heightM: 0.255, depthM: 0.255 },
  'sub3-12': { widthM: 0.6, heightM: 0.255, depthM: 0.255 },
  'sub4-12': { widthM: 0.44, heightM: 0.27, depthM: 0.27 },
  'sub 2-12': { widthM: 0.5, heightM: 0.255, depthM: 0.255 },
  'sub 3-12': { widthM: 0.6, heightM: 0.255, depthM: 0.255 },
  'sub 4-12': { widthM: 0.44, heightM: 0.27, depthM: 0.27 },
};

const ALLOWED_SPEAKER_ROLES = new Set(['FL', 'FC', 'FR', 'FCL', 'FCR']);

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function finite(v) {
  return Number.isFinite(Number(v));
}

function fmtM(v) {
  return `${num(v).toFixed(2)}m`;
}

function normalizeModelKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getFallbackDims(modelName, fallbackMap, defaultDims) {
  const key = normalizeModelKey(modelName);
  return fallbackMap[key] || defaultDims;
}

function resolveDims(modelName, fallbackMap, defaultDims) {
  const meta = getSpeakerModelMeta(modelName);
  const fallback = getFallbackDims(modelName, fallbackMap, defaultDims);
  return {
    widthM: finite(meta?.widthM) ? Number(meta.widthM) : fallback.widthM,
    heightM: finite(meta?.heightM) ? Number(meta.heightM) : fallback.heightM,
    depthM: finite(meta?.depthM) ? Number(meta.depthM) : fallback.depthM,
  };
}

function DimLine({ x1, y1, x2, y2, text, offset = 0, vertical = false }) {
  if (vertical) {
    return (
      <g>
        <line x1={x1} y1={y1} x2={x1 + offset} y2={y1} stroke={COLORS.light} strokeWidth="1" />
        <line x1={x2} y1={y2} x2={x2 + offset} y2={y2} stroke={COLORS.light} strokeWidth="1" />
        <line x1={x1 + offset} y1={y1} x2={x2 + offset} y2={y2} stroke={COLORS.line} strokeWidth="1" />
        <text
          x={x1 + offset + 14}
          y={(y1 + y2) / 2}
          fontSize="11"
          fill={COLORS.text}
          transform={`rotate(90 ${x1 + offset + 14} ${(y1 + y2) / 2})`}
          textAnchor="middle"
        >
          {text}
        </text>
      </g>
    );
  }

  return (
    <g>
      <line x1={x1} y1={y1} x2={x1} y2={y1 + offset} stroke={COLORS.light} strokeWidth="1" />
      <line x1={x2} y1={y2} x2={x2} y2={y2 + offset} stroke={COLORS.light} strokeWidth="1" />
      <line x1={x1} y1={y1 + offset} x2={x2} y2={y2 + offset} stroke={COLORS.line} strokeWidth="1" />
      <text x={(x1 + x2) / 2} y={y1 + offset - 6} fontSize="11" fill={COLORS.text} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}

export default function ScreenWallConstructionGraphic({
  projectName,
  clientName,
  roomWidthM,
  roomHeightM,
  screenWidthM,
  screenHeightM,
  screenTotalWidthM,
  screenTotalHeightM,
  screenBottomHeightM,
  screenTopHeightM,
  placedSpeakers,
  frontSubs,
}) {
  const roomW = Math.max(0.1, num(roomWidthM, 4.5));
  const roomH = Math.max(0.1, num(roomHeightM, 2.4));
  const screenViewW = Math.max(0, num(screenWidthM));
  const screenViewH = Math.max(0, num(screenHeightM));
  const screenOuterW = Math.max(screenViewW, num(screenTotalWidthM, screenViewW));
  const screenOuterH = Math.max(screenViewH, num(screenTotalHeightM, screenViewH));
  const screenBottom = num(screenBottomHeightM);
  const screenTop = finite(screenTopHeightM) ? Number(screenTopHeightM) : screenBottom + screenOuterH;

  const drawingArea = {
    x: PAGE.margin,
    y: PAGE.margin + PAGE.headerH,
    width: PAGE.width - PAGE.margin * 2,
    height: 390,
  };

  const lowerArea = {
    x: PAGE.margin,
    y: drawingArea.y + drawingArea.height + 34,
    width: PAGE.width - PAGE.margin * 2,
    height: 150,
  };

  const scale = Math.min(drawingArea.width / roomW, drawingArea.height / roomH);
  const wallPxW = roomW * scale;
  const wallPxH = roomH * scale;
  const wallX = drawingArea.x + (drawingArea.width - wallPxW) / 2;
  const wallY = drawingArea.y + (drawingArea.height - wallPxH) / 2;

  const mapX = (xM) => wallX + xM * scale;
  const mapY = (zM) => wallY + wallPxH - zM * scale;

  const screenOuterX = (roomW - screenOuterW) / 2;
  const screenOuterY = screenBottom;
  const screenInnerX = (roomW - screenViewW) / 2;
  const screenInnerY = (screenBottom + screenTop - screenViewH) / 2;

  const recess = {
    widthM: Math.max(0.1, screenOuterW - 0.15),
    heightM: Math.max(0.1, screenOuterH - 0.15),
  };
  recess.xM = (roomW - recess.widthM) / 2;
  recess.yM = screenBottom + (screenOuterH - recess.heightM) / 2;

  const drawnSpeakers = useMemo(() => {
    const list = Array.isArray(placedSpeakers) ? placedSpeakers : [];
    return list
      .filter((item) => ALLOWED_SPEAKER_ROLES.has(String(item?.role || '').toUpperCase()))
      .filter((item) => finite(item?.position?.x) && finite(item?.position?.z))
      .map((item) => ({
        role: String(item.role).toUpperCase(),
        xM: Number(item.position.x),
        zM: Number(item.position.z),
        dims: resolveDims(item.model, SPEAKER_FALLBACKS, { widthM: 0.27, heightM: 0.082, depthM: 0.082 }),
      }));
  }, [placedSpeakers]);

  const drawnSubs = useMemo(() => {
    const list = Array.isArray(frontSubs) ? frontSubs : [];
    return list
      .filter((item) => finite(item?.x) && finite(item?.z))
      .map((item, index) => ({
        label: `SUB ${index + 1}`,
        xM: Number(item.x),
        zM: Number(item.z),
        dims: resolveDims(item.model, SUB_FALLBACKS, { widthM: 0.5, heightM: 0.255, depthM: 0.255 }),
      }));
  }, [frontSubs]);

  const chamberDepthM = useMemo(() => {
    const depths = [
      ...drawnSpeakers.map((item) => num(item?.dims?.depthM)),
      ...drawnSubs.map((item) => num(item?.dims?.depthM)),
    ].filter((value) => value > 0);
    const deepest = depths.length ? Math.max(...depths) : 0;
    return deepest + 0.02;
  }, [drawnSpeakers, drawnSubs]);

  const iso = {
    originX: lowerArea.x + 120,
    originY: lowerArea.y + 108,
    wallW: 170,
    wallH: 88,
    skewX: 66,
    skewY: 40,
    depthPx: Math.max(24, chamberDepthM * 240),
  };

  const screenPlaneOffset = 18;
  const speakerPlaneOffset = iso.depthPx;

  return (
    <div className="bg-white text-black w-full print:block" style={{ background: '#fff' }}>
      <svg
        viewBox={`0 0 ${PAGE.width} ${PAGE.height}`}
        className="w-full h-auto"
        role="img"
        aria-label="Screen wall construction detail"
      >
        <rect x="0" y="0" width={PAGE.width} height={PAGE.height} fill={COLORS.bg} />

        <g>
          <text x={PAGE.margin} y={PAGE.margin + 8} fontSize="22" fill={COLORS.text} fontWeight="600">
            Screen Wall Construction Detail
          </text>
          <text x={PAGE.margin} y={PAGE.margin + 28} fontSize="11" fill={COLORS.muted}>
            {projectName || 'Untitled Project'}
            {clientName ? `  •  ${clientName}` : ''}
          </text>
        </g>

        <g>
          <rect x={wallX} y={wallY} width={wallPxW} height={wallPxH} fill="none" stroke={COLORS.line} strokeWidth="1.2" />
          <line x1={wallX} y1={wallY + wallPxH} x2={wallX + wallPxW} y2={wallY + wallPxH} stroke={COLORS.line} strokeWidth="1.2" />
          <line x1={wallX} y1={wallY} x2={wallX + wallPxW} y2={wallY} stroke={COLORS.line} strokeWidth="1.2" />

          <DimLine x1={wallX} y1={wallY + wallPxH} x2={wallX + wallPxW} y2={wallY + wallPxH} text={`Room width ${fmtM(roomW)}`} offset={26} />
          <DimLine x1={wallX} y1={wallY + wallPxH} x2={wallX} y2={wallY} text={`Room height ${fmtM(roomH)}`} offset={-28} vertical />

          <rect
            x={mapX(recess.xM)}
            y={mapY(recess.yM + recess.heightM)}
            width={recess.widthM * scale}
            height={recess.heightM * scale}
            fill="none"
            stroke={COLORS.light}
            strokeWidth="1"
            strokeDasharray="5 4"
          />
          <text x={mapX(recess.xM) + 6} y={mapY(recess.yM + recess.heightM) - 8} fontSize="11" fill={COLORS.muted}>
            Sound chamber recess
          </text>
          <DimLine
            x1={mapX(recess.xM)}
            y1={mapY(recess.yM)}
            x2={mapX(recess.xM + recess.widthM)}
            y2={mapY(recess.yM)}
            text={`Recess width ${fmtM(recess.widthM)}`}
            offset={18}
          />
          <DimLine
            x1={mapX(recess.xM + recess.widthM)}
            y1={mapY(recess.yM)}
            x2={mapX(recess.xM + recess.widthM)}
            y2={mapY(recess.yM + recess.heightM)}
            text={`Recess height ${fmtM(recess.heightM)}`}
            offset={24}
            vertical
          />

          <rect
            x={mapX(screenOuterX)}
            y={mapY(screenOuterY + screenOuterH)}
            width={screenOuterW * scale}
            height={screenOuterH * scale}
            fill="none"
            stroke={COLORS.line}
            strokeWidth="1.4"
          />
          <rect
            x={mapX(screenInnerX)}
            y={mapY(screenInnerY + screenViewH)}
            width={screenViewW * scale}
            height={screenViewH * scale}
            fill="none"
            stroke={COLORS.light}
            strokeWidth="1"
          />

          <DimLine
            x1={mapX(screenInnerX)}
            y1={mapY(screenInnerY)}
            x2={mapX(screenInnerX + screenViewW)}
            y2={mapY(screenInnerY)}
            text={`Viewable width ${fmtM(screenViewW)}`}
            offset={-18}
          />
          <DimLine
            x1={mapX(screenInnerX + screenViewW)}
            y1={mapY(screenInnerY)}
            x2={mapX(screenInnerX + screenViewW)}
            y2={mapY(screenInnerY + screenViewH)}
            text={`Viewable height ${fmtM(screenViewH)}`}
            offset={48}
            vertical
          />
          <DimLine
            x1={wallX + wallPxW} y1={mapY(0)}
            x2={wallX + wallPxW} y2={mapY(screenBottom)}
            text={`Screen bottom ${fmtM(screenBottom)}`}
            offset={68}
            vertical
          />
          <DimLine
            x1={wallX + wallPxW} y1={mapY(0)}
            x2={wallX + wallPxW} y2={mapY(screenTop)}
            text={`Screen top ${fmtM(screenTop)}`}
            offset={108}
            vertical
          />

          {drawnSpeakers.map((item) => {
            const w = item.dims.widthM * scale;
            const h = item.dims.heightM * scale;
            const x = mapX(item.xM) - w / 2;
            const y = mapY(item.zM) - h / 2;
            return (
              <g key={`${item.role}-${item.xM}-${item.zM}`}>
                <rect x={x} y={y} width={w} height={h} fill="none" stroke={COLORS.line} strokeWidth="1" />
                <text x={x + w / 2} y={y - 6} fontSize="10" fill={COLORS.text} textAnchor="middle">
                  {item.role}
                </text>
              </g>
            );
          })}

          {drawnSubs.map((item) => {
            const w = item.dims.widthM * scale;
            const h = item.dims.heightM * scale;
            const x = mapX(item.xM) - w / 2;
            const y = mapY(item.zM) - h / 2;
            return (
              <g key={`${item.label}-${item.xM}-${item.zM}`}>
                <rect x={x} y={y} width={w} height={h} fill="none" stroke={COLORS.line} strokeWidth="1" />
                <text x={x + w / 2} y={y + h + 12} fontSize="10" fill={COLORS.text} textAnchor="middle">
                  {item.label}
                </text>
              </g>
            );
          })}
        </g>

        <g>
          <text x={lowerArea.x} y={lowerArea.y - 10} fontSize="13" fill={COLORS.text} fontWeight="600">
            45° construction view
          </text>

          <polygon
            points={[
              `${iso.originX},${iso.originY}`,
              `${iso.originX + iso.wallW},${iso.originY}`,
              `${iso.originX + iso.wallW},${iso.originY - iso.wallH}`,
              `${iso.originX},${iso.originY - iso.wallH}`,
            ].join(' ')}
            fill="none"
            stroke={COLORS.line}
            strokeWidth="1.2"
          />

          <line
            x1={iso.originX}
            y1={iso.originY}
            x2={iso.originX + iso.skewX}
            y2={iso.originY - iso.skewY}
            stroke={COLORS.line}
            strokeWidth="1"
          />
          <line
            x1={iso.originX + iso.wallW}
            y1={iso.originY}
            x2={iso.originX + iso.wallW + iso.skewX}
            y2={iso.originY - iso.skewY}
            stroke={COLORS.line}
            strokeWidth="1"
          />
          <line
            x1={iso.originX + iso.wallW}
            y1={iso.originY - iso.wallH}
            x2={iso.originX + iso.wallW + iso.skewX}
            y2={iso.originY - iso.wallH - iso.skewY}
            stroke={COLORS.line}
            strokeWidth="1"
          />

          <line
            x1={iso.originX + screenPlaneOffset}
            y1={iso.originY - 10}
            x2={iso.originX + screenPlaneOffset + iso.skewX}
            y2={iso.originY - iso.skewY - 10}
            stroke={COLORS.light}
            strokeWidth="1"
          />
          <line
            x1={iso.originX + speakerPlaneOffset}
            y1={iso.originY - 22}
            x2={iso.originX + speakerPlaneOffset + iso.skewX}
            y2={iso.originY - iso.skewY - 22}
            stroke={COLORS.line}
            strokeWidth="1"
          />

          <text x={iso.originX + iso.skewX + 12} y={iso.originY - iso.skewY - 6} fontSize="10" fill={COLORS.muted}>
            Front wall plane
          </text>
          <text x={iso.originX + screenPlaneOffset + iso.skewX + 12} y={iso.originY - iso.skewY - 18} fontSize="10" fill={COLORS.muted}>
            Screen plane
          </text>
          <text x={iso.originX + speakerPlaneOffset + iso.skewX + 12} y={iso.originY - iso.skewY - 30} fontSize="10" fill={COLORS.text}>
            Speaker/sub plane
          </text>

          <DimLine
            x1={iso.originX + screenPlaneOffset}
            y1={iso.originY + 28}
            x2={iso.originX + speakerPlaneOffset}
            y2={iso.originY + 28}
            text={`Sound chamber depth ${fmtM(chamberDepthM)}`}
            offset={0}
          />
        </g>

        <g>
          <line
            x1={PAGE.margin}
            y1={PAGE.height - PAGE.footerH}
            x2={PAGE.width - PAGE.margin}
            y2={PAGE.height - PAGE.footerH}
            stroke={COLORS.light}
            strokeWidth="1"
          />
          <text x={PAGE.margin} y={PAGE.height - PAGE.footerH + 18} fontSize="10" fill={COLORS.muted}>
            Construction drawing is generated from the current room, screen, speaker and subwoofer data. Re-check dimensions if product
          </text>
          <text x={PAGE.margin} y={PAGE.height - PAGE.footerH + 32} fontSize="10" fill={COLORS.muted}>
            selection or mounting method changes.
          </text>
        </g>
      </svg>
    </div>
  );
}