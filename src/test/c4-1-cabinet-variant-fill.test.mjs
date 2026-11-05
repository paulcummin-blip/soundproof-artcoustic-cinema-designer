// Verifies the C4-1 cabinet variants fill their physical footprint edge-to-edge
// in the Front Elevation: the 1222 mm and 1711 mm variants use slice so the
// cabinet's drawn left/right edges coincide with the physical boundary (no
// white overhang at either end), and the 1441 mm variant keeps meet (its crop
// is wider than physical, so meet already aligns left/right). Drivers stay
// inside; nothing is stretched.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveElevationArtwork } from "@/components/report/elevation/elevationArtAuthority";

// Reproduce the SVG viewBox→viewport mapping the renderer uses.
function fitInto(viewBox, preserveAspect, viewportW, viewportH) {
  const contentW = viewBox.width;
  const contentH = viewBox.height;
  const scaleW = viewportW / contentW;
  const scaleH = viewportH / contentH;
  const scale = preserveAspect === "xMidYMid slice" ? Math.max(scaleW, scaleH) : Math.min(scaleW, scaleH);
  const drawnW = contentW * scale;
  const drawnH = contentH * scale;
  // Centred offset of the drawn content inside the viewport (mm).
  const offsetX = (viewportW - drawnW) / 2;
  const offsetY = (viewportH - drawnH) / 2;
  return { scale, drawnW, drawnH, offsetX, offsetY };
}

const CASES = [
  { key: "c41_1222", phys: { w: 1222, h: 120 } },
  { key: "c41_1441", phys: { w: 1441, h: 120 } },
  { key: "c41_1711", phys: { w: 1711, h: 120 } },
];

test("C4-1 1222 mm — slice fills the physical width; L/R edges align with the 1222 mm boundary, no white at either end", () => {
  const r = resolveElevationArtwork("c41_1222");
  assert.equal(r.preserveAspect, "xMidYMid slice", "1222 must use slice");
  const fit = fitInto(r.box, r.preserveAspect, 1222, 120);
  // The cabinet's drawn left edge (viewBox x=0) lands at offsetX; right edge at offsetX+drawnW.
  assert.ok(Math.abs(fit.offsetX) < 0.01, `L edge must be at 0 mm, got ${fit.offsetX.toFixed(2)} mm`);
  assert.ok(Math.abs(fit.offsetX + fit.drawnW - 1222) < 0.01, `R edge must be at 1222 mm, got ${(fit.offsetX + fit.drawnW).toFixed(2)} mm`);
  // No white band on either side (the whole width is filled).
  const whiteL = fit.offsetX;
  const whiteR = 1222 - (fit.offsetX + fit.drawnW);
  assert.ok(whiteL < 0.01 && whiteR < 0.01, `no white L/R: L=${whiteL.toFixed(2)}mm R=${whiteR.toFixed(2)}mm`);
  // Only a small slice of the top/bottom rule is clipped (~1 mm), drivers untouched.
  assert.ok(fit.drawnH > 120 && fit.drawnH - 120 < 3, `height overflow clipped to <3mm, got ${(fit.drawnH-120).toFixed(2)}mm`);
});

test("C4-1 1711 mm — slice fills the physical width; L/R edges align with the 1711 mm boundary", () => {
  const r = resolveElevationArtwork("c41_1711");
  assert.equal(r.preserveAspect, "xMidYMid slice", "1711 must use slice");
  const fit = fitInto(r.box, r.preserveAspect, 1711, 120);
  assert.ok(Math.abs(fit.offsetX) < 0.01, `L edge at 0, got ${fit.offsetX.toFixed(2)}`);
  assert.ok(Math.abs(fit.offsetX + fit.drawnW - 1711) < 0.01, `R edge at 1711, got ${(fit.offsetX+fit.drawnW).toFixed(2)}`);
  const whiteL = fit.offsetX, whiteR = 1711 - (fit.offsetX + fit.drawnW);
  assert.ok(whiteL < 0.01 && whiteR < 0.01, `no white L/R: L=${whiteL.toFixed(2)} R=${whiteR.toFixed(2)}`);
});

test("C4-1 1441 mm — meet keeps the left/right edges aligned (crop is wider than physical)", () => {
  const r = resolveElevationArtwork("c41_1441");
  assert.equal(r.preserveAspect, "xMidYMid meet", "1441 keeps meet");
  const fit = fitInto(r.box, r.preserveAspect, 1441, 120);
  // meet with crop wider than physical → fills the width: L/R align.
  assert.ok(Math.abs(fit.offsetX) < 0.01, `L edge at 0, got ${fit.offsetX.toFixed(2)}`);
  assert.ok(Math.abs(fit.offsetX + fit.drawnW - 1441) < 0.01, `R edge at 1441, got ${(fit.offsetX+fit.drawnW).toFixed(2)}`);
  // The remaining white is top/bottom only (not "either end" L/R), and small.
  const whiteTB = 120 - fit.drawnH;
  assert.ok(whiteTB > 0 && whiteTB < 4, `1441 top+bottom white ${whiteTB.toFixed(2)}mm is small and on the height axis only`);
});

test("the three C4-1 variants each occupy exactly their physical width at the drawing scale", () => {
  for (const c of CASES) {
    const r = resolveElevationArtwork(c.key);
    const fit = fitInto(r.box, r.preserveAspect, c.phys.w, c.phys.h);
    const drawnWidth = fit.drawnW;
    assert.ok(Math.abs(drawnWidth - c.phys.w) < 0.5, `${c.key}: drawn width ${drawnWidth.toFixed(2)}mm must equal ${c.phys.w}mm`);
  }
});

test("drivers stay inside the cabinet — slice clips only the top/bottom rule, never the mid-height driver cluster", () => {
  for (const c of [{ key: "c41_1222", phys: { w: 1222, h: 120 } }, { key: "c41_1711", phys: { w: 1711, h: 120 } }]) {
    const r = resolveElevationArtwork(c.key);
    const fit = fitInto(r.box, r.preserveAspect, c.phys.w, c.phys.h);
    // The driver cluster sits in the middle ~60% of the cabinet height. slice
    // clips only the outer (drawnH - 120)/2 ≈ 1mm at top and bottom, so the
    // driver band [0.2·H, 0.8·H] is never clipped.
    const clipEach = (fit.drawnH - c.phys.h) / 2;
    assert.ok(clipEach < 2, `${c.key}: clips <2mm each, got ${clipEach.toFixed(2)}mm`);
    assert.ok(clipEach < c.phys.h * 0.2, `${c.key}: driver band never clipped`);
  }
});

test("Evolve 3-1 is unchanged — still meet, edge-to-edge via its matched crop aspect", () => {
  const r = resolveElevationArtwork("evolve_3_1");
  assert.equal(r.preserveAspect, "xMidYMid meet");
  const fit = fitInto(r.box, r.preserveAspect, 270, 370);
  // Evolve 3-1's crop aspect (0.7264) matches the physical 270:370 (0.7297) to
  // <0.5%, so meet fills edge-to-edge within ~1 mm — unchanged by this fix.
  assert.ok(Math.abs(fit.offsetX) < 1.5 && Math.abs(fit.offsetY) < 1.5, `Evolve 3-1 fills edge-to-edge (offset ${fit.offsetX.toFixed(2)},${fit.offsetY.toFixed(2)})`);
});