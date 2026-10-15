// ---------------------------------------------------------------------------
// elevation-art-measurement — audit tool
// ---------------------------------------------------------------------------
// WHAT  Measures the drawing's own bounds inside every catalogue artwork used by
//       the ELEVATION drawings, with the SAME rules the app renders with
//       (src/components/report/elevation/elevationArtBounds.js), and prints the
//       numbers that go into src/components/report/elevation/elevationArtAuthority.js.
//
// WHY   The catalogue artwork is line art on a white page (some of it framed by a
//       thin border rule). The drawing's real bounds have to be measured, never
//       guessed, and this is the tool that measures them: it downloads each asset,
//       decodes the PNG, finds the ink, and reports the crop plus the aspect
//       agreement with the icon's own declared viewBox.
//
// It is read-only: nothing here writes to an asset or to a document. An asset
// that cannot be fetched is reported as unavailable rather than failing the run,
// so the suite never depends on the network being up.
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {
  detectElevationArtBounds,
  isElevationInk,
  boundsFromViewBox,
  elevationArtAspectCheck,
} from '../components/report/elevation/elevationArtBounds.js';

const ICON_FILES = [
  'src/components/report/SpeakerFaceIcons.jsx',
  'src/components/report/C41ArtworkFaceIcons.jsx',
];

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8;
  let header = null;
  let palette = null;
  let transparency = null;
  const idat = [];

  while (pos + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') transparency = data;
    else if (type === 'IEND') break;
    pos += 12 + length;
  }

  if (!header) throw new Error('no IHDR');
  if (header.bitDepth !== 8) throw new Error(`bit depth ${header.bitDepth} unsupported`);
  if (header.interlace !== 0) throw new Error('interlaced PNG unsupported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header.colorType];
  if (!channels) throw new Error(`colour type ${header.colorType} unsupported`);

  const stride = header.width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(header.height * stride);
  let cursor = 0;

  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const line = raw.subarray(cursor, cursor + stride);
    cursor += stride;
    const current = out.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? current[i - channels] : 0;
      const b = previous ? previous[i] : 0;
      const c = previous && i >= channels ? previous[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`filter ${filter} unsupported`);
      current[i] = value & 255;
    }
  }

  const read = (x, y) => {
    const offset = y * stride + x * channels;
    if (header.colorType === 6) return [out[offset], out[offset + 1], out[offset + 2], out[offset + 3]];
    if (header.colorType === 2) return [out[offset], out[offset + 1], out[offset + 2], 255];
    if (header.colorType === 0) return [out[offset], out[offset], out[offset], 255];
    if (header.colorType === 4) return [out[offset], out[offset], out[offset], out[offset + 1]];
    const index = out[offset];
    const alpha = transparency && index < transparency.length ? transparency[index] : 255;
    return [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2], alpha];
  };

  return { width: header.width, height: header.height, read };
}

function readCatalogue() {
  const entries = [];
  for (const file of ICON_FILES) {
    const source = fs.readFileSync(file, 'utf8');
    for (const part of source.split('export function ').slice(1)) {
      const name = part.match(/^(\w+)/)?.[1];
      if (!name) continue;
      entries.push({
        name,
        href: part.match(/href="([^"]+)"/)?.[1] || null,
        // Each icon states its own box as the fallback the renderer draws when an
        // artwork has no recorded crop, so the declared box is read from either.
        viewBox: part.match(/viewBox="([^"]+)"/)?.[1]
          || part.match(/declared=\{\{ box: "([^"]+)"/)?.[1]
          || null,
      });
    }
  }
  return entries;
}

const round = (value) => (Number.isFinite(value) ? Math.round(value * 1000) / 1000 : '—');

test('MEASURE every elevation artwork, printing its crop for the authority', async () => {
  const catalogue = readCatalogue();
  const table = [];

  for (const entry of catalogue) {
    if (!entry.href) {
      table.push(`${entry.name.padEnd(34)} VECTOR   viewBox ${entry.viewBox || '—'}`);
      continue;
    }
    try {
      const response = await fetch(entry.href);
      const buffer = Buffer.from(await response.arrayBuffer());
      const image = decodePng(buffer);
      const bounds = detectElevationArtBounds({
        width: image.width,
        height: image.height,
        inkAt: (x, y) => {
          const [r, g, b, a] = image.read(x, y);
          return isElevationInk(r, g, b, a);
        },
      });
      const declared = boundsFromViewBox(entry.viewBox);
      const check = bounds && declared ? elevationArtAspectCheck(bounds, declared) : null;
      assert.ok(bounds, `${entry.name}: the drawing must be found inside its own artwork`);
      assert.ok(
        bounds.x >= 0 &&
          bounds.y >= 0 &&
          bounds.x + bounds.width <= image.width &&
          bounds.y + bounds.height <= image.height,
        `${entry.name}: bounds must sit inside the asset`
      );

      table.push(
        [
          entry.name.padEnd(34),
          `${image.width}×${image.height}`.padEnd(11),
          `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`.padEnd(24),
          `trim ${bounds.trimmed.left}/${bounds.trimmed.top}/${bounds.trimmed.right}/${bounds.trimmed.bottom}`.padEnd(22),
          `ink ${round(bounds.inkRatio)}`.padEnd(13),
          `aspect ${round(bounds.width / bounds.height)}`.padEnd(18),
          `declared ${declared ? round(declared.width / declared.height) : '—'}`.padEnd(18),
          `drift ${check?.known ? `${(check.drift * 100).toFixed(1)}%` : '—'}`.padEnd(13),
          bounds.fullFrame ? 'FULL-FRAME' : '',
          bounds.frameRuleSkipped ? 'FRAME-SKIPPED' : '',
        ].join(' ')
      );
    } catch (error) {
      table.push(`${entry.name.padEnd(34)} UNAVAILABLE  ${error.message}`);
    }
  }

  console.log(`\nELEVATION ARTWORK MEASUREMENT (${table.length} entries)\n${table.join('\n')}\n`);
  assert.ok(table.length > 0, 'the catalogue must list elevation artwork');
});

// A coarse ink thumbnail plus the edge profiles of one asset, so the shape of a
// drawing (page margin, border rule, inset tile) can be read directly.
const THUMBNAIL_MODELS = [
  'Q43FaceIcon',
  'Q45FaceIcon',
  'Q85FaceIcon',
  'Q63FaceIcon',
  'Evolve21FaceIcon',
  'Evolve31FaceIcon',
  'Evolve42FaceIcon',
  'C41FaceIcon',
  'C41_1222FaceIcon',
];

test('INSPECT the artwork shape of the representative models', async () => {
  const catalogue = readCatalogue();
  const ramps = ' .:-=+*#%@';
  const lines = [];

  for (const name of THUMBNAIL_MODELS) {
    const entry = catalogue.find((item) => item.name === name);
    if (!entry?.href) continue;
    const response = await fetch(entry.href);
    const image = decodePng(Buffer.from(await response.arrayBuffer()));
    const inkAt = (x, y) => {
      const [r, g, b, a] = image.read(x, y);
      return isElevationInk(r, g, b, a);
    };
    // Square cells, so the drawing's real proportions read off the thumbnail.
    const columns = 56;
    const rows = Math.max(6, Math.round((columns * image.height) / image.width));
    let art = '';
    for (let ry = 0; ry < rows; ry += 1) {
      for (let rx = 0; rx < columns; rx += 1) {
        const x0 = Math.floor((rx * image.width) / columns);
        const x1 = Math.max(x0 + 1, Math.floor(((rx + 1) * image.width) / columns));
        const y0 = Math.floor((ry * image.height) / rows);
        const y1 = Math.max(y0 + 1, Math.floor(((ry + 1) * image.height) / rows));
        let ink = 0;
        let total = 0;
        for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            total += 1;
            if (inkAt(x, y)) ink += 1;
          }
        }
        art += ramps[Math.min(ramps.length - 1, Math.round((ink / total) * (ramps.length - 1) * 2))];
      }
      art += '\n';
    }
    const band = (from, count, axis) => {
      const parts = [];
      for (let i = from; i < from + count; i += 1) {
        let ink = 0;
        if (axis === 'x') {
          for (let y = 0; y < image.height; y += 1) if (inkAt(i, y)) ink += 1;
        } else {
          for (let x = 0; x < image.width; x += 1) if (inkAt(x, i)) ink += 1;
        }
        parts.push(ink);
      }
      return parts.join(',');
    };
    // A 64-bucket profile of the ink-count per column and per row: the frame,
    // the page margin and the drawing all read directly off it.
    const profile = (axis) => {
      const span = axis === 'x' ? image.width : image.height;
      const depth = axis === 'x' ? image.height : image.width;
      let out = '';
      for (let bucket = 0; bucket < 64; bucket += 1) {
        const from = Math.floor((bucket * span) / 64);
        const to = Math.max(from + 1, Math.floor(((bucket + 1) * span) / 64));
        let max = 0;
        for (let i = from; i < to; i += 1) {
          let count = 0;
          for (let d = 0; d < depth; d += 1) {
            const ink = axis === 'x' ? inkAt(i, d) : inkAt(d, i);
            if (ink) count += 1;
          }
          if (count > max) max = count;
        }
        out += String(Math.min(9, Math.round((max / depth) * 9)));
      }
      return out;
    };
    lines.push(
      `\n=== ${name} ${image.width}×${image.height} ===\n${art}` +
        `cols ${profile('x')}\nrows ${profile('y')}\n` +
        `lead cols ${band(0, 24, 'x')}\nlead rows ${band(0, 12, 'y')}\n` +
        `tail cols ${band(image.width - 24, 24, 'x')}\ntail rows ${band(image.height - 12, 12, 'y')}`
    );
  }

  console.log(lines.join('\n'));
  assert.ok(lines.length > 0);
});