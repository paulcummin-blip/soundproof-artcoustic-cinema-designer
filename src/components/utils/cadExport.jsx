/**
 * CAD Overlay Export Utilities
 * Generates SVG and DXF R12 files from room geometry for CAD overlay use.
 *
 * COORDINATE CONVENTION:
 *   - Origin: front-left corner of the room (front/screen wall top of drawing).
 *   - App X: left-to-right (unchanged).
 *   - App Y: front-to-rear (rear wall = roomLengthM).
 *   - CAD Y: FLIPPED → CAD_Y_mm = (roomLengthM - appY_m) × 1000
 *
 * All output units: millimetres.
 *
 * SCREEN GEOMETRY (mirrors RvBaffleAndScreen):
 *   - visibleWidthM  → SCREEN_VIEWABLE layer (centred in room)
 *   - overallWidthM  → SCREEN_FRAME layer (= visible + 2×borderM)
 *   - SCREEN_THICKNESS_M (5 mm) → physical screen body rect
 *   - Baffle zone: dashed rect from front wall (y=0) to screenFrontPlaneM,
 *     matching visible screen width → SCREEN_WALL_BUILDUP layer
 *
 * SPEAKER FOOTPRINTS (via getSpeakerModelMeta):
 *   - Front/rear wall: widthM → X, depthM → Y (into room)
 *   - Side walls: widthM → Y (along wall), depthM → X (into room)
 *   - Overheads: small square marker (120mm)
 *   - Fallback: 150×82 mm generic rect when model not found
 *
 * ROOM ELEMENTS: per-type sublayers (DOORS, WINDOWS, etc.)
 * PROJECTOR: PROJECTOR_BODY + PROJECTOR_LENS layers
 */

import { getSpeakerModelMeta } from '@/components/models/speakers/registry';

// ─── Screen constants (match RvBaffleAndScreen) ────────────────────────────
const SCREEN_THICKNESS_M = 0.005; // 5 mm physical screen body

// ─── Coordinate helpers ────────────────────────────────────────────────────

const toX = (xM) => Math.round(Number(xM || 0) * 1000);

function toY(yM, roomLengthM) {
    return Math.round((roomLengthM - Number(yM || 0)) * 1000);
}

// ─── Speaker wall-classification ───────────────────────────────────────────

const OVERHEAD_ROLES = new Set([
    'TFL', 'TFR', 'TML', 'TMR', 'TRL', 'TRR',
    'VHL', 'VHR', 'VOL', 'VOR', 'FHL', 'FHR', 'RHL', 'RHR', 'TSL', 'TSR',
]);
const FRONT_ROLES  = new Set(['FL', 'FC', 'FR', 'FWL', 'FWR', 'LCR', 'C', 'L', 'R']);
const REAR_ROLES   = new Set(['RL', 'RC', 'RR', 'SBL', 'SBR', 'BSL', 'BSR']);
const LEFT_ROLES   = new Set(['SL', 'SSL', 'LSR', 'LS', 'LSS']);
const RIGHT_ROLES  = new Set(['SR', 'SSR', 'RSR', 'RS', 'RSS']);

function classifyWall(role) {
    const r = String(role || '').toUpperCase().trim();
    if (OVERHEAD_ROLES.has(r)) return 'overhead';
    if (FRONT_ROLES.has(r))    return 'front';
    if (REAR_ROLES.has(r))     return 'rear';
    if (LEFT_ROLES.has(r))     return 'left';
    if (RIGHT_ROLES.has(r))    return 'right';
    if (r.endsWith('L') && r.startsWith('S')) return 'left';
    if (r.endsWith('R') && r.startsWith('S')) return 'right';
    return 'unknown';
}

// ─── Speaker footprint resolver ────────────────────────────────────────────

const FALLBACK_WIDTH_MM = 150;
const FALLBACK_DEPTH_MM = 82;
const OVERHEAD_MARKER_HS = 60; // half-size mm

function getSpeakerFootprintMm(modelName, role, subOrientation) {
    if (!modelName) {
        return { planWidthMm: FALLBACK_WIDTH_MM, planDepthMm: FALLBACK_DEPTH_MM, isRound: false, diameterMm: 0, fallback: true };
    }
    const meta = getSpeakerModelMeta(modelName, subOrientation);
    const fallback = !!(meta?.notFound);

    if (meta?.round) {
        const dMm = Math.round((meta.diameterM || 0.2) * 1000);
        return { planWidthMm: dMm, planDepthMm: dMm, isRound: true, diameterMm: dMm, fallback };
    }

    const wMm = Math.round((meta?.widthM || FALLBACK_WIDTH_MM / 1000) * 1000);
    const dMm = Math.round((meta?.depthM || FALLBACK_DEPTH_MM / 1000) * 1000);
    const wall = classifyWall(role);

    // Side walls: swap axes so depth projects into room
    if (wall === 'left' || wall === 'right') {
        return { planWidthMm: dMm, planDepthMm: wMm, isRound: false, diameterMm: 0, fallback };
    }
    return { planWidthMm: wMm, planDepthMm: dMm, isRound: false, diameterMm: 0, fallback };
}

// ─── Room element sublayer by type ─────────────────────────────────────────

function roomElementLayer(type) {
    const t = String(type || '').toLowerCase();
    if (t === 'door')     return 'DOORS';
    if (t === 'window')   return 'WINDOWS';
    if (t === 'fireplace' || t === 'built_in') return 'ARCHITECTURAL_ELEMENTS';
    return 'ROOM_ELEMENTS';
}

// ─── Room element → app-space coords ──────────────────────────────────────

function roomElementToRoomCoords(el, roomWidthM, roomLengthM) {
    const wall      = el.wall;
    const elWidthM  = Number(el.width || 0);
    const posRatio  = Number(el.x_position || 0);
    const WALL_D    = 0.15; // wall representation depth (m)

    switch (wall) {
        case 'front': { const x = posRatio * roomWidthM - elWidthM / 2; return { x, y: 0,                     w: elWidthM, h: WALL_D }; }
        case 'back':  { const x = posRatio * roomWidthM - elWidthM / 2; return { x, y: roomLengthM - WALL_D,  w: elWidthM, h: WALL_D }; }
        case 'left':  { const y = posRatio * roomLengthM - elWidthM / 2; return { x: 0,                      y, w: WALL_D, h: elWidthM }; }
        case 'right': { const y = posRatio * roomLengthM - elWidthM / 2; return { x: roomWidthM - WALL_D,    y, w: WALL_D, h: elWidthM }; }
        default: return null;
    }
}

// ─── MLP seat finder ───────────────────────────────────────────────────────

function findMlpSeatId(mlp, seats) {
    if (!mlp || !Array.isArray(seats)) return null;
    let minDist = Infinity, id = null;
    seats.forEach(s => {
        if (!Number.isFinite(s?.x) || !Number.isFinite(s?.y)) return;
        const d = Math.hypot(s.x - mlp.x, s.y - mlp.y);
        if (d < minDist) { minDist = d; id = s.id; }
    });
    return minDist <= 0.05 ? id : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// DXF R12 primitive builders
// ─────────────────────────────────────────────────────────────────────────────

function dxfLine(layer, x1, y1, x2, y2) {
    return `0\nLINE\n8\n${layer}\n10\n${x1}\n20\n${y1}\n11\n${x2}\n21\n${y2}`;
}

function dxfRect(layer, x, y, w, h) {
    return [
        dxfLine(layer, x,     y,     x + w, y    ),
        dxfLine(layer, x + w, y,     x + w, y + h),
        dxfLine(layer, x + w, y + h, x,     y + h),
        dxfLine(layer, x,     y + h, x,     y    ),
    ].join('\n');
}

function dxfText(layer, x, y, height, text) {
    return `0\nTEXT\n8\n${layer}\n10\n${x}\n20\n${y}\n40\n${height}\n1\n${text}`;
}

function dxfCross(layer, cx, cy, arm) {
    return [
        dxfLine(layer, cx - arm, cy, cx + arm, cy),
        dxfLine(layer, cx, cy - arm, cx, cy + arm),
    ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG primitive builders
// ─────────────────────────────────────────────────────────────────────────────

function svgLine(x1, y1, x2, y2, stroke = 'black', sw = 1.5) {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"/>`;
}

function svgRect(x, y, w, h, fill = 'none', stroke = 'black', sw = 1.5, extra = '') {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${extra}/>`;
}

function svgText(x, y, text, fontSize = 100, anchor = 'start', fill = 'black') {
    return `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="sans-serif" text-anchor="${anchor}" fill="${fill}">${text}</text>`;
}

function svgCross(cx, cy, arm, stroke = '#333', sw = 1) {
    return [
        `<line x1="${cx - arm}" y1="${cy}" x2="${cx + arm}" y2="${cy}" stroke="${stroke}" stroke-width="${sw}"/>`,
        `<line x1="${cx}" y1="${cy - arm}" x2="${cx}" y2="${cy + arm}" stroke="${stroke}" stroke-width="${sw}"/>`,
    ].join('\n      ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared screen geometry resolver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve screen geometry in mm for CAD export.
 * Mirrors the logic in RvBaffleAndScreen.jsx.
 *
 * @param {object} screenMetrics  { viewWm, overallWm, borderM } — from resolveScreenMetricsSnapshot()
 * @param {number} screenFrontPlaneM  — app Y of screen face (metres)
 * @param {number} roomWidthM
 * @param {number} roomLengthM
 *
 * @returns {{
 *   hasScreen: boolean,
 *   centreXmm: number,
 *   screenFaceYcad: number,   // CAD Y of screen front face
 *   frontWallYcad: number,    // CAD Y of front wall (= roomLengthMm)
 *   visibleWidthMm: number,
 *   overallWidthMm: number,
 *   screenThickMm: number,
 *   baffleDepthMm: number,    // from front wall to screen face
 *   visibleXLeftMm: number,
 *   overallXLeftMm: number,
 * }}
 */
function resolveScreenGeomMm(screenMetrics, screenFrontPlaneM, roomWidthM, roomLengthM) {
    const hasScreen = Number.isFinite(screenFrontPlaneM);
    if (!hasScreen) return { hasScreen: false };

    const inch2m = 0.0254;
    const M_TO_MM = 1000;

    // Prefer viewWm from passed metrics; fall back to computing from inches
    const viewWm     = Number(screenMetrics?.viewWm)    > 0 ? Number(screenMetrics.viewWm)    : 0;
    const overallWm  = Number(screenMetrics?.overallWm) > 0 ? Number(screenMetrics.overallWm) : viewWm;

    const roomLenMm  = Math.round(roomLengthM * M_TO_MM);
    const roomWidMm  = Math.round(roomWidthM  * M_TO_MM);
    const centreXmm  = roomWidMm / 2;

    const screenFaceYcad = toY(screenFrontPlaneM, roomLengthM);
    const frontWallYcad  = roomLenMm; // CAD Y of front wall (y_app=0 → y_cad=roomLenMm)

    const baffleDepthMm  = Math.round(screenFrontPlaneM * M_TO_MM);
    const screenThickMm  = Math.round(SCREEN_THICKNESS_M * M_TO_MM);

    const visibleWidthMm = Math.round(viewWm    * M_TO_MM);
    const overallWidthMm = Math.round(overallWm * M_TO_MM);

    return {
        hasScreen: visibleWidthMm > 0,
        centreXmm,
        screenFaceYcad,
        frontWallYcad,
        visibleWidthMm,
        overallWidthMm,
        screenThickMm,
        baffleDepthMm,
        visibleXLeftMm:  centreXmm - visibleWidthMm / 2,
        overallXLeftMm:  centreXmm - overallWidthMm / 2,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// DXF layer definitions
// ─────────────────────────────────────────────────────────────────────────────

const ALL_LAYERS = [
    'ROOM_OUTLINE',
    'SCREEN_VIEWABLE',
    'SCREEN_FRAME',
    'SCREEN_WALL_BUILDUP',
    'SCREEN_LABELS',
    'SPEAKERS',
    'SUBWOOFERS',
    'SEATING',
    'PROJECTOR_BODY',
    'PROJECTOR_LENS',
    'PROJECTOR_THROW',
    'PROJECTOR_LABELS',
    'ROOM_ELEMENTS',
    'DOORS',
    'WINDOWS',
    'ARCHITECTURAL_ELEMENTS',
    'ROOM_ELEMENT_LABELS',
    'CABLE_POINTS',
    'LABELS',
    'DIMENSIONS',
];

// ─────────────────────────────────────────────────────────────────────────────
// SVG Export
// ─────────────────────────────────────────────────────────────────────────────

export function generateSVG({
    roomDims,
    seatingPositions,
    placedSpeakers,
    screenFrontPlaneM,
    screenMetrics = {},
    mlp,
    frontSubsCfg,
    rearSubsCfg,
    roomElements = [],
    projector = null,
}) {
    const roomW = Number(roomDims?.widthM || roomDims?.width || 4.5);
    const roomL = Number(roomDims?.lengthM || roomDims?.length || 6.0);
    const W = Math.round(roomW * 1000);
    const L = Math.round(roomL * 1000);

    const cy = (yM) => toY(yM, roomL);
    const cx = (xM) => toX(xM);

    const LABEL_OFFSET = 80;
    const TEXT_H = 90;
    const mlpSeatId = findMlpSeatId(mlp, seatingPositions);

    const svg = [];
    svg.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    svg.push(`<svg width="${W}mm" height="${L}mm" viewBox="0 0 ${W} ${L}" xmlns="http://www.w3.org/2000/svg">`);
    svg.push(`  <desc>CAD Overlay — Room Plan true scale mm — front/screen wall at top — layers: ${ALL_LAYERS.join(', ')}</desc>`);

    // ── ROOM_OUTLINE ──────────────────────────────────────────────────────────
    svg.push(`  <g id="ROOM_OUTLINE">`);
    svg.push(`    <rect x="0" y="0" width="${W}" height="${L}" fill="none" stroke="black" stroke-width="2"/>`);
    svg.push(`    ${svgText(W / 2, 80, 'FRONT / SCREEN WALL', 75, 'middle', '#555')}`);
    svg.push(`    ${svgText(W / 2, L - 30, 'REAR WALL', 75, 'middle', '#555')}`);
    svg.push(`  </g>`);

    // ── SCREEN GEOMETRY ───────────────────────────────────────────────────────
    const sg = resolveScreenGeomMm(screenMetrics, screenFrontPlaneM, roomW, roomL);
    if (sg.hasScreen) {
        const { centreXmm, screenFaceYcad, frontWallYcad, visibleWidthMm, overallWidthMm,
                screenThickMm, baffleDepthMm, visibleXLeftMm, overallXLeftMm } = sg;

        // SCREEN_WALL_BUILDUP — baffle zone from front wall down to screen face (dashed)
        if (baffleDepthMm > 0) {
            svg.push(`  <g id="SCREEN_WALL_BUILDUP">`);
            // Baffle rect: in CAD — top = frontWallYcad, bottom = screenFaceYcad
            // Since front wall is at top: frontWallYcad > screenFaceYcad (Y increases downward in SVG)
            // frontWallYcad = L (top of SVG), screenFaceYcad < L
            const bTop = frontWallYcad - baffleDepthMm; // = screenFaceYcad
            const bH   = baffleDepthMm;
            svg.push(`    ${svgRect(visibleXLeftMm, bTop, visibleWidthMm, bH, 'rgba(74,35,15,0.05)', '#4A230F', 1.5, ' stroke-dasharray="8 6"')}`);
            // Side dashes (already covered by rect sides, but add vertical lines for clarity)
            svg.push(`  </g>`);
        }

        // SCREEN_FRAME — overall width rectangle at screen face
        svg.push(`  <g id="SCREEN_FRAME">`);
        svg.push(`    ${svgRect(overallXLeftMm, screenFaceYcad, overallWidthMm, screenThickMm, '#1a1a1a', '#333', 1)}`);
        svg.push(`  </g>`);

        // SCREEN_VIEWABLE — inner viewable area indicator
        svg.push(`  <g id="SCREEN_VIEWABLE">`);
        svg.push(`    ${svgLine(visibleXLeftMm, screenFaceYcad, visibleXLeftMm + visibleWidthMm, screenFaceYcad, '#1B4FBB', 3)}`);
        svg.push(`  </g>`);

        // SCREEN_LABELS
        svg.push(`  <g id="SCREEN_LABELS">`);
        svg.push(`    ${svgText(centreXmm, screenFaceYcad - 50, 'SCREEN', 75, 'middle', '#1B4FBB')}`);
        if (visibleWidthMm > 0) {
            svg.push(`    ${svgText(centreXmm, screenFaceYcad + screenThickMm + 90, `VIEWABLE: ${Math.round(visibleWidthMm)} mm`, 70, 'middle', '#1B4FBB')}`);
        }
        svg.push(`  </g>`);
    }

    // ── ROOM_ELEMENTS ─────────────────────────────────────────────────────────
    svg.push(`  <g id="ROOM_ELEMENTS">`);
    roomElements.filter(el => el.type !== 'projector').forEach(el => {
        const coords = roomElementToRoomCoords(el, roomW, roomL);
        if (!coords) return;
        const { x, y, w, h } = coords;
        const ex = cx(x);
        const ey = cy(y + h);
        const ew = Math.round(w * 1000);
        const eh = Math.round(h * 1000);
        const layerCol = el.type === 'door' ? '#8B4513' : el.type === 'window' ? '#4169E1' : '#7B4E1E';
        svg.push(`    ${svgRect(ex, ey, ew, eh, 'rgba(180,120,60,0.12)', layerCol, 1.5)}`);
        svg.push(`    ${svgText(ex + ew / 2, ey + eh + 85, String(el.type || el.name || 'ELEMENT').toUpperCase(), 70, 'middle', layerCol)}`);
    });
    svg.push(`  </g>`);

    // ── PROJECTOR ─────────────────────────────────────────────────────────────
    if (projector && Number.isFinite(projector.x_lens_m) && Number.isFinite(projector.y_lens_m)) {
        const pxc = cx(projector.x_lens_m);
        const pyc = cy(projector.y_lens_m);
        const bw = Math.round((projector.body_width_m || 0.4) * 1000);
        const bd = Math.round((projector.body_depth_m || 0.3) * 1000);

        svg.push(`  <g id="PROJECTOR_BODY">`);
        svg.push(`    ${svgRect(pxc - bw / 2, pyc - bd / 2, bw, bd, 'rgba(139,0,139,0.08)', '#8B008B', 1.5)}`);
        svg.push(`  </g>`);

        svg.push(`  <g id="PROJECTOR_LENS">`);
        svg.push(`    ${svgCross(pxc, pyc, 55, '#8B008B', 1.5)}`);
        svg.push(`  </g>`);

        svg.push(`  <g id="PROJECTOR_LABELS">`);
        svg.push(`    ${svgText(pxc + bw / 2 + LABEL_OFFSET, pyc + 30, 'PROJECTOR', TEXT_H, 'start', '#8B008B')}`);
        svg.push(`  </g>`);
    }

    // ── SEATING ───────────────────────────────────────────────────────────────
    svg.push(`  <g id="SEATING">`);
    (seatingPositions || []).forEach((seat, idx) => {
        if (!Number.isFinite(seat?.x) || !Number.isFinite(seat?.y)) return;
        const sx = cx(seat.x);
        const sy = cy(seat.y);
        const isMLP = seat.id === mlpSeatId;
        const col = isMLP ? '#E63946' : '#444';
        svg.push(`    <circle cx="${sx}" cy="${sy}" r="130" stroke="${col}" stroke-width="${isMLP ? 2 : 1}" fill="none"/>`);
        svg.push(`    ${svgText(sx + 150, sy + 35, isMLP ? 'MLP' : `S${idx + 1}`, TEXT_H, 'start', col)}`);
    });
    svg.push(`  </g>`);

    // ── SPEAKERS ──────────────────────────────────────────────────────────────
    svg.push(`  <g id="SPEAKERS">`);
    (placedSpeakers || []).forEach(spk => {
        if (!Number.isFinite(spk?.position?.x) || !Number.isFinite(spk?.position?.y)) return;
        const role = String(spk?.role || '').toUpperCase();
        if (!role || role === 'LFE') return;

        const spx = cx(spk.position.x);
        const spy = cy(spk.position.y);
        const modelName = spk.model || spk.brand_model || '';
        const wall = classifyWall(role);

        if (wall === 'overhead') {
            const hs = OVERHEAD_MARKER_HS;
            svg.push(`    ${svgRect(spx - hs, spy - hs, hs * 2, hs * 2, 'rgba(80,80,200,0.06)', '#5050C8', 1)}`);
            svg.push(`    ${svgCross(spx, spy, hs * 0.55, '#5050C8', 0.8)}`);
            svg.push(`    ${svgText(spx + hs + LABEL_OFFSET, spy + 30, role, TEXT_H, 'start', '#5050C8')}`);
            return;
        }

        const { planWidthMm, planDepthMm, isRound, diameterMm } = getSpeakerFootprintMm(modelName, role);
        const hw = planWidthMm / 2;
        const hd = planDepthMm / 2;

        if (isRound) {
            const r = diameterMm / 2;
            svg.push(`    <circle cx="${spx}" cy="${spy}" r="${r}" fill="rgba(0,0,0,0.04)" stroke="black" stroke-width="1.5"/>`);
            svg.push(`    ${svgCross(spx, spy, r * 0.45, '#333', 1)}`);
        } else {
            svg.push(`    ${svgRect(spx - hw, spy - hd, planWidthMm, planDepthMm, 'rgba(0,0,0,0.04)', 'black', 1.5)}`);
            svg.push(`    ${svgCross(spx, spy, Math.min(hw, hd) * 0.4, '#333', 1)}`);
        }
        svg.push(`    ${svgText(spx + hw + LABEL_OFFSET, spy + 30, role, TEXT_H, 'start', '#1B1A1A')}`);
    });
    svg.push(`  </g>`);

    // ── SUBWOOFERS ────────────────────────────────────────────────────────────
    svg.push(`  <g id="SUBWOOFERS">`);

    const addSvgSub = (sub, idx, prefix) => {
        if (!Number.isFinite(sub?.x) || !Number.isFinite(sub?.y)) return;
        const sx = cx(sub.x);
        const sy = cy(sub.y);
        const label = `${prefix}${idx + 1}`;
        const { planWidthMm, planDepthMm } = getSpeakerFootprintMm(
            sub.model || sub.brand_model || '', 'SUB', sub.orientation || 'vertical'
        );
        const hw = planWidthMm / 2;
        const hd = planDepthMm / 2;
        svg.push(`    ${svgRect(sx - hw, sy - hd, planWidthMm, planDepthMm, 'rgba(50,50,50,0.04)', '#333', 2)}`);
        svg.push(`    ${svgCross(sx, sy, Math.min(hw, hd) * 0.35, '#333', 1)}`);
        svg.push(`    ${svgText(sx + hw + LABEL_OFFSET, sy + 30, label, TEXT_H, 'start', '#333')}`);
    };

    if (frontSubsCfg?.positions) frontSubsCfg.positions.forEach((s, i) => addSvgSub(s, i, 'SUBF'));
    if (rearSubsCfg?.positions)  rearSubsCfg.positions.forEach((s, i) => addSvgSub(s, i, 'SUBR'));
    svg.push(`  </g>`);

    svg.push(`</svg>`);
    return svg.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// DXF R12 Export
// ─────────────────────────────────────────────────────────────────────────────

export function generateDXF({
    roomDims,
    seatingPositions,
    placedSpeakers,
    screenFrontPlaneM,
    screenMetrics = {},
    mlp,
    frontSubsCfg,
    rearSubsCfg,
    roomElements = [],
    projector = null,
}) {
    const roomW = Number(roomDims?.widthM || roomDims?.width || 4.5);
    const roomL = Number(roomDims?.lengthM || roomDims?.length || 6.0);
    const W = Math.round(roomW * 1000);
    const L = Math.round(roomL * 1000);

    const cy = (yM) => toY(yM, roomL);
    const cx = (xM) => toX(xM);

    const LABEL_OFFSET = 100;
    const TEXT_H = 90;
    const mlpSeatId = findMlpSeatId(mlp, seatingPositions);
    const dxf = [];

    // ── HEADER ────────────────────────────────────────────────────────────────
    dxf.push('0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC');

    // ── LAYERS ────────────────────────────────────────────────────────────────
    dxf.push('0\nSECTION\n2\nTABLES');
    dxf.push(`0\nTABLE\n2\nLAYER\n70\n${ALL_LAYERS.length}`);
    ALL_LAYERS.forEach(name => {
        dxf.push(`0\nLAYER\n2\n${name}\n70\n0\n62\n7\n6\nCONTINUOUS`);
    });
    dxf.push('0\nENDTAB\n0\nENDSEC');

    // ── ENTITIES ─────────────────────────────────────────────────────────────
    dxf.push('0\nSECTION\n2\nENTITIES');

    // ROOM_OUTLINE — front wall at top (CAD Y = L), rear at bottom (CAD Y = 0)
    dxf.push(dxfLine('ROOM_OUTLINE', 0, L, W, L)); // front wall
    dxf.push(dxfLine('ROOM_OUTLINE', W, L, W, 0)); // right wall
    dxf.push(dxfLine('ROOM_OUTLINE', W, 0, 0, 0)); // rear wall
    dxf.push(dxfLine('ROOM_OUTLINE', 0, 0, 0, L)); // left wall
    dxf.push(dxfText('LABELS', W / 2, L + 80, 80, 'FRONT / SCREEN WALL'));
    dxf.push(dxfText('LABELS', W / 2, -50, 80, 'REAR WALL'));

    // SCREEN GEOMETRY
    const sg = resolveScreenGeomMm(screenMetrics, screenFrontPlaneM, roomW, roomL);
    if (sg.hasScreen) {
        const { centreXmm, screenFaceYcad, frontWallYcad, visibleWidthMm, overallWidthMm,
                screenThickMm, baffleDepthMm, visibleXLeftMm, overallXLeftMm } = sg;

        // SCREEN_WALL_BUILDUP — baffle zone (dashed — DXF DASHED linetype)
        if (baffleDepthMm > 0) {
            // In DXF: front wall = Y=L, screen face = Y=screenFaceYcad
            // Baffle rect goes from screenFaceYcad (bottom) to L (top)
            dxf.push(dxfRect('SCREEN_WALL_BUILDUP', visibleXLeftMm, screenFaceYcad, visibleWidthMm, baffleDepthMm));
        }

        // SCREEN_FRAME — full frame width at screen face
        dxf.push(dxfRect('SCREEN_FRAME', overallXLeftMm, screenFaceYcad - screenThickMm, overallWidthMm, screenThickMm));

        // SCREEN_VIEWABLE — viewable face line
        dxf.push(dxfLine('SCREEN_VIEWABLE', visibleXLeftMm, screenFaceYcad, visibleXLeftMm + visibleWidthMm, screenFaceYcad));

        // SCREEN_LABELS
        dxf.push(dxfText('SCREEN_LABELS', centreXmm - 200, screenFaceYcad + 80, 80, 'SCREEN'));
        if (visibleWidthMm > 0) {
            dxf.push(dxfText('SCREEN_LABELS', centreXmm - 300, screenFaceYcad - screenThickMm - 50, 70, `VIEWABLE: ${Math.round(visibleWidthMm)} mm`));
        }
        if (overallWidthMm > visibleWidthMm) {
            dxf.push(dxfText('SCREEN_LABELS', centreXmm - 300, screenFaceYcad - screenThickMm - 130, 70, `FRAME: ${Math.round(overallWidthMm)} mm`));
        }
    } else if (Number.isFinite(screenFrontPlaneM)) {
        // Fallback: simple screen line
        const sy = cy(screenFrontPlaneM);
        dxf.push(dxfLine('SCREEN_VIEWABLE', 0, sy, W, sy));
        dxf.push(dxfText('SCREEN_LABELS', W / 2, sy + 80, 80, 'SCREEN'));
    }

    // ROOM_ELEMENTS (per-type sublayers)
    (roomElements || []).filter(el => el.type !== 'projector').forEach(el => {
        const coords = roomElementToRoomCoords(el, roomW, roomL);
        if (!coords) return;
        const { x, y, w, h } = coords;
        const ex = cx(x);
        const ey_top = cy(y);
        const ey_bot = cy(y + h);
        const ew = Math.round(w * 1000);
        const eh = Math.abs(ey_top - ey_bot);
        const ey_lower = Math.min(ey_top, ey_bot);
        const layer = roomElementLayer(el.type);
        dxf.push(dxfRect(layer, ex, ey_lower, ew, eh));
        dxf.push(dxfText('ROOM_ELEMENT_LABELS', ex, ey_lower - 50, 70, String(el.type || el.name || 'ELEMENT').toUpperCase()));
    });

    // PROJECTOR
    if (projector && Number.isFinite(projector.x_lens_m) && Number.isFinite(projector.y_lens_m)) {
        const pxc = cx(projector.x_lens_m);
        const pyc = cy(projector.y_lens_m);
        const bw = Math.round((projector.body_width_m || 0.4) * 1000);
        const bd = Math.round((projector.body_depth_m || 0.3) * 1000);
        dxf.push(dxfRect('PROJECTOR_BODY', pxc - bw / 2, pyc - bd / 2, bw, bd));
        dxf.push(dxfCross('PROJECTOR_LENS', pxc, pyc, 50));
        // Optional throw line toward screen (if screen geometry known)
        if (sg.hasScreen) {
            dxf.push(dxfLine('PROJECTOR_THROW', pxc, pyc, sg.centreXmm, sg.screenFaceYcad));
        }
        dxf.push(dxfText('PROJECTOR_LABELS', pxc + bw / 2 + LABEL_OFFSET, pyc, TEXT_H, 'PROJECTOR'));
    }

    // SEATING
    (seatingPositions || []).forEach((seat, idx) => {
        if (!Number.isFinite(seat?.x) || !Number.isFinite(seat?.y)) return;
        const sx = cx(seat.x);
        const sy = cy(seat.y);
        const isMLP = seat.id === mlpSeatId;
        dxf.push(`0\nCIRCLE\n8\nSEATING\n10\n${sx}\n20\n${sy}\n40\n130`);
        dxf.push(dxfText('LABELS', sx + 160, sy + 40, TEXT_H, isMLP ? 'MLP' : `S${idx + 1}`));
    });

    // SPEAKERS — true product footprints
    (placedSpeakers || []).forEach(spk => {
        if (!Number.isFinite(spk?.position?.x) || !Number.isFinite(spk?.position?.y)) return;
        const role = String(spk?.role || '').toUpperCase();
        if (!role || role === 'LFE') return;

        const spx = cx(spk.position.x);
        const spy = cy(spk.position.y);
        const modelName = spk.model || spk.brand_model || '';
        const wall = classifyWall(role);

        if (wall === 'overhead') {
            const hs = OVERHEAD_MARKER_HS;
            dxf.push(dxfRect('SPEAKERS', spx - hs, spy - hs, hs * 2, hs * 2));
            dxf.push(dxfCross('CABLE_POINTS', spx, spy, Math.round(hs * 0.5)));
            dxf.push(dxfText('LABELS', spx + hs + LABEL_OFFSET, spy + 30, TEXT_H, role));
            return;
        }

        const { planWidthMm, planDepthMm, isRound, diameterMm } = getSpeakerFootprintMm(modelName, role);

        if (isRound) {
            const r = Math.round(diameterMm / 2);
            dxf.push(`0\nCIRCLE\n8\nSPEAKERS\n10\n${spx}\n20\n${spy}\n40\n${r}`);
            dxf.push(dxfCross('CABLE_POINTS', spx, spy, Math.round(r * 0.45)));
        } else {
            const hw = Math.round(planWidthMm / 2);
            const hd = Math.round(planDepthMm / 2);
            dxf.push(dxfRect('SPEAKERS', spx - hw, spy - hd, planWidthMm, planDepthMm));
            dxf.push(dxfCross('CABLE_POINTS', spx, spy, Math.round(Math.min(hw, hd) * 0.4)));
        }
        dxf.push(dxfText('LABELS', spx + Math.round(planWidthMm / 2) + LABEL_OFFSET, spy + 30, TEXT_H, role));
    });

    // SUBWOOFERS — true product footprints with orientation
    const addDXFSub = (sub, idx, prefix) => {
        if (!Number.isFinite(sub?.x) || !Number.isFinite(sub?.y)) return;
        const sx = cx(sub.x);
        const sy = cy(sub.y);
        const label = `${prefix}${idx + 1}`;
        const { planWidthMm, planDepthMm } = getSpeakerFootprintMm(
            sub.model || sub.brand_model || '', 'SUB', sub.orientation || 'vertical'
        );
        const hw = Math.round(planWidthMm / 2);
        const hd = Math.round(planDepthMm / 2);
        dxf.push(dxfRect('SUBWOOFERS', sx - hw, sy - hd, planWidthMm, planDepthMm));
        dxf.push(dxfCross('CABLE_POINTS', sx, sy, Math.round(Math.min(hw, hd) * 0.35)));
        dxf.push(dxfText('LABELS', sx + hw + LABEL_OFFSET, sy + 30, TEXT_H, label));
    };

    if (frontSubsCfg?.positions) frontSubsCfg.positions.forEach((s, i) => addDXFSub(s, i, 'SUBF'));
    if (rearSubsCfg?.positions)  rearSubsCfg.positions.forEach((s, i) => addDXFSub(s, i, 'SUBR'));

    dxf.push('0\nENDSEC\n0\nEOF');
    return dxf.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Download helper
// ─────────────────────────────────────────────────────────────────────────────

export function downloadTextFile(content, filename, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}