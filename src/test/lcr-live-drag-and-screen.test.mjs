// ---------------------------------------------------------------------------
// TEST   LCR live dragging, the shared movement cue, and the screen surface
// WHAT   Dragging FL, FC or FR in Front Elevation publishes the height it is
//        being dragged to, continuously, so the LCR acoustic-centre control
//        shows the moving height to two decimals — bold Artcoustic dark green
//        behind the field's own thin green border — while the moving speakers
//        are identified by their green label in the drawing. The live number is
//        withdrawn on release, after the single commit that saves the position;
//        the light then holds for five seconds and returns on its own. The
//        projection screen is a barely-there translucent wash, so the LCR
//        loudspeakers behind it are clearly visible.
// WHY    The LCR interaction is the surround interaction: one shared authority,
//        no second system, nothing written per mouse movement, and the drawing
//        and panel can never disagree.
//
// The shared movement store is exercised directly; the wiring between the
// gesture, the control and the drawing is pinned as a source contract, because
// the connection itself is what is under test.
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  publishLiveSpeakerPosition,
  clearLiveSpeakerPosition,
  getLiveSpeakerPosition,
  beginSpeakerHighlight,
  settleSpeakerHighlight,
  releaseSpeakerHighlight,
  getSpeakerHighlight,
  HIGHLIGHT_GREEN,
  HIGHLIGHT_HOLD_MS,
} from '@/components/state/speakerSelectionStore';

const read = (file) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

const front = read('src/components/room/FrontElevation.jsx');
const panel = read('src/components/room/LCRPanel.jsx');
const field = read('src/components/room/LcrAcousticCentreField.jsx');
const stepper = read('src/components/ui/StepperInput.jsx');
const screenLayer = read('src/components/room/front/FrontScreenLayer.jsx');
const speakerArt = read('src/components/room/front/FrontSpeakerArt.jsx');
const dragHandlers = read('src/components/roomdesigner/hooks/useElevationDragHandlers.jsx');

// ── 1. The drag publishes the height, live ────────────────────────────────

test('TEST 1  A front-stage drag publishes the height it is moving to, live', () => {
  clearLiveSpeakerPosition();
  assert.equal(getLiveSpeakerPosition().role, null, 'nothing is live before a drag');

  // The gesture publishes on every movement — not on release.
  publishLiveSpeakerPosition({ role: 'fl', z: 1.21 });
  assert.equal(getLiveSpeakerPosition().role, 'FL', 'the role is canonical');
  publishLiveSpeakerPosition({ role: 'FL', z: 1.22 });
  const moved = getLiveSpeakerPosition().token;
  assert.equal(getLiveSpeakerPosition().z, 1.22, '1.21 → 1.22 while the mouse is still down');
  publishLiveSpeakerPosition({ role: 'FL', z: 1.23 });
  assert.ok(getLiveSpeakerPosition().token > moved, 'every movement is a new height');

  clearLiveSpeakerPosition();
  assert.equal(getLiveSpeakerPosition().role, null, 'and it is withdrawn when the drag ends');

  // The drawing publishes it, on the gesture itself.
  assert.ok(front.includes('publishLiveSpeakerPosition({ role: drag.role, z: snappedZ })'),
    'the drag publishes the live height');
  assert.ok(front.includes('beginSpeakerHighlight([role])'), 'and lights the speaker as the gesture starts');
  assert.ok(front.includes('beginSpeakerHighlight(Object.keys(liveMap))'),
    'every speaker that is actually moving is identified — the shared height relationship included');
});

// ── 2. The drawn movement and the saved position ──────────────────────────

test('TEST 2  One write per drag, on release, and the live number is withdrawn after it', () => {
  const releaseIndex = front.indexOf('const onMouseUp = () => {');
  const moveIndex = front.indexOf('const onMouseMove = (e) => {');
  const commitIndex = front.indexOf('onMovedRef.current?.({ role: drag.role, newX: live.x, newZ: live.z, axis: drag.axisLocked });');
  assert.ok(commitIndex > releaseIndex, 'the commit sits in the release handler, never in the move handler');
  assert.ok(moveIndex < releaseIndex, 'the move handler previews only');
  assert.equal((front.match(/onMovedRef\.current\?\.\(\{ role: drag\.role/g) || []).length, 1, 'one authoritative commit per drag');

  const liveClearIndex = front.indexOf('clearLiveSpeakerPosition();', commitIndex);
  assert.ok(liveClearIndex > commitIndex, 'the live number is withdrawn after the commit, never before');
  assert.ok(front.includes('settleSpeakerHighlight();'), 'and the light is settled on release');
  assert.ok(!front.includes('base44'), 'no database write is reached from a drag');
});

// ── 3. The existing LCR geometry authority is untouched ───────────────────

test('TEST 3  The existing LCR height relationship and positioning rules are preserved', () => {
  assert.ok(dragHandlers.includes("if (axis === 'z' && isLcrRole)"), 'the LCR height sync branch is unchanged');
  assert.ok(dragHandlers.includes('if (allSameModel)'), 'the shared-height relationship is unchanged');
  assert.ok(dragHandlers.includes('resolveLcrHeightAuthority({ role, newZ, frontStageMode })'),
    'the LCR height authority still decides what a drag writes');
  assert.ok(!front.includes('resolveLcrHeightAuthority'), 'the drawing decides nothing about the authority itself');
  assert.ok(!speakerArt.includes('position'), 'the renderer moves nothing: it only draws');
});

// ── 4. The control end ────────────────────────────────────────────────────

test('TEST 4  The control shows the live height, at two decimals, for its own speakers', () => {
  assert.ok(field.includes('useLiveSpeakerPositionForRoles(roles)'),
    'the field reads the live position of the speakers it governs');
  assert.ok(field.includes('value={liveZ ?? (Number(valueM) || 0)}'),
    'the live height is shown while the speaker moves, the stored value otherwise');
  assert.ok(stepper.includes('value.toFixed(decimals)'), 'shown to two decimals');

  // The roles each field governs mirror what the drag actually moves.
  assert.ok(panel.includes('roles={lcrCentreFieldRoles}'), 'the centre field is the shared LCR authority');
  assert.ok(panel.includes('roles={lcrLrFieldRoles}'), 'and FL/FR have their own in center_only mode');
  assert.ok(panel.includes("(frontStageMode === 'center_only' ? ['FC'] : ['FL', 'FC', 'FR'])"),
    'the governed roles are exactly FL, FC and FR (FC alone when the centre is its own authority)');
  assert.ok(panel.includes("useMemo(() => ['FL', 'FR'], [])"), 'and FL/FR for the left/right height');
});

test('TEST 5  The active value is bold, dark green, behind its own thin green border', () => {
  assert.ok(stepper.includes("color: highlighted ? '#213428' : undefined"), 'the value turns Artcoustic dark green');
  assert.ok(stepper.includes('fontWeight: highlighted ? 700 : 400'), 'and bold while it moves');
  assert.ok(stepper.includes("borderColor: highlighted ? '#213428' : undefined"), 'the existing border turns green');
  assert.ok(stepper.includes("disabled && !highlighted ? 'opacity-50'"), 'a moving field is never dimmed');
  assert.ok(stepper.includes('transition-colors duration-500 ease-out'), 'and returns to normal smoothly');
  assert.ok(!stepper.includes('shadow'), 'nothing is boxed or panel-like');

  // The speaker is identified in the drawing, and nothing else is marked.
  assert.ok(front.includes('labelHighlighted: litRoles.has(spk.role)'), 'the moving speaker wears a green label');
  assert.ok(speakerArt.includes('HIGHLIGHT_GREEN'), 'the renderer reads the one shared movement colour');
  assert.ok(speakerArt.includes('const labelFill = labelHighlighted ? HIGHLIGHT_GREEN : labelColor;'));
});

test('TEST 6  Typing the height gives the same feedback, and the light holds for five seconds', () => {
  assert.ok(field.includes('onFocus={() => beginSpeakerHighlight(roles)}'), 'using the field lights its speakers');
  assert.ok(field.includes('onBlur={() => settleSpeakerHighlight()}'), 'leaving it starts the hold');
  assert.ok(stepper.includes('onFocus={onFocus || undefined}'), 'the field forwards focus');
  assert.ok(stepper.includes('commitDraft(); if (onBlur) onBlur(e);'), 'and settles after the value is committed');
  assert.equal(HIGHLIGHT_HOLD_MS, 5000, 'the hold is five seconds');

  // Behaviour: the hold is the store’s own, and the light returns on its own.
  beginSpeakerHighlight(['FL']);
  assert.equal(getSpeakerHighlight().lit, true);
  assert.equal(getSpeakerHighlight().roles.join('|'), 'FL');
  settleSpeakerHighlight({ hold: 0 });
  assert.equal(getSpeakerHighlight().lit, false, 'and it returns to normal when the hold ends');
  releaseSpeakerHighlight();
  clearLiveSpeakerPosition();
});

test('TEST 7  No second system: the LCR interaction is the shared one', () => {
  assert.ok(field.includes('useSpeakerHighlighted(roles)'), 'the field reads the shared highlight');
  assert.ok(!field.includes('useState'), 'and keeps no movement state of its own');
  assert.ok(!panel.includes('speakerSelectionStore'), 'the panel holds no movement state either');

  // The live position is display state: it is never a write, and never a design.
  const liveSection = read('src/components/state/speakerSelectionStore.js').slice(
    read('src/components/state/speakerSelectionStore.js').indexOf('The LIVE POSITION'),
  );
  assert.ok(!/base44|entities\.|localStorage|sessionStorage/.test(liveSection));
  assert.equal(HIGHLIGHT_GREEN, '#213428', 'one green, everywhere');
});

// ── 5. The screen ─────────────────────────────────────────────────────────

test('TEST 8  The screen surface is a barely-there wash; the frame is unchanged', () => {
  const fill = front.match(/AT_SCREEN_SURFACE_FILL = "rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)"/);
  assert.ok(fill, 'the acoustically transparent surface is a translucent rgba wash');
  const alpha = Number(fill[4]);
  assert.ok(alpha >= 0.05 && alpha <= 0.08, `the wash sits in the 5–8 % range (found ${alpha})`);
  assert.ok(Number(fill[1]) >= 190 && Number(fill[2]) >= 190 && Number(fill[3]) >= 190, 'it is an extremely light grey');

  // The screen stays identifiable: the dark frame is drawn as an opaque band,
  // and the surface passes pointer events through to the cabinets behind it.
  assert.ok(front.includes('frameColor={SCREEN_STROKE}'), 'the existing dark frame is retained');
  assert.ok(screenLayer.includes('fill={isTV ? "#fff" : surfaceFill}'), 'a screen uses the wash; a TV stays opaque');
  assert.ok(screenLayer.includes("style={isTV ? undefined : { pointerEvents: 'none' }}"),
    'a speaker behind the screen is still hoverable and draggable');
  assert.ok(screenLayer.includes('fill={frameColor}') && screenLayer.includes('fillRule="evenodd"'),
    'the frame is still drawn last, over the cabinets');

  // Dimensions and position are the stored project's own — only the fill moved.
  assert.ok(screenLayer.includes('const oW = (overallW / roomW) * drawW;'), 'overall width unchanged');
  assert.ok(screenLayer.includes('const oH = (overallH / roomH) * drawH;'), 'overall height unchanged');
  assert.ok(screenLayer.includes('const sw = (screenData.w / roomW) * drawW;'), 'viewable width unchanged');
  assert.ok(screenLayer.includes('const sh = (screenData.h / roomH) * drawH;'), 'viewable height unchanged');
  assert.ok(screenLayer.includes('ry(screenFloorM + screenData.h + borderM)'), 'frame position unchanged');
  assert.ok(screenLayer.includes('ry(screenFloorM + screenData.h);'), 'viewable position unchanged');

  // The cabinets are drawn BEFORE the surface, so they read through it.
  assert.ok(front.indexOf('{/* LCR Speakers — via drawSpeakerFront helper */}') < front.indexOf('<FrontScreenLayer'),
    'the loudspeakers are drawn beneath the screen surface');
});