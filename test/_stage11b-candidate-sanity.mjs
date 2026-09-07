
import { subHalfExtents, deriveSubWallOrientation, CLEARANCE_M } from '@/components/room/rv/utils/subWallOrientation.js';
import { MODELS } from '@/components/models/speakers/registry';

const ROOM = { widthM: 4.0, lengthM: 6.3, heightM: 2.4 };
const SUB3_12 = MODELS.find(m => m.key === 'sub3-12');
const SUB_WIDTH_M = (SUB3_12?.widthMm || 600) / 1000;
const SUB_DEPTH_M = (SUB3_12?.depthMm || 255) / 1000;
const STEP_M = 0.1;
const MAX_STEPS = 3;

const CUR_FRONT = { x: 1.0, y: 0.16 };
const CUR_REAR  = { x: 1.0, y: 6.14 };

function isValidPosition(x, y) {
  const { rotationDeg } = deriveSubWallOrientation({
    x, y, widthM: ROOM.widthM, lengthM: ROOM.lengthM,
    subWidthM: SUB_WIDTH_M, subDepthM: SUB_DEPTH_M,
  });
  const { halfX, halfY } = subHalfExtents(SUB_WIDTH_M, SUB_DEPTH_M, rotationDeg);
  return x >= halfX + CLEARANCE_M && x <= ROOM.widthM - halfX - CLEARANCE_M
      && y >= halfY + CLEARANCE_M && y <= ROOM.lengthM - halfY - CLEARANCE_M;
}

const steps = [];
for (let i = 1; i <= MAX_STEPS; i++) steps.push(i * STEP_M);

let total = 0, valid = 0, rejected = 0;
const candidates = [];
const rejectedList = [];

// A1: Front pair lateral
for (const d of steps) {
  total += 2;
  const fx = CUR_FRONT.x + d;
  if (isValidPosition(fx, CUR_FRONT.y)) { valid++; candidates.push({ label: `Front inward ${d.toFixed(1)}m`, type: 'front-lat', fx, fy: CUR_FRONT.y, rx: CUR_REAR.x, ry: CUR_REAR.y }); }
  else rejected++, rejectedList.push({ label: `Front inward ${d.toFixed(1)}m`, x: fx, y: CUR_FRONT.y });
  const fxo = CUR_FRONT.x - d;
  if (isValidPosition(fxo, CUR_FRONT.y)) { valid++; candidates.push({ label: `Front outward ${d.toFixed(1)}m`, type: 'front-lat', fx: fxo, fy: CUR_FRONT.y, rx: CUR_REAR.x, ry: CUR_REAR.y }); }
  else rejected++, rejectedList.push({ label: `Front outward ${d.toFixed(1)}m`, x: fxo, y: CUR_FRONT.y });
}

// A2: Rear pair lateral
for (const d of steps) {
  total += 2;
  const rx = CUR_REAR.x + d;
  if (isValidPosition(rx, CUR_REAR.y)) { valid++; candidates.push({ label: `Rear inward ${d.toFixed(1)}m`, type: 'rear-lat', fx: CUR_FRONT.x, fy: CUR_FRONT.y, rx, ry: CUR_REAR.y }); }
  else rejected++, rejectedList.push({ label: `Rear inward ${d.toFixed(1)}m`, x: rx, y: CUR_REAR.y });
  const rxo = CUR_REAR.x - d;
  if (isValidPosition(rxo, CUR_REAR.y)) { valid++; candidates.push({ label: `Rear outward ${d.toFixed(1)}m`, type: 'rear-lat', fx: CUR_FRONT.x, fy: CUR_FRONT.y, rx: rxo, ry: CUR_REAR.y }); }
  else rejected++, rejectedList.push({ label: `Rear outward ${d.toFixed(1)}m`, x: rxo, y: CUR_REAR.y });
}

// A3: Front pair depth
for (const d of steps) {
  total += 2;
  const fyf = CUR_FRONT.y + d;
  if (isValidPosition(CUR_FRONT.x, fyf)) { valid++; candidates.push({ label: `Front forward ${d.toFixed(1)}m`, type: 'front-depth', fx: CUR_FRONT.x, fy: fyf, rx: CUR_REAR.x, ry: CUR_REAR.y }); }
  else rejected++, rejectedList.push({ label: `Front forward ${d.toFixed(1)}m`, x: CUR_FRONT.x, y: fyf });
  const fyb = CUR_FRONT.y - d;
  if (isValidPosition(CUR_FRONT.x, fyb)) { valid++; candidates.push({ label: `Front backward ${d.toFixed(1)}m`, type: 'front-depth', fx: CUR_FRONT.x, fy: fyb, rx: CUR_REAR.x, ry: CUR_REAR.y }); }
  else rejected++, rejectedList.push({ label: `Front backward ${d.toFixed(1)}m`, x: CUR_FRONT.x, y: fyb });
}

// A4: Rear pair depth
for (const d of steps) {
  total += 2;
  const ryf = CUR_REAR.y - d;
  if (isValidPosition(CUR_REAR.x, ryf)) { valid++; candidates.push({ label: `Rear forward ${d.toFixed(1)}m`, type: 'rear-depth', fx: CUR_FRONT.x, fy: CUR_FRONT.y, rx: CUR_REAR.x, ry: ryf }); }
  else rejected++, rejectedList.push({ label: `Rear forward ${d.toFixed(1)}m`, x: CUR_REAR.x, y: ryf });
  const ryb = CUR_REAR.y + d;
  if (isValidPosition(CUR_REAR.x, ryb)) { valid++; candidates.push({ label: `Rear backward ${d.toFixed(1)}m`, type: 'rear-depth', fx: CUR_FRONT.x, fy: CUR_FRONT.y, rx: CUR_REAR.x, ry: ryb }); }
  else rejected++, rejectedList.push({ label: `Rear backward ${d.toFixed(1)}m`, x: CUR_REAR.x, y: ryb });
}

// A5: Coordinated depth
for (const d of steps) {
  total += 2;
  const fy = CUR_FRONT.y + d, ry = CUR_REAR.y - d;
  if (isValidPosition(CUR_FRONT.x, fy) && isValidPosition(CUR_REAR.x, ry)) { valid++; candidates.push({ label: `Both toward center ${d.toFixed(1)}m`, type: 'coord-depth', fx: CUR_FRONT.x, fy, rx: CUR_REAR.x, ry }); }
  else rejected++, rejectedList.push({ label: `Both toward center ${d.toFixed(1)}m` });
  const fyb = CUR_FRONT.y - d, ryb = CUR_REAR.y + d;
  if (isValidPosition(CUR_FRONT.x, fyb) && isValidPosition(CUR_REAR.x, ryb)) { valid++; candidates.push({ label: `Both away from center ${d.toFixed(1)}m`, type: 'coord-depth', fx: CUR_FRONT.x, fy: fyb, rx: CUR_REAR.x, ry: ryb }); }
  else rejected++, rejectedList.push({ label: `Both away from center ${d.toFixed(1)}m` });
}

// Check duplicates
const seen = new Set();
let duplicates = 0;
for (const c of candidates) {
  const sig = `${c.fx},${c.fy},${c.rx},${c.ry}`;
  if (seen.has(sig)) duplicates++;
  else seen.add(sig);
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('STAGE 11B — CANDIDATE GENERATION SANITY CHECK');
console.log('═══════════════════════════════════════════════════════════════');
console.log();
console.log('Room: ' + ROOM.widthM + ' × ' + ROOM.lengthM + ' × ' + ROOM.heightM + ' m');
console.log('Sub: SUB3-12 (width=' + SUB_WIDTH_M + 'm, depth=' + SUB_DEPTH_M + 'm)');
console.log('Current: front=(' + CUR_FRONT.x + ',' + CUR_FRONT.y + '), rear=(' + CUR_REAR.x + ',' + CUR_REAR.y + ')');
console.log();
console.log('TOTAL generated:     ' + total);
console.log('VALID after geometry: ' + valid);
console.log('REJECTED geometry:    ' + rejected);
console.log('DUPLICATES removed:   ' + duplicates);
console.log('UNIQUE valid:         ' + (valid - duplicates));
console.log();

console.log('REJECTED CANDIDATES:');
for (const r of rejectedList) {
  console.log('  ' + r.label + (r.x !== undefined ? ' (x=' + r.x + ', y=' + r.y + ')' : ''));
}
console.log();

console.log('REPRESENTATIVE VALID CANDIDATES:');
const byType = {};
for (const c of candidates) {
  if (!byType[c.type]) byType[c.type] = [];
  byType[c.type].push(c);
}
for (const [type, list] of Object.entries(byType)) {
  console.log('  [' + type + ']');
  for (const c of list) {
    console.log('    ' + c.label + ': front=(' + c.fx + ',' + c.fy + '), rear=(' + c.rx + ',' + c.ry + ')');
  }
}
console.log();
console.log('═══════════════════════════════════════════════════════════════');
console.log('CANDIDATE SPACE MAKES PHYSICAL SENSE: ' + (valid > 15 ? 'YES' : 'NO — too few valid'));
console.log('═══════════════════════════════════════════════════════════════');
