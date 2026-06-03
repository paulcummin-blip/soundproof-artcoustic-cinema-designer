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
 */

// ─────────────────────────────────────────────────────────────────────────────
// Coordinate helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convert app metres to CAD millimetres (X axis — no flip). */
const toX = (xM) => Math.round(Number(xM || 0) * 1000);

/** Convert app Y metres to CAD millimetres (Y axis — flipped so front wall is at top). */
function toY(yM, roomLengthM) {
    return Math.round((roomLengthM - Number(yM || 0)) * 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// DXF primitive builders
// ─────────────────────────────────────────────────────────────────────────────

function dxfLine(layer, x1, y1, x2, y2) {
    return `0\nLINE\n8\n${layer}\n10\n${x1}\n20\n${y1}\n11\n${x2}\n21\n${y2}`;
}

/** Small square marker centred at (cx, cy) with half-size hs. */
function dxfSquare(layer, cx, cy, hs) {
    const lines = [];
    lines.push(dxfLine(layer, cx - hs, cy - hs, cx + hs, cy - hs)); // bottom
    lines.push(dxfLine(layer, cx + hs, cy - hs, cx + hs, cy + hs)); // right
    lines.push(dxfLine(layer, cx + hs, cy + hs, cx - hs, cy + hs)); // top
    lines.push(dxfLine(layer, cx - hs, cy + hs, cx - hs, cy - hs)); // left
    return lines.join('\n');
}

/** Cross (+) through a square marker. */
function dxfCross(layer, cx, cy, hs) {
    const lines = [];
    lines.push(dxfLine(layer, cx - hs, cy, cx + hs, cy));
    lines.push(dxfLine(layer, cx, cy - hs, cx, cy + hs));
    return lines.join('\n');
}

/** Rectangle by corner + width/height. */
function dxfRect(layer, x, y, w, h) {
    const lines = [];
    lines.push(dxfLine(layer, x, y, x + w, y));
    lines.push(dxfLine(layer, x + w, y, x + w, y + h));
    lines.push(dxfLine(layer, x + w, y + h, x, y + h));
    lines.push(dxfLine(layer, x, y + h, x, y));
    return lines.join('\n');
}

/**
 * DXF TEXT entity.
 * group 72 = horizontal justification: 0=left, 1=centre, 2=right
 * group 73 = vertical justification: 0=baseline, 1=bottom, 2=middle, 3=top
 * When 72/73 are used, groups 11/21 (alignment point) must be provided.
 */
function dxfText(layer, x, y, height, text, hjust = 0, vjust = 0) {
    if (hjust === 0 && vjust === 0) {
        // Simple left-baseline text — no alignment point needed
        return `0\nTEXT\n8\n${layer}\n10\n${x}\n20\n${y}\n40\n${height}\n1\n${text}`;
    }
    return `0\nTEXT\n8\n${layer}\n10\n${x}\n20\n${y}\n40\n${height}\n1\n${text}\n72\n${hjust}\n73\n${vjust}\n11\n${x}\n21\n${y}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG primitive builders
// ─────────────────────────────────────────────────────────────────────────────

function svgLine(x1, y1, x2, y2, stroke = 'black', sw = 1.5) {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"/>`;
}

function svgSquare(cx, cy, hs, fill = 'black', stroke = 'black', sw = 1) {
    return `<rect x="${cx - hs}" y="${cy - hs}" width="${hs * 2}" height="${hs * 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
}

function svgCross(cx, cy, hs, stroke = 'white', sw = 1) {
    return [
        `<line x1="${cx - hs}" y1="${cy}" x2="${cx + hs}" y2="${cy}" stroke="${stroke}" stroke-width="${sw}"/>`,
        `<line x1="${cx}" y1="${cy - hs}" x2="${cx}" y2="${cy + hs}" stroke="${stroke}" stroke-width="${sw}"/>`,
    ].join('\n    ');
}

function svgRect(x, y, w, h, fill = 'none', stroke = 'black', sw = 1.5) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
}

function svgText(x, y, text, fontSize = 100, anchor = 'start', fill = 'black') {
    return `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="sans-serif" text-anchor="${anchor}" fill="${fill}">${text}</text>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wall geometry helper for room elements
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a wall-mounted room element to room-space XY coordinates (metres).
 * Returns { x, y, w, h } in app metres (before CAD transform).
 */
function roomElementToRoomCoords(el, roomWidthM, roomLengthM) {
    const wall = el.wall;
    const elWidthM = Number(el.width || 0);
    const posRatio = Number(el.x_position || 0); // 0–1 along the wall

    switch (wall) {
        case 'front': {
            // Front wall: y=0, element runs left-to-right along X
            const x = posRatio * roomWidthM - elWidthM / 2;
            return { x, y: 0, w: elWidthM, h: 0.15, wallAxis: 'x' };
        }
        case 'back': {
            const x = posRatio * roomWidthM - elWidthM / 2;
            return { x, y: roomLengthM - 0.15, w: elWidthM, h: 0.15, wallAxis: 'x' };
        }
        case 'left': {
            // Left wall: x=0, element runs front-to-rear along Y
            const y = posRatio * roomLengthM - elWidthM / 2;
            return { x: 0, y, w: 0.15, h: elWidthM, wallAxis: 'y' };
        }
        case 'right': {
            const y = posRatio * roomLengthM - elWidthM / 2;
            return { x: roomWidthM - 0.15, y, w: 0.15, h: elWidthM, wallAxis: 'y' };
        }
        default:
            return null;
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
// SVG Export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate SVG file content from room geometry.
 * Front/screen wall is at the TOP of the drawing (Y-flipped).
 */
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
    const W = Math.round(roomW * 1000); // mm
    const L = Math.round(roomL * 1000); // mm

    // Y-flip helper scoped to this room
    const cy = (yM) => toY(yM, roomL);
    const cx = (xM) => toX(xM);

    const SPEAKER_HS = 75;  // half-size of speaker square marker (mm)
    const SUB_HS = 110;     // half-size of subwoofer square marker (mm)
    const LABEL_OFFSET = 120; // mm from marker edge to label
    const TEXT_H = 90;

    const mlpSeatId = findMlpSeatId(mlp, seatingPositions);
    const svg = [];

    svg.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    svg.push(`<svg width="${W}mm" height="${L}mm" viewBox="0 0 ${W} ${L}" xmlns="http://www.w3.org/2000/svg">`);
    svg.push(`  <desc>CAD Overlay — Room Plan (true scale, mm) — front/screen wall at top</desc>`);

    // ── ROOM_OUTLINE ──────────────────────────────────────────────────────────
    svg.push(`  <g id="ROOM_OUTLINE" stroke="black" stroke-width="2" fill="none">`);
    svg.push(`    <rect x="0" y="0" width="${W}" height="${L}"/>`);
    // Front wall label
    svg.push(`    ${svgText(W / 2 - 200, 80, 'FRONT / SCREEN WALL', 80, 'middle', '#555')}`);
    svg.push(`    ${svgText(W / 2 - 200, L - 30, 'REAR WALL', 80, 'middle', '#555')}`);
    svg.push(`  </g>`);

    // ── SCREEN ────────────────────────────────────────────────────────────────
    if (Number.isFinite(screenFrontPlaneM)) {
        const sy = cy(screenFrontPlaneM);
        svg.push(`  <g id="SCREEN" stroke="#1B4FBB" stroke-width="3" fill="none">`);
        svg.push(`    ${svgLine(0, sy, W, sy, '#1B4FBB', 3)}`);
        svg.push(`    ${svgText(W / 2, sy - 40, 'SCREEN', 80, 'middle', '#1B4FBB')}`);
        svg.push(`  </g>`);
    }

    // ── ROOM_ELEMENTS ─────────────────────────────────────────────────────────
    if (Array.isArray(roomElements) && roomElements.length > 0) {
        svg.push(`  <g id="ROOM_ELEMENTS" stroke="#7B4E1E" stroke-width="1.5" fill="rgba(180,120,60,0.15)">`);
        roomElements.filter(el => el.type !== 'projector').forEach(el => {
            const coords = roomElementToRoomCoords(el, roomW, roomL);
            if (!coords) return;
            const { x, y, w, h } = coords;
            const ex = cx(x);
            const ey = cy(y + h); // flip: top-left in CAD = bottom-left in app
            const ew = Math.round(w * 1000);
            const eh = Math.round(h * 1000);
            svg.push(`    ${svgRect(ex, ey, ew, eh, 'rgba(180,120,60,0.15)', '#7B4E1E', 1.5)}`);
            const labelType = String(el.type || el.name || 'ELEMENT').toUpperCase();
            svg.push(`    ${svgText(ex + ew / 2, ey + eh + 90, labelType, 70, 'middle', '#7B4E1E')}`);
        });
        svg.push(`  </g>`);
    }

    // ── PROJECTOR ─────────────────────────────────────────────────────────────
    if (projector && Number.isFinite(projector.x_lens_m) && Number.isFinite(projector.y_lens_m)) {
        const pxc = cx(projector.x_lens_m);
        const pyc = cy(projector.y_lens_m);
        const bw = Math.round((projector.body_width_m || 0.4) * 1000);
        const bd = Math.round((projector.body_depth_m || 0.3) * 1000);
        svg.push(`  <g id="PROJECTOR" stroke="#8B008B" stroke-width="1.5" fill="rgba(139,0,139,0.1)">`);
        svg.push(`    ${svgRect(pxc - bw / 2, pyc - bd / 2, bw, bd, 'rgba(139,0,139,0.1)', '#8B008B', 1.5)}`);
        // Lens cross
        svg.push(`    ${svgCross(pxc, pyc, 60, '#8B008B', 1.5)}`);
        svg.push(`    ${svgText(pxc + bw / 2 + 50, pyc + 30, 'PROJECTOR', TEXT_H, 'start', '#8B008B')}`);
        svg.push(`  </g>`);
    }

    // ── SEATING ───────────────────────────────────────────────────────────────
    if (Array.isArray(seatingPositions) && seatingPositions.length > 0) {
        svg.push(`  <g id="SEATING" stroke="#444" stroke-width="1" fill="none">`);
        seatingPositions.forEach((seat, idx) => {
            if (!Number.isFinite(seat?.x) || !Number.isFinite(seat?.y)) return;
            const sx = cx(seat.x);
            const sy = cy(seat.y);
            const isMLP = seat.id === mlpSeatId;
            svg.push(`    <circle cx="${sx}" cy="${sy}" r="130" stroke="${isMLP ? '#E63946' : '#444'}" stroke-width="${isMLP ? 2 : 1}" fill="none"/>`);
        });
        svg.push(`  </g>`);
        svg.push(`  <g id="LABELS_SEATS" fill="#444" font-size="${TEXT_H}" font-family="sans-serif">`);
        seatingPositions.forEach((seat, idx) => {
            if (!Number.isFinite(seat?.x) || !Number.isFinite(seat?.y)) return;
            const sx = cx(seat.x) + 150;
            const sy = cy(seat.y) + 35;
            const isMLP = seat.id === mlpSeatId;
            const label = isMLP ? 'MLP' : `S${idx + 1}`;
            svg.push(`    ${svgText(sx, sy, label, TEXT_H, 'start', isMLP ? '#E63946' : '#444')}`);
        });
        svg.push(`  </g>`);
    }

    // ── SPEAKERS ──────────────────────────────────────────────────────────────
    if (Array.isArray(placedSpeakers) && placedSpeakers.length > 0) {
        svg.push(`  <g id="SPEAKERS">`);
        placedSpeakers.forEach(spk => {
            if (!Number.isFinite(spk?.position?.x) || !Number.isFinite(spk?.position?.y)) return;
            const role = String(spk?.role || '').toUpperCase();
            if (!role || role.startsWith('LFE') || role === 'LFE') return;
            const spx = cx(spk.position.x);
            const spy = cy(spk.position.y);
            svg.push(`    ${svgSquare(spx, spy, SPEAKER_HS, 'black', 'black', 1)}`);
            svg.push(`    ${svgCross(spx, spy, SPEAKER_HS, 'white', 1)}`);
        });
        svg.push(`  </g>`);
        svg.push(`  <g id="LABELS_SPEAKERS" fill="#1B1A1A" font-family="sans-serif">`);
        placedSpeakers.forEach(spk => {
            if (!Number.isFinite(spk?.position?.x) || !Number.isFinite(spk?.position?.y)) return;
            const role = String(spk?.role || '').toUpperCase();
            if (!role || role.startsWith('LFE') || role === 'LFE') return;
            const spx = cx(spk.position.x) + SPEAKER_HS + LABEL_OFFSET;
            const spy = cy(spk.position.y) + 30;
            svg.push(`    ${svgText(spx, spy, role, TEXT_H, 'start', '#1B1A1A')}`);
        });
        svg.push(`  </g>`);
    }

    // ── SUBWOOFERS ────────────────────────────────────────────────────────────
    const addSvgSubs = (subsCfg, prefix) => {
        if (!subsCfg?.positions || !Array.isArray(subsCfg.positions)) return;
        subsCfg.positions.forEach((sub, idx) => {
            if (!Number.isFinite(sub?.x) || !Number.isFinite(sub?.y)) return;
            const sx = cx(sub.x);
            const sy = cy(sub.y);
            const label = `${prefix}${idx + 1}`;
            svg.push(`    ${svgSquare(sx, sy, SUB_HS, 'none', '#333', 2)}`);
            svg.push(`    ${svgText(sx + SUB_HS + LABEL_OFFSET, sy + 30, label, TEXT_H, 'start', '#333')}`);
        });
    };

    svg.push(`  <g id="SUBWOOFERS">`);
    addSvgSubs(frontSubsCfg, 'SUBF');
    addSvgSubs(rearSubsCfg, 'SUBR');
    svg.push(`  </g>`);

    svg.push(`</svg>`);
    return svg.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// DXF Export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate DXF R12 ASCII file content from room geometry.
 * Front/screen wall is at the TOP of the drawing (Y-flipped).
 */
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

    // Y-flip helper scoped to this room
    const cy = (yM) => toY(yM, roomL);
    const cx = (xM) => toX(xM);

    const SPEAKER_HS = 75;
    const SUB_HS = 110;
    const LABEL_OFFSET = 130; // mm from marker to text
    const TEXT_H = 90;

    const mlpSeatId = findMlpSeatId(mlp, seatingPositions);

    const dxf = [];

    // ── HEADER ────────────────────────────────────────────────────────────────
    dxf.push('0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC');

    // ── LAYERS ────────────────────────────────────────────────────────────────
    const ALL_LAYERS = [
        'ROOM_OUTLINE',
        'SCREEN',
        'ROOM_ELEMENTS',
        'SPEAKERS',
        'SUBWOOFERS',
        'SEATING',
        'PROJECTOR',
        'CABLE_POINTS',
        'LABELS',
        'DIMENSIONS',
    ];
    dxf.push('0\nSECTION\n2\nTABLES');
    dxf.push(`0\nTABLE\n2\nLAYER\n70\n${ALL_LAYERS.length}`);
    ALL_LAYERS.forEach(name => {
        dxf.push(`0\nLAYER\n2\n${name}\n70\n0\n62\n7\n6\nCONTINUOUS`);
    });
    dxf.push('0\nENDTAB\n0\nENDSEC');

    // ── ENTITIES ─────────────────────────────────────────────────────────────
    dxf.push('0\nSECTION\n2\nENTITIES');

    // ROOM_OUTLINE — front wall at top (CAD Y = L), rear wall at bottom (CAD Y = 0)
    // Front wall (top):  Y = L
    // Rear wall (bottom): Y = 0
    // Left wall:  X = 0
    // Right wall: X = W
    dxf.push(dxfLine('ROOM_OUTLINE', 0,   L, W,   L)); // front wall (top)
    dxf.push(dxfLine('ROOM_OUTLINE', W,   L, W,   0)); // right wall
    dxf.push(dxfLine('ROOM_OUTLINE', W,   0, 0,   0)); // rear wall (bottom)
    dxf.push(dxfLine('ROOM_OUTLINE', 0,   0, 0,   L)); // left wall
    // Wall labels
    dxf.push(dxfText('LABELS', W / 2, L + 80, 80, 'FRONT / SCREEN WALL'));
    dxf.push(dxfText('LABELS', W / 2, -50, 80, 'REAR WALL'));

    // SCREEN
    if (Number.isFinite(screenFrontPlaneM)) {
        const sy = cy(screenFrontPlaneM);
        dxf.push(dxfLine('SCREEN', 0, sy, W, sy));
        dxf.push(dxfText('LABELS', W / 2, sy + 80, 80, 'SCREEN'));
    }

    // ROOM_ELEMENTS (doors, windows, architectural features)
    if (Array.isArray(roomElements)) {
        roomElements.filter(el => el.type !== 'projector').forEach(el => {
            const coords = roomElementToRoomCoords(el, roomW, roomL);
            if (!coords) return;
            const { x, y, w, h } = coords;
            const ex = cx(x);
            // In CAD, the element's top edge in app = smallest CAD Y (furthest into room from screen)
            // element occupies from y to y+h in app space → cy(y+h) to cy(y) in CAD
            const ey_top = cy(y);       // top edge in CAD (closest to screen)
            const ey_bot = cy(y + h);   // bottom edge in CAD (away from screen)
            const ew = Math.round(w * 1000);
            const eh = Math.abs(ey_top - ey_bot);
            const ey_lower = Math.min(ey_top, ey_bot);
            dxf.push(dxfRect('ROOM_ELEMENTS', ex, ey_lower, ew, eh));
            const labelType = String(el.type || el.name || 'ELEMENT').toUpperCase();
            dxf.push(dxfText('LABELS', ex, ey_lower - 50, 70, labelType));
        });
    }

    // PROJECTOR
    if (projector && Number.isFinite(projector.x_lens_m) && Number.isFinite(projector.y_lens_m)) {
        const pxc = cx(projector.x_lens_m);
        const pyc = cy(projector.y_lens_m);
        const bw = Math.round((projector.body_width_m || 0.4) * 1000);
        const bd = Math.round((projector.body_depth_m || 0.3) * 1000);
        dxf.push(dxfRect('PROJECTOR', pxc - bw / 2, pyc - bd / 2, bw, bd));
        // Lens cross
        dxf.push(dxfLine('PROJECTOR', pxc - 60, pyc, pxc + 60, pyc));
        dxf.push(dxfLine('PROJECTOR', pxc, pyc - 60, pxc, pyc + 60));
        dxf.push(dxfText('LABELS', pxc + bw / 2 + LABEL_OFFSET, pyc, TEXT_H, 'PROJECTOR'));
    }

    // SEATING
    if (Array.isArray(seatingPositions)) {
        seatingPositions.forEach((seat, idx) => {
            if (!Number.isFinite(seat?.x) || !Number.isFinite(seat?.y)) return;
            const sx = cx(seat.x);
            const sy = cy(seat.y);
            const isMLP = seat.id === mlpSeatId;
            const label = isMLP ? 'MLP' : `S${idx + 1}`;
            dxf.push(`0\nCIRCLE\n8\nSEATING\n10\n${sx}\n20\n${sy}\n40\n130`);
            dxf.push(dxfText('LABELS', sx + 160, sy + 40, TEXT_H, label));
        });
    }

    // SPEAKERS — square + cross markers
    if (Array.isArray(placedSpeakers)) {
        placedSpeakers.forEach(spk => {
            if (!Number.isFinite(spk?.position?.x) || !Number.isFinite(spk?.position?.y)) return;
            const role = String(spk?.role || '').toUpperCase();
            if (!role || role.startsWith('LFE') || role === 'LFE') return;
            const spx = cx(spk.position.x);
            const spy = cy(spk.position.y);
            // Square marker
            dxf.push(dxfSquare('SPEAKERS', spx, spy, SPEAKER_HS));
            // Cross through square
            dxf.push(dxfCross('SPEAKERS', spx, spy, SPEAKER_HS));
            // Label beside, offset to the right
            dxf.push(dxfText('LABELS', spx + SPEAKER_HS + LABEL_OFFSET, spy + 30, TEXT_H, role));
        });
    }

    // SUBWOOFERS — larger square markers
    const addDXFSubs = (subsCfg, prefix) => {
        if (!subsCfg?.positions || !Array.isArray(subsCfg.positions)) return;
        subsCfg.positions.forEach((sub, idx) => {
            if (!Number.isFinite(sub?.x) || !Number.isFinite(sub?.y)) return;
            const sx = cx(sub.x);
            const sy = cy(sub.y);
            const label = `${prefix}${idx + 1}`;
            dxf.push(dxfSquare('SUBWOOFERS', sx, sy, SUB_HS));
            dxf.push(dxfText('LABELS', sx + SUB_HS + LABEL_OFFSET, sy + 30, TEXT_H, label));
        });
    };

    addDXFSubs(frontSubsCfg, 'SUBF');
    addDXFSubs(rearSubsCfg, 'SUBR');

    dxf.push('0\nENDSEC\n0\nEOF');

    return dxf.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Download helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trigger browser download of a text file.
 */
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