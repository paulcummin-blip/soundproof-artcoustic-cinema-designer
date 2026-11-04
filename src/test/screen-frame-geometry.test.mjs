/**
 * screen-frame-geometry.test.mjs
 * ------------------------------
 * ACCEPTANCE — the side elevation and the room-fit warning state ONE screen.
 *
 * The canonical contract (corrected):
 *
 *   visibleWidthInches  = VIEWABLE IMAGE WIDTH
 *   borderThicknessM    = FRAME THICKNESS PER SIDE
 *   heightFromFloorM    = BOTTOM OF THE VIEWABLE IMAGE ABOVE THE FINISHED FLOOR
 *
 * So the complete frame begins one border BELOW the stored height from floor and
 * ends one border above the viewable top. The border is per side, so overall
 * dimensions add it twice.
 *
 * What is asserted here, with the real authority:
 *
 *   A  the stated case resolves the numbers the warning reports — viewable
 *      height 171.45 cm, overall height 187.45 cm, frame bottom 57 cm, frame
 *      top 244.45 cm
 *   B  the border is PER SIDE (added twice), and the complete frame begins one
 *      border BELOW the stored height from floor
 *   C  the frame passes a 240 cm ceiling by 4.45 cm, and that overflow is stated
 *      rather than removed by a clamp
 *   D  the drawing's own Z mapping puts the frame top ABOVE the ceiling line at
 *      exactly that overflow, on the room's own scale — no second scale, no clamp
 *   E  both surfaces consume this one authority, and the side elevation contains
 *      no clamp of the frame to the room bounds
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

import {
  DEFAULT_SCREEN_BORDER_M,
  resolveScreenFrameGeometry,
  screenFrameRoomFit,
} from '@/components/models/screen/screenFrameGeometry';

/** Metres → centimetres at the 2 decimals the designer reads. */
const CM = (m) => Math.round(m * 10000) / 100;

/** Assert a metre value equals an expected centimetre figure. */
const expectCm = (actualM, expectedCm) =>
  expect(Math.abs(CM(actualM) - expectedCm) <= 0.01).toBeTruthy();

/** The stated case: 120" 16:9, 8 cm per-side border, 65 cm from floor, 240 cm room.
 *  Under the corrected contract the viewable bottom is 65 cm, so the complete
 *  frame crosses a 240 cm ceiling while the viewable image itself stays inside. */
const statedCase = {
  screen: {
    visibleWidthInches: 120,
    aspectRatio: '16:9',
    borderThicknessM: 0.08,
    heightFromFloorM: 0.65,
  },
  roomHeightM: 2.4,
};

const read = (path) => fs.readFileSync(path, 'utf8');

describe('canonical screen frame geometry', () => {
  it('A — resolves viewable height, overall height and frame bounds for the stated case', () => {
    const g = resolveScreenFrameGeometry(statedCase.screen);

    // 120" = 304.8 cm viewable width; 16:9 viewable height = 171.45 cm
    expectCm(g.viewableWidthM, 304.8);
    expectCm(g.viewableHeightM, 171.45);

    // Overall with border = viewable + 8 cm on each side
    expectCm(g.overallWidthM, 320.8);
    expectCm(g.overallHeightM, 187.45);

    // The stored height from floor is the VIEWABLE bottom (65 cm); the complete
    // frame begins one border below it (57 cm) and ends one border above the
    // viewable top (244.45 cm).
    expectCm(g.viewableBottomM, 65);
    expectCm(g.viewableTopM, 236.45);
    expectCm(g.frameBottomM, 57);
    expectCm(g.frameTopM, 244.45);
  });

  it('B — the border is per side, and the complete frame begins one border below the viewable bottom', () => {
    const g = resolveScreenFrameGeometry(statedCase.screen);

    expectCm(g.borderM, 8);
    // Border added TWICE to the viewable image.
    expectCm(g.overallHeightM, CM(g.viewableHeightM) + 8 * 2);
    // The viewable bottom IS the stored height from floor.
    expectCm(g.viewableBottomM, 65);
    expectCm(g.viewableTopM, 65 + CM(g.viewableHeightM));
    // The complete frame begins one border BELOW the viewable bottom.
    expectCm(g.frameBottomM, CM(g.viewableBottomM) - 8);
    // The frame top is the viewable top plus the upper border.
    expectCm(g.frameTopM, CM(g.viewableTopM) + 8);
    // No border stated → the canonical default, still per side.
    expect(resolveScreenFrameGeometry({ ...statedCase.screen, borderThicknessM: 0 }).borderM)
      .toBe(DEFAULT_SCREEN_BORDER_M);
  });

  it('C — the frame passes the ceiling by 4.45 cm, stated and never clamped', () => {
    const g = resolveScreenFrameGeometry(statedCase.screen);
    const fit = screenFrameRoomFit(g, statedCase.roomHeightM);

    expectCm(fit.ceilingOverflowM, 4.45);
    expect(fit.fits).toBe(false);
    // The geometry itself is untouched by the room: nothing was moved or shrunk.
    expectCm(g.frameTopM, 244.45);
    expectCm(g.overallHeightM, 187.45);
    expectCm(g.frameBottomM, 57);
    // A screen that fits reports no overflow at all.
    expect(screenFrameRoomFit(g, 2.6).fits).toBe(true);
  });

  it('D — the drawing maps the frame top above the ceiling line on the room scale', () => {
    const g = resolveScreenFrameGeometry(statedCase.screen);
    const fit = screenFrameRoomFit(g, statedCase.roomHeightM);

    // The side elevation's own room mapping: Z (0 = floor) → SVG px.
    const drawH = 300;
    const roomH = statedCase.roomHeightM;
    const rz = (zM) => drawH - (zM / roomH) * drawH;

    // Above the ceiling line means a SMALLER y than the ceiling.
    expect(rz(g.frameTopM)).toBeLessThan(rz(roomH));
    // By exactly the overflow, at the room's own scale — no second vertical scale.
    const pxPerM = drawH / roomH;
    expect(Math.abs((rz(roomH) - rz(g.frameTopM)) - pxPerM * fit.ceilingOverflowM) < 1e-9).toBeTruthy();
    // The viewable image itself stays inside the room: only the frame crosses.
    expect(rz(g.viewableTopM)).toBeGreaterThan(rz(roomH));
  });

  it('E — one authority, consumed by both surfaces, with no clamp in the drawing', () => {
    const sideElevation = read('src/components/room/SideElevation.jsx');
    const screenConfiguration = read('src/components/room/ScreenConfiguration.jsx');
    const authority = 'components/models/screen/screenFrameGeometry';

    // Both the drawing and the warning read the same resolver.
    expect(sideElevation).toContain(authority);
    expect(screenConfiguration).toContain(authority);

    // The drawing takes the frame bounds from the authority…
    expect(sideElevation).toMatch(/screenGeometry\.frameTopM/);
    expect(sideElevation).toMatch(/screenGeometry\.frameBottomM/);
    // …and never clamps the frame to the room bounds.
    expect(sideElevation).not.toMatch(/frameBottomM\s*=\s*Math\.max/);
    expect(sideElevation).not.toMatch(/frameTopM\s*=\s*Math\.min/);

    // The warning still reports the frame top against the room height.
    expect(screenConfiguration).toMatch(/screenFrame\.frameTopM/);
    expect(screenConfiguration).toMatch(/exceeds room height/);
  });
});