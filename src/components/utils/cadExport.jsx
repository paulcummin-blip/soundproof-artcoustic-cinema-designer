/**
 * CAD Overlay Export Utilities
 * Generates SVG and DXF R12 files from room geometry for CAD overlay use.
 *
 * COORDINATE CONVENTION:
 *   - Origin: front-left corner of the room.
 *   - App X: increases left-to-right (unchanged in export).
 *   - App Y: increases front-to-rear (rear wall = roomLengthM).
 *   - CAD Y (DXF/SVG): FLIPPED so front/screen wall is at the TOP of the drawing.
 *     CAD_Y_mm = (roomLengthM - appY_m) * 1000
 *
 * All output units: millimetres.
 *
 * SPEAKER FOOTPRINT LOGIC:
 *   - getSpeakerModelMeta() from the registry provides widthM, depthM (and round/diameterM).
 *   - Wall orientation determines how width/depth map to plan-view X/Y dimensions.
 *   - Front/rear wall speakers: widthM → X axis, depthM → Y axis (into room).
 *   - Side wall speakers: widthM → Y axis (along wall), depthM → X axis (into room).
 *   - Overhead/ceiling speakers: use diameterM as circle or small square — no rotation needed.
 *   - Fallback: 150×82 mm generic square if model metadata is missing.
 */

import { getSpeakerModelMeta } from '@/components/models/speakers/registry';

// ─────────────────────────────────────────────────────────────────────────────
// Coordinate helpers
// ─────────────────────────────────────────────────────────────────────────────

const toX = (xM) => Math.round(Number(xM || 0) * 1000);

function toY(yM, roomLengthM) {
    return Math.round((roomLengthM - Number(yM || 0)) * 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Speaker wall-classification helper
// ─────────────────────────────────────────────────────────────────────────────

// Roles that are ceiling/overhead — keep as small markers
const OVERHEAD_ROLES = new Set([
    'TFL', 'TFR', 'TML', 'TMR', 'TRL', 'TRR',
    'VHL', 'VHR', 'VOL', 'VOR',
    'FHL', 'FHR', 'RHL', 'RHR',
    'TSL', 'TSR',
]);

// Roles treated as front-wall facing (width across X, depth into room from front)
const FRONT_WALL_ROLES = new Set(['FL', 'FC', 'FR', 'FWL', 'FWR', 'LCR', 'C', 'L', 'R']);
// Roles on the rear wall (width across X, depth into room from back)
const REAR_WALL_ROLES = new Set(['RL', 'RC', 'RR', 'SBL', 'SBR', 'BSL', 'BSR']);
// Roles on side walls (widthM along Y, depthM projects from side wall into room along X)
const LEFT_WALL_ROLES = new Set(['SL', 'SBL', 'SSL', 'LSR', 'LS', 'LSS']);
const RIGHT_WALL_ROLES = new Set(['SR', 'SBR', 'SSR', 'RSR', 'RS', 'RSS']);

/**
 * Classify a speaker's wall based on its role string.
 * Returns: 'front' | 'rear' | 'left' | 'right' | 'overhead' | 'unknown'
 */
function classifyWall(role) {
    const r = String(role || '').toUpperCase().trim();
    if (OVERHEAD_ROLES.has(r)) return 'overhead';
    if (FRONT_WALL_ROLES.has(r)) return 'front';
    if (REAR_WALL_ROLES.has(r)) return 'rear';
    if (LEFT_WALL_ROLES.has(r)) return 'left';
    if (RIGHT_WALL_ROLES.has(r)) return 'right';
    // Heuristic fallback: look at role suffix
    if (r.endsWith('L') && (r.startsWith('S') || r.startsWith('SS'))) return 'left';
    if (r.endsWith('R') && (r.startsWith('S') || r.startsWith('SS'))) return 'right';
    return 'unknown';
}

/**
 * Get the plan-view footprint dimensions for a speaker in millimetres,
 * accounting for wall orientation.
 *
 * @param {string} modelName  - speaker model string from placedSpeakers entry
 * @param {string} role       - speaker role (used to determine wall)
 * @param {string} [subOrientation] - 'horizontal' | 'vertical' for sub4-12
 * @returns {{ planWidthMm: number, planDepthMm: number, isRound: boolean, diameterMm: number, fallback: boolean }}
 */
function getSpeakerFootprintMm(modelName, role, subOrientation) {
    const FALLBACK_WIDTH = 150;
    const FALLBACK_DEPTH = 82;

    if (!modelName) {
        return { planWidthMm: FALLBACK_WIDTH, planDepthMm: FALLBACK_DEPTH, isRound: false, diameterMm: 0, fallback: true };
    }

    const meta = getSpeakerModelMeta(modelName, subOrientation);
    const fallback = !!(meta?.notFound);

    if (meta?.round) {
        const dMm = Math.round((meta.diameterM || 0.2) * 1000);
        return { planWidthMm: dMm, planDepthMm: dMm, isRound: true, diameterMm: dMm, fallback };
    }

    const wMm = Math.round((meta?.widthM || FALLBACK_WIDTH / 1000) * 1000);
    const dMm = Math.round((meta?.depthM || FALLBACK_DEPTH / 1000) * 1000);

    const wall = classifyWall(role);

    // For side walls: the cabinet "width" (long edge) runs along the wall (Y in app),
    // and the "depth" projects into the room (X in app). Swap axes in plan view.
    if (wall === 'left' || wall === 'right') {
        return { planWidthMm: dMm, planDepthMm: wMm, isRound: false, diameterMm: 0, fallback };
    }

    // Front/rear/unknown: width across X, depth into room (Y axis)
    return { planWidthMm: wMm, planDepthMm: dMm, isRound: false, diameterMm: 0, fallback };
}

// ─────────────────────────────────────────────────────────────────────────────
// DXF primitive builders
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

/** Small cross (+) centred at (cx, cy). arm = arm half-length in mm. */
function dxfCross(layer, cx, cy, arm) {
    return [
        dxfLine(layer, cx - arm, cy, cx + arm, cy),
        dxfLine(layer, cx, cy - arm, cx, cy + arm),
    ].join('\n');
}

/**
 * Draw a speaker cabinet footprint rectangle in DXF.
 * cx/cy = centre of cabinet in CAD mm coords.
 * planWidthMm = dimension along X axis (horizontal in drawing).
 * planDepthMm = dimension along Y axis (vertical in drawing).
 */
function dxfCabinetRect(cabinetLayer, cableLayer, cx, cy, planWidthMm, planDepthMm) {
    const hw = planWidthMm / 2;
    const hd = planDepthMm / 2;
    const crossArm = Math.min(hw, hd) * 0.4;
    return [
        dxfRect(cabinetLayer, cx - hw, cy - hd, planWidthMm, planDepthMm),
        dxfCross(cableLayer, cx, cy, crossArm),
    ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG primitive builders
// ─────────────────────────────────────────────────────────────────────────────

function svgLine(x1, y1, x2, y2, stroke = 'black', sw = 1.5) {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"/>`;
}

function svgRect(x, y, w, h, fill = 'none', stroke = 'black', sw = 1.5) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
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
// Room element helper
// ─────────────────────────────────────────────────────────────────────────────

function roomElementToRoomCoords(el, roomWidthM, roomLengthM) {
    const wall = el.wall;
    const elWidthM = Number(el.width || 0);
    const posRatio = Number(el.x_position || 0);

    switch (wall) {
        case 'front': {
            const x = posRatio * roomWidthM - elWidthM / 2;
            return { x, y: 0, w: elWidthM, h: 0.15 };
        }
        case 'back': {
            const x = posRatio * roomWidthM - elWidthM / 2;
            return { x, y: roomLengthM - 0.15, w: elWidthM, h: 0.15 };
        }
        case 'left': {
            const y = posRatio * roomLengthM - elWidthM / 2;
            return { x: 0, y, w: 0.15, h: elWidthM };
        }
        case 'right': {
            const y = posRatio * roomLengthM - elWidthM / 2;
            return { x: roomWidthM - 0.15, y, w: 0.15, h: elWidthM };
        }
        default: return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MLP finder
// ─────────────────────────────────────────────────────────────────────────────

function findMlpSeatId(mlp, seatingPositions) {
    if (!mlp || !Array.isArray(seatingPositions)) return null;
    let minDist = Infinity;
    let mlpSeatId = null;
    seatingPositions.forEach(s => {
        if (!Number.isFinite(s?.x) || !Number.isFinite(s?.y)) return;
        const d = Math.hypot(s.x - mlp.x, s.y - mlp.y);
        if (d < minDist) { minDist = d; mlpSeatId = s.id; }
    });
    return minDist <= 0.05 ? mlpSeatId : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Overhead fallback marker size (mm half-size)
// ─────────────────────────────────────────────────────────────────────────────
const OVERHEAD_MARKER_HS = 60; // 120mm square for overheads

// ─────────────────────────────────────────────────────────────────────────────
// SVG Export
// ─────────────────────────────────────────────────────────────────────────────

export function generateSVG({
    roomDims,
    seatingPositions,
    placedSpeakers,
    screenFrontPlaneM,
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
    svg.push(`  <desc>CAD Overlay — Room Plan (true scale, mm) — front/screen wall at top</desc>`);

    // ── ROOM_OUTLINE ──────────────────────────────────────────────────────────
    svg.push(`  <g id="ROOM_OUTLINE">`);
    svg.push(`    <rect x="0" y="0" width="${W}" height="${L}" fill="none" stroke="black" stroke-width="2"/>`);
    svg.push(`    ${svgText(W / 2, 80, 'FRONT / SCREEN WALL', 75, 'middle', '#555')}`);
    svg.push(`    ${svgText(W / 2, L - 30, 'REAR WALL', 75, 'middle', '#555')}`);
    svg.push(`  </g>`);

    // ── SCREEN ────────────────────────────────────────────────────────────────
    if (Number.isFinite(screenFrontPlaneM)) {
        const sy = cy(screenFrontPlaneM);
        svg.push(`  <g id="SCREEN">`);
        svg.push(`    ${svgLine(0, sy, W, sy, '#1B4FBB', 3)}`);
        svg.push(`    ${svgText(W / 2, sy - 40, 'SCREEN', 75, 'middle', '#1B4FBB')}`);
        svg.push(`  </g>`);
    }

    // ── ROOM_ELEMENTS ─────────────────────────────────────────────────────────
    if (Array.isArray(roomElements) && roomElements.length > 0) {
        svg.push(`  <g id="ROOM_ELEMENTS">`);
        roomElements.filter(el => el.type !== 'projector').forEach(el => {
            const coords = roomElementToRoomCoords(el, roomW, roomL);
            if (!coords) return;
            const { x, y, w, h } = coords;
            const ex = cx(x);
            const ey = cy(y + h);
            const ew = Math.round(w * 1000);
            const eh = Math.round(h * 1000);
            svg.push(`    ${svgRect(ex, ey, ew, eh, 'rgba(180,120,60,0.15)', '#7B4E1E', 1.5)}`);
            svg.push(`    ${svgText(ex + ew / 2, ey + eh + 85, String(el.type || el.name || 'ELEMENT').toUpperCase(), 70, 'middle', '#7B4E1E')}`);
        });
        svg.push(`  </g>`);
    }

    // ── PROJECTOR ─────────────────────────────────────────────────────────────
    if (projector && Number.isFinite(projector.x_lens_m) && Number.isFinite(projector.y_lens_m)) {
        const pxc = cx(projector.x_lens_m);
        const pyc = cy(projector.y_lens_m);
        const bw = Math.round((projector.body_width_m || 0.4) * 1000);
        const bd = Math.round((projector.body_depth_m || 0.3) * 1000);
        svg.push(`  <g id="PROJECTOR">`);
        svg.push(`    ${svgRect(pxc - bw / 2, pyc - bd / 2, bw, bd, 'rgba(139,0,139,0.1)', '#8B008B', 1.5)}`);
        svg.push(`    ${svgCross(pxc, pyc, 55, '#8B008B', 1.5)}`);
        svg.push(`    ${svgText(pxc + bw / 2 + LABEL_OFFSET, pyc + 30, 'PROJECTOR', TEXT_H, 'start', '#8B008B')}`);
        svg.push(`  </g>`);
    }

    // ── SEATING ───────────────────────────────────────────────────────────────
    if (Array.isArray(seatingPositions) && seatingPositions.length > 0) {
        svg.push(`  <g id="SEATING">`);
        seatingPositions.forEach((seat, idx) => {
            if (!Number.isFinite(seat?.x) || !Number.isFinite(seat?.y)) return;
            const sx = cx(seat.x);
            const sy = cy(seat.y);
            const isMLP = seat.id === mlpSeatId;
            const col = isMLP ? '#E63946' : '#444';
            const sw = isMLP ? 2 : 1;
            svg.push(`    <circle cx="${sx}" cy="${sy}" r="130" stroke="${col}" stroke-width="${sw}" fill="none"/>`);
            svg.push(`    ${svgText(sx + 150, sy + 35, isMLP ? 'MLP' : `S${idx + 1}`, TEXT_H, 'start', col)}`);
        });
        svg.push(`  </g>`);
    }

    // ── SPEAKERS ──────────────────────────────────────────────────────────────
    if (Array.isArray(placedSpeakers) && placedSpeakers.length > 0) {
        svg.push(`  <g id="SPEAKERS">`);
        placedSpeakers.forEach(spk => {
            if (!Number.isFinite(spk?.position?.x) || !Number.isFinite(spk?.position?.y)) return;
            const role = String(spk?.role || '').toUpperCase();
            if (!role || role === 'LFE') return;

            const spx = cx(spk.position.x);
            const spy = cy(spk.position.y);
            const modelName = spk.model || spk.brand_model || '';
            const wall = classifyWall(role);

            if (wall === 'overhead') {
                // Overhead: small square + cross marker
                const hs = OVERHEAD_MARKER_HS;
                svg.push(`    ${svgRect(spx - hs, spy - hs, hs * 2, hs * 2, 'rgba(80,80,200,0.08)', '#5050C8', 1)}`);
                svg.push(`    ${svgCross(spx, spy, hs * 0.6, '#5050C8', 0.8)}`);
                svg.push(`    ${svgText(spx + hs + LABEL_OFFSET, spy + 30, role, TEXT_H, 'start', '#5050C8')}`);
                return;
            }

            const { planWidthMm, planDepthMm, isRound, diameterMm } = getSpeakerFootprintMm(modelName, role);
            const hw = planWidthMm / 2;
            const hd = planDepthMm / 2;

            // For front-wall speakers the cabinet protrudes INTO the room (increasing Y in app = increasing CAD Y downward).
            // We place the footprint centred on the speaker's recorded position.
            // Side wall speakers similarly centred.
            if (isRound) {
                const r = diameterMm / 2;
                svg.push(`    <circle cx="${spx}" cy="${spy}" r="${r}" fill="rgba(0,0,0,0.05)" stroke="black" stroke-width="1.5"/>`);
                svg.push(`    ${svgCross(spx, spy, r * 0.5, '#333', 1)}`);
            } else {
                svg.push(`    ${svgRect(spx - hw, spy - hd, planWidthMm, planDepthMm, 'rgba(0,0,0,0.05)', 'black', 1.5)}`);
                const crossArm = Math.min(hw, hd) * 0.4;
                svg.push(`    ${svgCross(spx, spy, crossArm, '#333', 1)}`);
            }

            // Label: place to the right of the cabinet
            svg.push(`    ${svgText(spx + hw + LABEL_OFFSET, spy + 30, role, TEXT_H, 'start', '#1B1A1A')}`);
        });
        svg.push(`  </g>`);
    }

    // ── SUBWOOFERS ────────────────────────────────────────────────────────────
    svg.push(`  <g id="SUBWOOFERS">`);

    const addSvgSub = (sub, idx, prefix) => {
        if (!Number.isFinite(sub?.x) || !Number.isFinite(sub?.y)) return;
        const sx = cx(sub.x);
        const sy = cy(sub.y);
        const label = `${prefix}${idx + 1}`;
        const modelName = sub.model || sub.brand_model || '';
        const orientation = sub.orientation || 'vertical';

        const { planWidthMm, planDepthMm } = getSpeakerFootprintMm(modelName, 'SUB', orientation);
        const hw = planWidthMm / 2;
        const hd = planDepthMm / 2;
        const crossArm = Math.min(hw, hd) * 0.35;

        svg.push(`    ${svgRect(sx - hw, sy - hd, planWidthMm, planDepthMm, 'rgba(50,50,50,0.05)', '#333', 2)}`);
        svg.push(`    ${svgCross(sx, sy, crossArm, '#333', 1)}`);
        svg.push(`    ${svgText(sx + hw + LABEL_OFFSET, sy + 30, label, TEXT_H, 'start', '#333')}`);
    };

    if (frontSubsCfg?.positions) frontSubsCfg.positions.forEach((s, i) => addSvgSub(s, i, 'SUBF'));
    if (rearSubsCfg?.positions)  rearSubsCfg.positions.forEach((s, i) => addSvgSub(s, i, 'SUBR'));
    svg.push(`  </g>`);

    svg.push(`</svg>`);
    return svg.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// DXF Export
// ─────────────────────────────────────────────────────────────────────────────

export function generateDXF({
    roomDims,
    seatingPositions,
    placedSpeakers,
    screenFrontPlaneM,
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
    const ALL_LAYERS = [
        'ROOM_OUTLINE', 'SCREEN', 'ROOM_ELEMENTS',
        'SPEAKERS', 'SUBWOOFERS', 'SEATING',
        'PROJECTOR', 'CABLE_POINTS', 'LABELS', 'DIMENSIONS',
    ];
    dxf.push('0\nSECTION\n2\nTABLES');
    dxf.push(`0\nTABLE\n2\nLAYER\n70\n${ALL_LAYERS.length}`);
    ALL_LAYERS.forEach(name => {
        dxf.push(`0\nLAYER\n2\n${name}\n70\n0\n62\n7\n6\nCONTINUOUS`);
    });
    dxf.push('0\nENDTAB\n0\nENDSEC');

    // ── ENTITIES ─────────────────────────────────────────────────────────────
    dxf.push('0\nSECTION\n2\nENTITIES');

    // ROOM_OUTLINE
    dxf.push(dxfLine('ROOM_OUTLINE', 0, L, W, L)); // front wall (top)
    dxf.push(dxfLine('ROOM_OUTLINE', W, L, W, 0)); // right wall
    dxf.push(dxfLine('ROOM_OUTLINE', W, 0, 0, 0)); // rear wall (bottom)
    dxf.push(dxfLine('ROOM_OUTLINE', 0, 0, 0, L)); // left wall
    dxf.push(dxfText('LABELS', W / 2, L + 80, 80, 'FRONT / SCREEN WALL'));
    dxf.push(dxfText('LABELS', W / 2, -50, 80, 'REAR WALL'));

    // SCREEN
    if (Number.isFinite(screenFrontPlaneM)) {
        const sy = cy(screenFrontPlaneM);
        dxf.push(dxfLine('SCREEN', 0, sy, W, sy));
        dxf.push(dxfText('LABELS', W / 2, sy + 80, 80, 'SCREEN'));
    }

    // ROOM_ELEMENTS
    if (Array.isArray(roomElements)) {
        roomElements.filter(el => el.type !== 'projector').forEach(el => {
            const coords = roomElementToRoomCoords(el, roomW, roomL);
            if (!coords) return;
            const { x, y, w, h } = coords;
            const ex = cx(x);
            const ey_top = cy(y);
            const ey_bot = cy(y + h);
            const ew = Math.round(w * 1000);
            const eh = Math.abs(ey_top - ey_bot);
            const ey_lower = Math.min(ey_top, ey_bot);
            dxf.push(dxfRect('ROOM_ELEMENTS', ex, ey_lower, ew, eh));
            dxf.push(dxfText('LABELS', ex, ey_lower - 50, 70, String(el.type || el.name || 'ELEMENT').toUpperCase()));
        });
    }

    // PROJECTOR
    if (projector && Number.isFinite(projector.x_lens_m) && Number.isFinite(projector.y_lens_m)) {
        const pxc = cx(projector.x_lens_m);
        const pyc = cy(projector.y_lens_m);
        const bw = Math.round((projector.body_width_m || 0.4) * 1000);
        const bd = Math.round((projector.body_depth_m || 0.3) * 1000);
        dxf.push(dxfRect('PROJECTOR', pxc - bw / 2, pyc - bd / 2, bw, bd));
        dxf.push(dxfCross('CABLE_POINTS', pxc, pyc, 50));
        dxf.push(dxfText('LABELS', pxc + bw / 2 + LABEL_OFFSET, pyc, TEXT_H, 'PROJECTOR'));
    }

    // SEATING
    if (Array.isArray(seatingPositions)) {
        seatingPositions.forEach((seat, idx) => {
            if (!Number.isFinite(seat?.x) || !Number.isFinite(seat?.y)) return;
            const sx = cx(seat.x);
            const sy = cy(seat.y);
            const isMLP = seat.id === mlpSeatId;
            dxf.push(`0\nCIRCLE\n8\nSEATING\n10\n${sx}\n20\n${sy}\n40\n130`);
            dxf.push(dxfText('LABELS', sx + 160, sy + 40, TEXT_H, isMLP ? 'MLP' : `S${idx + 1}`));
        });
    }

    // SPEAKERS — true product footprints
    if (Array.isArray(placedSpeakers)) {
        placedSpeakers.forEach(spk => {
            if (!Number.isFinite(spk?.position?.x) || !Number.isFinite(spk?.position?.y)) return;
            const role = String(spk?.role || '').toUpperCase();
            if (!role || role === 'LFE') return;

            const spx = cx(spk.position.x);
            const spy = cy(spk.position.y);
            const modelName = spk.model || spk.brand_model || '';
            const wall = classifyWall(role);

            if (wall === 'overhead') {
                // Small square marker for overheads
                const hs = OVERHEAD_MARKER_HS;
                dxf.push(dxfRect('SPEAKERS', spx - hs, spy - hs, hs * 2, hs * 2));
                dxf.push(dxfCross('CABLE_POINTS', spx, spy, hs * 0.5));
                dxf.push(dxfText('LABELS', spx + hs + LABEL_OFFSET, spy + 30, TEXT_H, role));
                return;
            }

            const { planWidthMm, planDepthMm, isRound, diameterMm } = getSpeakerFootprintMm(modelName, role);

            if (isRound) {
                const r = Math.round(diameterMm / 2);
                dxf.push(`0\nCIRCLE\n8\nSPEAKERS\n10\n${spx}\n20\n${spy}\n40\n${r}`);
                dxf.push(dxfCross('CABLE_POINTS', spx, spy, Math.round(r * 0.5)));
            } else {
                const hw = Math.round(planWidthMm / 2);
                const hd = Math.round(planDepthMm / 2);
                const crossArm = Math.round(Math.min(hw, hd) * 0.4);
                dxf.push(dxfRect('SPEAKERS', spx - hw, spy - hd, planWidthMm, planDepthMm));
                dxf.push(dxfCross('CABLE_POINTS', spx, spy, crossArm));
            }

            dxf.push(dxfText('LABELS', spx + Math.round(planWidthMm / 2) + LABEL_OFFSET, spy + 30, TEXT_H, role));
        });
    }

    // SUBWOOFERS — true product footprints with orientation
    const addDXFSub = (sub, idx, prefix) => {
        if (!Number.isFinite(sub?.x) || !Number.isFinite(sub?.y)) return;
        const sx = cx(sub.x);
        const sy = cy(sub.y);
        const label = `${prefix}${idx + 1}`;
        const modelName = sub.model || sub.brand_model || '';
        const orientation = sub.orientation || 'vertical';

        const { planWidthMm, planDepthMm } = getSpeakerFootprintMm(modelName, 'SUB', orientation);
        const hw = Math.round(planWidthMm / 2);
        const hd = Math.round(planDepthMm / 2);
        const crossArm = Math.round(Math.min(hw, hd) * 0.35);

        dxf.push(dxfRect('SUBWOOFERS', sx - hw, sy - hd, planWidthMm, planDepthMm));
        dxf.push(dxfCross('CABLE_POINTS', sx, sy, crossArm));
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