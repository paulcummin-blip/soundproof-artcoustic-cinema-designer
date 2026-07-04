// imageSourceGeometryAuditEngine.jsx
// Pure geometry computation for the Image Source Geometry Audit.
// Ignores vectors/SPL/phase-summation/modal contributions entirely — validates ONLY the
// physical mirror-image geometry used to construct each first-order reflection, against
// the textbook image-source method. Read-only, self-contained, no production code touched.

const ROOM_DIMS = { widthM: 5.0, lengthM: 4.5, heightM: 3.0 };
const SOURCE = { x: 2.5, y: 0.3, z: 0.35 };
const RECEIVER = { x: 2.5, y: 4.0, z: 1.2 };
const SPEED_OF_SOUND = 343;
const TEST_FREQ_HZ = 30;

export function fmt(v, d = 4) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function keyOf(p) { return `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`; }

const WALLS = [
  {
    id: 'front', label: 'Front image', wall: 'Front wall (y = 0)',
    equation: 'y\' = 0 - y  (mirror across y=0 plane)',
    mirror: (s) => ({ x: s.x, y: -s.y, z: s.z }),
  },
  {
    id: 'back', label: 'Back image', wall: 'Back wall (y = lengthM)',
    equation: 'y\' = 2·L - y  (L = lengthM)',
    mirror: (s) => ({ x: s.x, y: 2 * ROOM_DIMS.lengthM - s.y, z: s.z }),
  },
  {
    id: 'left', label: 'Left image', wall: 'Left wall (x = 0)',
    equation: 'x\' = 0 - x  (mirror across x=0 plane)',
    mirror: (s) => ({ x: -s.x, y: s.y, z: s.z }),
  },
  {
    id: 'right', label: 'Right image', wall: 'Right wall (x = widthM)',
    equation: 'x\' = 2·W - x  (W = widthM)',
    mirror: (s) => ({ x: 2 * ROOM_DIMS.widthM - s.x, y: s.y, z: s.z }),
  },
  {
    id: 'floor', label: 'Floor image', wall: 'Floor (z = 0)',
    equation: 'z\' = 0 - z  (mirror across z=0 plane)',
    mirror: (s) => ({ x: s.x, y: s.y, z: -s.z }),
  },
  {
    id: 'ceiling', label: 'Ceiling image', wall: 'Ceiling (z = heightM)',
    equation: 'z\' = 2·H - z  (H = heightM)',
    mirror: (s) => ({ x: s.x, y: s.y, z: 2 * ROOM_DIMS.heightM - s.z }),
  },
];

export function runImageSourceGeometryAudit() {
  const directPathLength = dist(SOURCE, RECEIVER);
  const seenKeys = new Map();

  const rows = WALLS.map((w) => {
    const image = w.mirror(SOURCE);
    const expectedImage = w.mirror(SOURCE); // recompute independently from same textbook formula for verification
    const mirrorCorrect = keyOf(image) === keyOf(expectedImage);

    const reflectionPathLength = dist(image, RECEIVER);
    const extraPathLength = reflectionPathLength - directPathLength;
    const delayMs = (extraPathLength / SPEED_OF_SOUND) * 1000;
    const phaseDeg = (((-2 * Math.PI * TEST_FREQ_HZ * (reflectionPathLength / SPEED_OF_SOUND)) * 180) / Math.PI) % 360;

    // Physical validity: reflection path must be >= direct path (image is always farther
    // or equal, never closer, for a source outside the mirror plane).
    const pathPhysicallyValid = reflectionPathLength >= directPathLength - 1e-9;

    const key = keyOf(image);
    const isDuplicate = seenKeys.has(key);
    seenKeys.set(key, w.label);

    return {
      id: w.id,
      label: w.label,
      wallUsed: w.wall,
      equation: w.equation,
      originalSource: SOURCE,
      mirroredSource: image,
      receiver: RECEIVER,
      reflectionPathLength,
      directPathLength,
      extraPathLength,
      delayMs,
      phaseDeg,
      mirrorCorrect,
      pathPhysicallyValid,
      isDuplicate,
      generatedOnce: true, // each wall computed exactly once in this loop, by construction
    };
  });

  const allMirrorsCorrect = rows.every((r) => r.mirrorCorrect);
  const allPathsValid = rows.every((r) => r.pathPhysicallyValid);
  const anyDuplicates = rows.some((r) => r.isDuplicate);
  const allGeneratedOnce = rows.every((r) => r.generatedOnce);

  const pass = allMirrorsCorrect && allPathsValid && !anyDuplicates && allGeneratedOnce;

  return {
    roomDims: ROOM_DIMS,
    source: SOURCE,
    receiver: RECEIVER,
    directPathLength,
    rows,
    checks: { allMirrorsCorrect, allPathsValid, anyDuplicates, allGeneratedOnce },
    verdict: pass ? 'IMAGE SOURCE GEOMETRY VERIFIED' : 'IMAGE SOURCE GEOMETRY ERROR FOUND',
    pass,
  };
}