// Q 6-3 elevation artwork — restored to the loudspeaker itself.
//
// The Q 6-3 source PNG is a page screenshot: a dark frame round the image edge,
// a wide white page margin, and the cabinet's drawing inset inside it. Drawn
// whole it read as a small drawing inside an image tile, with the page's frame
// and padding around it.
//
// These checks pin the restore: the artwork is cropped to the cabinet's own
// outline, the crop is square like the 280 × 280 mm cabinet face, the elevation
// draws it at the cabinet's true footprint, and nothing else about the model,
// the geometry or the other speaker models has moved.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const ICONS = read('src/components/report/SpeakerFaceIcons.jsx');
const FRONT = read('src/components/room/FrontElevation.jsx');
const SIDE = read('src/components/room/SideElevation.jsx');
const REGISTRY = read('src/components/models/speakers/registry.jsx');
const REPORT_GRAPHIC = read('src/components/report/ScreenWallConstructionGraphic.jsx');

const q63Block = () => {
  const start = ICONS.indexOf('const Q63_ARTWORK');
  const end = ICONS.indexOf('// ─── Evolve Series face icons', start);
  assert.ok(start > -1 && end > start, 'the Q6-3 icon component is present');
  return ICONS.slice(start, end);
};

test('A. the Q6-3 asset is traced to its source and cropped to the cabinet outline', () => {
  const block = q63Block();
  assert.match(block, /9a1ad66a6_Q6-3front\.png/, 'the Q6-3 source artwork is named');
  assert.match(block, /cropX: 54, cropY: 52, cropW: 916, cropH: 916/, 'the measured cabinet crop is recorded');
  assert.match(block, /viewBox=\{`\$\{a\.cropX\} \$\{a\.cropY\} \$\{a\.cropW\} \$\{a\.cropH\}`\}/, 'the crop drives the rendered viewBox');
  assert.match(block, /width: 1024, height: 1021/, 'the crop is expressed in the asset\'s own pixel space');
});

test('B. the crop excludes the page frame and its white margin', () => {
  const block = q63Block();
  const crop = block.match(/cropX: (\d+), cropY: (\d+), cropW: (\d+), cropH: (\d+)/);
  const size = block.match(/width: (\d+), height: (\d+)/);
  assert.ok(crop && size, 'the crop and the asset size are both declared');
  const [, cropX, cropY, cropW, cropH] = crop.map(Number);
  const [, assetW, assetH] = size.map(Number);

  // The page's own dark frame runs round the image edge. The crop starts well
  // inside it, so the frame can never be drawn, and it ends before the far
  // margin, so neither edge is included.
  assert.ok(cropX / assetW > 0.02, 'the crop starts inside the page frame horizontally');
  assert.ok(cropY / assetH > 0.02, 'the crop starts inside the page frame vertically');
  assert.ok((cropX + cropW) / assetW < 0.98, 'the crop ends inside the page frame horizontally');
  assert.ok((cropY + cropH) / assetH < 0.98, 'the crop ends inside the page frame vertically');
  // The page margin is roughly 5% a side; the crop must drop it, not keep it.
  assert.ok(cropW / assetW < 0.95 && cropH / assetH < 0.95, 'the white page margin is cropped away');
});

test('C. the crop is square, matching the cabinet face, so nothing is distorted', () => {
  const block = q63Block();
  const [, , , cropW, cropH] = block.match(/cropX: (\d+), cropY: (\d+), cropW: (\d+), cropH: (\d+)/).map(Number);
  const cropAspect = cropW / cropH;

  const q63 = REGISTRY.match(/\{ key: "q6-3".*?\}/)[0];
  const widthMm = Number(q63.match(/widthMm: (\d+)/)[1]);
  const heightMm = Number(q63.match(/heightMm: (\d+)/)[1]);
  const faceAspect = widthMm / heightMm;

  assert.ok(Math.abs(cropAspect - 1) < 0.01, `the crop is square (got ${cropAspect.toFixed(3)})`);
  assert.ok(Math.abs(faceAspect - 1) < 0.01, `the cabinet face is square (got ${faceAspect.toFixed(3)})`);
  assert.ok(Math.abs(cropAspect - faceAspect) < 0.02, 'the crop aspect matches the cabinet face aspect');
});

test('D. the elevation draws it at the cabinet footprint, with no inset square', () => {
  assert.match(FRONT, /const FACE_ICON_VISIBLE_RATIO = \(isC41 \|\| isC1 \|\| isQ63\) \? 1\.0 : 0\.72;/,
    'Q6-3 draws at its own footprint: the crop needs no padding compensation');
  assert.match(FRONT, /if \(isQ63\) return <Q63FaceIcon x=\{adjustedX\} y=\{adjustedY\} width=\{adjustedW\} height=\{adjustedH\} \/>;/,
    'the icon is given the cabinet box in both dimensions');
  assert.equal(/isQ63\) return <Q63FaceIcon[^\n]*size=\{Math\.min\(/.test(FRONT), false,
    'no min-square sizing remains, which was what inset the drawing inside its box');
  // The footprint the icon is given is still the cabinet's own width and height.
  assert.match(FRONT, /const iconBoxW = vertical \? sh : sw;/, 'the icon box is still the cabinet footprint');
});

test('E. the Q6-3 model and the elevation geometry are unchanged', () => {
  const q63 = REGISTRY.match(/\{ key: "q6-3".*?\}/)[0];
  assert.match(q63, /widthMm: 280/, 'cabinet width unchanged');
  assert.match(q63, /heightMm: 280/, 'cabinet height unchanged');
  assert.match(q63, /depthMm: 110/, 'cabinet depth unchanged');
  assert.match(q63, /label: "Q6-3"/, 'model identity unchanged');
});

test('F. the other speaker models are untouched', () => {
  assert.match(ICONS, /export function Q43FaceIcon[\s\S]*?viewBox="0 0 100 75"/, 'Q4-3 artwork unchanged');
  assert.match(ICONS, /export function Q45FaceIcon[\s\S]*?689388d97|export function Q45FaceIcon[\s\S]*?d1376c28d_Q4-5front\.png/, 'Q4-5 artwork unchanged');
  assert.match(ICONS, /export function Q85FaceIcon[\s\S]*?8eb64d06e_Q8-5Front\.png[\s\S]*?viewBox="0 0 100 100"/, 'Q8-5 artwork unchanged');
  assert.match(ICONS, /export function Evolve11FaceIcon[\s\S]*?viewBox="0 0 150 150"/, 'the vector icons are unchanged');
});

test('G. the side elevation keeps its own geometry, clipped to the cabinet', () => {
  assert.match(SIDE, /const FACE_ICON_VISIBLE_RATIO = 0\.72;/, 'the side view\'s own scale is untouched');
  assert.match(SIDE, /<clipPath id=\{clipId\}>\s*<rect x=\{cabinetX\} y=\{cabinetY\} width=\{svgW\} height=\{svgH\} \/>/, 'the artwork stays clipped to the cabinet profile');
  assert.match(SIDE, /'q6-3': Q63FaceIcon,/, 'the side view still resolves the Q6-3 icon');
});

test('H. the exported drawing matches the editor', () => {
  // The report/PDF graphic draws Q6-3 through the same component, at the true
  // 0.28 m cabinet box, so the exported elevation carries the same artwork.
  assert.match(REPORT_GRAPHIC, /const isQ63 = modelKey\.includes\('q6 3'\);/, 'the report resolves Q6-3');
  assert.match(REPORT_GRAPHIC, /const w = \(isQ63 \? 0\.28/, 'the report uses the real cabinet width');
  assert.match(REPORT_GRAPHIC, /const h = \(isQ63 \? 0\.28/, 'the report uses the real cabinet height');
  assert.match(REPORT_GRAPHIC, /isQ63 \? <ProductArtwork backing=\{\{ x, y, width: w, height: h \}\}><Q63FaceIcon x=\{x\} y=\{y\} width=\{w\} height=\{h\} \/>/,
    'the report draws the same cropped Q6-3 artwork at the cabinet box');
});