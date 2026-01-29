/**
 * CAD Overlay Export Utilities
 * Generates SVG and DXF R12 files from room geometry for CAD overlay use
 * All coordinates in millimeters, origin at front-left corner
 */

/**
 * Generate SVG file content from room geometry
 * @param {Object} params - Room geometry parameters
 * @returns {string} SVG file content
 */
export function generateSVG({ roomDims, seatingPositions, placedSpeakers, screenFrontPlaneM, mlp, frontSubsCfg, rearSubsCfg }) {
    // Convert meters to millimeters
    const toMM = (m) => Math.round(Number(m || 0) * 1000);
    
    const widthMM = toMM(roomDims?.widthM || roomDims?.width || 4.5);
    const lengthMM = toMM(roomDims?.lengthM || roomDims?.length || 6.0);
    const screenY = toMM(screenFrontPlaneM || 0);
    
    // Find MLP seat ID (within 5cm of green dot)
    let mlpSeatId = null;
    if (mlp && Array.isArray(seatingPositions)) {
        let minDist = Infinity;
        seatingPositions.forEach(s => {
            if (!Number.isFinite(s?.x) || !Number.isFinite(s?.y)) return;
            const d = Math.hypot(s.x - mlp.x, s.y - mlp.y);
            if (d < minDist) {
                minDist = d;
                mlpSeatId = s.id;
            }
        });
        if (minDist > 0.05) mlpSeatId = null;
    }
    
    const svg = [];
    
    // SVG header
    svg.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    svg.push(`<svg width="${widthMM}mm" height="${lengthMM}mm" viewBox="0 0 ${widthMM} ${lengthMM}" xmlns="http://www.w3.org/2000/svg">`);
    svg.push(`  <desc>RP22 CAD Overlay - Room Plan (true scale, millimeters)</desc>`);
    
    // ROOM layer
    svg.push(`  <g id="ROOM" stroke="black" stroke-width="2" fill="none">`);
    svg.push(`    <rect x="0" y="0" width="${widthMM}" height="${lengthMM}"/>`);
    svg.push(`  </g>`);
    
    // SCREEN layer
    if (Number.isFinite(screenY)) {
        svg.push(`  <g id="SCREEN" stroke="black" stroke-width="2" fill="none">`);
        svg.push(`    <line x1="0" y1="${screenY}" x2="${widthMM}" y2="${screenY}"/>`);
        svg.push(`  </g>`);
    }
    
    // SEATS layer
    if (Array.isArray(seatingPositions) && seatingPositions.length > 0) {
        svg.push(`  <g id="SEATS" stroke="black" stroke-width="1.5" fill="none">`);
        seatingPositions.forEach((seat, idx) => {
            if (!Number.isFinite(seat?.x) || !Number.isFinite(seat?.y)) return;
            const x = toMM(seat.x);
            const y = toMM(seat.y);
            const radius = 150; // 150mm circle
            const isMLP = seat.id === mlpSeatId;
            const label = isMLP ? 'MLP' : `S${idx + 1}`;
            svg.push(`    <circle cx="${x}" cy="${y}" r="${radius}"/>`);
        });
        svg.push(`  </g>`);
        
        // LABELS for seats
        svg.push(`  <g id="LABELS" stroke="none" fill="black" font-size="120" font-family="sans-serif" text-anchor="middle">`);
        seatingPositions.forEach((seat, idx) => {
            if (!Number.isFinite(seat?.x) || !Number.isFinite(seat?.y)) return;
            const x = toMM(seat.x);
            const y = toMM(seat.y) + 40; // offset below center
            const isMLP = seat.id === mlpSeatId;
            const label = isMLP ? 'MLP' : `S${idx + 1}`;
            svg.push(`    <text x="${x}" y="${y}">${label}</text>`);
        });
    }
    
    // SPEAKERS layer
    if (Array.isArray(placedSpeakers) && placedSpeakers.length > 0) {
        svg.push(`  <g id="SPEAKERS" stroke="black" stroke-width="1.5" fill="black">`);
        placedSpeakers.forEach(spk => {
            if (!Number.isFinite(spk?.position?.x) || !Number.isFinite(spk?.position?.y)) return;
            const x = toMM(spk.position.x);
            const y = toMM(spk.position.y);
            const radius = 100; // 100mm circle
            const role = String(spk?.role || '').toUpperCase();
            if (!role || role === 'LFE' || role.startsWith('LFE')) return; // skip subs here
            svg.push(`    <circle cx="${x}" cy="${y}" r="${radius}"/>`);
        });
        
        // Add subwoofers if present
        const addSubs = (subsCfg, label) => {
            if (!subsCfg?.positions || !Array.isArray(subsCfg.positions)) return;
            subsCfg.positions.forEach((sub, idx) => {
                if (!Number.isFinite(sub?.x) || !Number.isFinite(sub?.y)) return;
                const x = toMM(sub.x);
                const y = toMM(sub.y);
                const radius = 120; // slightly larger for subs
                svg.push(`    <circle cx="${x}" cy="${y}" r="${radius}"/>`);
            });
        };
        
        if (frontSubsCfg) addSubs(frontSubsCfg, 'F');
        if (rearSubsCfg) addSubs(rearSubsCfg, 'R');
        
        svg.push(`  </g>`);
        
        // Speaker labels
        svg.push(`  <g id="LABELS" stroke="none" fill="black" font-size="100" font-family="sans-serif" text-anchor="middle">`);
        placedSpeakers.forEach(spk => {
            if (!Number.isFinite(spk?.position?.x) || !Number.isFinite(spk?.position?.y)) return;
            const x = toMM(spk.position.x);
            const y = toMM(spk.position.y) + 35;
            const role = String(spk?.role || '').toUpperCase();
            if (!role || role === 'LFE' || role.startsWith('LFE')) return;
            svg.push(`    <text x="${x}" y="${y}">${role}</text>`);
        });
        
        // Sub labels
        const labelSubs = (subsCfg, prefix) => {
            if (!subsCfg?.positions || !Array.isArray(subsCfg.positions)) return;
            subsCfg.positions.forEach((sub, idx) => {
                if (!Number.isFinite(sub?.x) || !Number.isFinite(sub?.y)) return;
                const x = toMM(sub.x);
                const y = toMM(sub.y) + 40;
                const label = `SUB${prefix}${idx + 1}`;
                svg.push(`    <text x="${x}" y="${y}">${label}</text>`);
            });
        };
        
        if (frontSubsCfg) labelSubs(frontSubsCfg, 'F');
        if (rearSubsCfg) labelSubs(rearSubsCfg, 'R');
        
        svg.push(`  </g>`);
    } else {
        svg.push(`  </g>`);
    }
    
    svg.push(`</svg>`);
    
    return svg.join('\n');
}

/**
 * Generate DXF R12 ASCII file content from room geometry
 * @param {Object} params - Room geometry parameters
 * @returns {string} DXF file content
 */
export function generateDXF({ roomDims, seatingPositions, placedSpeakers, screenFrontPlaneM, mlp, frontSubsCfg, rearSubsCfg }) {
    // Convert meters to millimeters
    const toMM = (m) => Math.round(Number(m || 0) * 1000);
    
    const widthMM = toMM(roomDims?.widthM || roomDims?.width || 4.5);
    const lengthMM = toMM(roomDims?.lengthM || roomDims?.length || 6.0);
    const screenY = toMM(screenFrontPlaneM || 0);
    
    // Find MLP seat ID
    let mlpSeatId = null;
    if (mlp && Array.isArray(seatingPositions)) {
        let minDist = Infinity;
        seatingPositions.forEach(s => {
            if (!Number.isFinite(s?.x) || !Number.isFinite(s?.y)) return;
            const d = Math.hypot(s.x - mlp.x, s.y - mlp.y);
            if (d < minDist) {
                minDist = d;
                mlpSeatId = s.id;
            }
        });
        if (minDist > 0.05) mlpSeatId = null;
    }
    
    const dxf = [];
    
    // DXF Header (minimal R12 compatible)
    dxf.push('0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC');
    
    // Tables section (layers)
    dxf.push('0\nSECTION\n2\nTABLES');
    dxf.push('0\nTABLE\n2\nLAYER\n70\n5');
    
    const layers = ['ROOM', 'SCREEN', 'SEATS', 'SPEAKERS', 'LABELS'];
    layers.forEach(layerName => {
        dxf.push(`0\nLAYER\n2\n${layerName}\n70\n0\n62\n7\n6\nCONTINUOUS`);
    });
    
    dxf.push('0\nENDTAB\n0\nENDSEC');
    
    // Entities section
    dxf.push('0\nSECTION\n2\nENTITIES');
    
    // ROOM rectangle (4 lines)
    dxf.push('0\nLINE\n8\nROOM\n10\n0\n20\n0\n11\n' + widthMM + '\n21\n0'); // bottom
    dxf.push('0\nLINE\n8\nROOM\n10\n' + widthMM + '\n20\n0\n11\n' + widthMM + '\n21\n' + lengthMM); // right
    dxf.push('0\nLINE\n8\nROOM\n10\n' + widthMM + '\n20\n' + lengthMM + '\n11\n0\n21\n' + lengthMM); // top
    dxf.push('0\nLINE\n8\nROOM\n10\n0\n20\n' + lengthMM + '\n11\n0\n21\n0'); // left
    
    // SCREEN plane
    if (Number.isFinite(screenY)) {
        dxf.push('0\nLINE\n8\nSCREEN\n10\n0\n20\n' + screenY + '\n11\n' + widthMM + '\n21\n' + screenY);
    }
    
    // SEATS circles
    if (Array.isArray(seatingPositions) && seatingPositions.length > 0) {
        seatingPositions.forEach((seat, idx) => {
            if (!Number.isFinite(seat?.x) || !Number.isFinite(seat?.y)) return;
            const x = toMM(seat.x);
            const y = toMM(seat.y);
            const radius = 150;
            dxf.push(`0\nCIRCLE\n8\nSEATS\n10\n${x}\n20\n${y}\n40\n${radius}`);
            
            // Label
            const isMLP = seat.id === mlpSeatId;
            const label = isMLP ? 'MLP' : `S${idx + 1}`;
            const textY = y + 200; // offset below circle
            dxf.push(`0\nTEXT\n8\nLABELS\n10\n${x}\n20\n${textY}\n40\n120\n1\n${label}\n72\n1\n73\n2`);
        });
    }
    
    // SPEAKERS circles
    if (Array.isArray(placedSpeakers) && placedSpeakers.length > 0) {
        placedSpeakers.forEach(spk => {
            if (!Number.isFinite(spk?.position?.x) || !Number.isFinite(spk?.position?.y)) return;
            const x = toMM(spk.position.x);
            const y = toMM(spk.position.y);
            const radius = 100;
            const role = String(spk?.role || '').toUpperCase();
            if (!role || role === 'LFE' || role.startsWith('LFE')) return;
            
            dxf.push(`0\nCIRCLE\n8\nSPEAKERS\n10\n${x}\n20\n${y}\n40\n${radius}`);
            
            // Label
            const textY = y + 150;
            dxf.push(`0\nTEXT\n8\nLABELS\n10\n${x}\n20\n${textY}\n40\n100\n1\n${role}\n72\n1\n73\n2`);
        });
        
        // Subwoofers
        const addSubsDXF = (subsCfg, prefix) => {
            if (!subsCfg?.positions || !Array.isArray(subsCfg.positions)) return;
            subsCfg.positions.forEach((sub, idx) => {
                if (!Number.isFinite(sub?.x) || !Number.isFinite(sub?.y)) return;
                const x = toMM(sub.x);
                const y = toMM(sub.y);
                const radius = 120;
                dxf.push(`0\nCIRCLE\n8\nSPEAKERS\n10\n${x}\n20\n${y}\n40\n${radius}`);
                
                const label = `SUB${prefix}${idx + 1}`;
                const textY = y + 160;
                dxf.push(`0\nTEXT\n8\nLABELS\n10\n${x}\n20\n${textY}\n40\n100\n1\n${label}\n72\n1\n73\n2`);
            });
        };
        
        if (frontSubsCfg) addSubsDXF(frontSubsCfg, 'F');
        if (rearSubsCfg) addSubsDXF(rearSubsCfg, 'R');
    }
    
    // End entities and file
    dxf.push('0\nENDSEC\n0\nEOF');
    
    return dxf.join('\n');
}

/**
 * Trigger browser download of a text file
 * @param {string} content - File content
 * @param {string} filename - Download filename
 * @param {string} mimeType - MIME type
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