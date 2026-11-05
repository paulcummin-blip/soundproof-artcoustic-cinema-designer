// One-off measurement of the C4-1 1222 mm source artwork's true ink bounds,
// to correct the crop so the drawn cabinet outline coincides with the
// 1222 × 120 mm physical footprint (no white margin on either axis).
import fs from 'node:fs';
import zlib from 'node:zlib';
import https from 'node:https';
import {
  detectElevationArtBounds,
  isElevationInk,
} from '../src/components/report/elevation/elevationArtBounds.js';

const URLS = {
  c41_1222: 'https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/0103ea1cc_ChatGPTImage9Oct202610_47_24.png',
  c41_1441: 'https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/40ad34db7_ChatGPTImage9Oct202610_49_42.png',
  c41_1711: 'https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/7759b8f47_ChatGPTImage9Oct202610_54_00.png',
};

const PHYSICAL = {
  c41_1222: { w: 1222, h: 120 },
  c41_1441: { w: 1441, h: 120 },
  c41_1711: { w: 1711, h: 120 },
};

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

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
      header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], interlace: data[12] };
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
    const filter = raw[cursor]; cursor += 1;
    const line = raw.subarray(cursor, cursor + stride); cursor += stride;
    const current = out.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i += 1) {
      const b = line[i];
      let val;
      if (filter === 0) val = b;
      else if (filter === 1) val = (b + (i >= channels ? current[i - channels] : 0)) & 255;
      else if (filter === 2) val = (b + (previous ? previous[i] : 0)) & 255;
      else if (filter === 3) val = (b + Math.floor(((i >= channels ? current[i - channels] : 0) + (previous ? previous[i] : 0)) / 2)) & 255;
      else if (filter === 4) {
        const a = i >= channels ? current[i - channels] : 0;
        const c = previous ? previous[i] : 0;
        const p = b + Math.floor((a + c) / 2);
        const pa = Math.abs(p - a), pb = Math.abs(p - c), pc = Math.abs(p - (a + c) / 2);
        if (pa <= pb && pa <= pc) val = (b + a) & 255;
        else if (pb <= pc) val = (b + c) & 255;
        else val = (b + Math.floor((a + c) / 2)) & 255;
      } else { val = b; }
      current[i] = val;
    }
  }
  return { width: header.width, height: header.height, channels, data: out };
}

function inkAt(img) {
  const { width, height, channels, data } = img;
  return (x, y) => {
    const i = (y * width + x) * channels;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const a = channels >= 4 ? data[i + 3] : 255;
    return isElevationInk(r, g, b, a);
  };
}

// Per-column ink density scan for the soundbar region — reports how far the
// horizontal cabinet rules extend (the cabinet's true left/right edges), which
// the standard ink detector can miss on a long, line-sparse drawing.
function columnDensity(img, y0, y1) {
  const { width, height, channels, data } = img;
  const counts = new Array(width).fill(0);
  const yStart = Math.max(0, y0);
  const yEnd = Math.min(height, y1);
  for (let x = 0; x < width; x += 1) {
    for (let y = yStart; y < yEnd; y += 1) {
      const i = (y * width + x) * channels;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const a = channels >= 4 ? data[i + 3] : 255;
      if (isElevationInk(r, g, b, a)) counts[x] += 1;
    }
  }
  return counts;
}

for (const [key, url] of Object.entries(URLS)) {
  const buf = await download(url);
  const img = decodePng(buf);
  const bounds = detectElevationArtBounds({ width: img.width, height: img.height, inkAt: inkAt(img) });
  console.log(`\n=== ${key} === native ${img.width}×${img.height}`);
  console.log('detectElevationArtBounds →', JSON.stringify(bounds));
  if (bounds) {
    const cropAspect = bounds.width / bounds.height;
    const phys = PHYSICAL[key];
    const physAspect = phys.w / phys.h;
    console.log(`crop aspect ${cropAspect.toFixed(4)}  physical ${physAspect.toFixed(4)}  drift ${((Math.abs(cropAspect/physAspect-1))*100).toFixed(2)}%`);
  }
  // Also report the cabinet's true horizontal extent via column density in the
  // declared crop's vertical band — the horizontal rules ARE the cabinet edges.
  const declared = { c41_1222: { y0: 257, y1: 465 }, c41_1441: { y0: 275, y1: 445 }, c41_1711: { y0: 277, y1: 426 } }[key];
  const cols = columnDensity(img, declared.y0, declared.y1);
  let firstInkCol = -1, lastInkCol = -1;
  for (let x = 0; x < cols.length; x++) if (cols[x] > 0) { firstInkCol = x; break; }
  for (let x = cols.length - 1; x >= 0; x--) if (cols[x] > 0) { lastInkCol = x; break; }
  console.log(`horizontal cabinet rules span columns [${firstInkCol}, ${lastInkCol}] within y[${declared.y0}, ${declared.y1}]`);
  // Vertical ink extent within the horizontal rule span
  const { width, height, channels, data } = img;
  let firstInkRow = -1, lastInkRow = -1;
  for (let y = 0; y < height; y++) {
    let rowInk = false;
    for (let x = Math.max(0, firstInkCol); x <= Math.min(width-1, lastInkCol); x++) {
      const i = (y * width + x) * channels;
      const r = data[i], g = data[i+1], b = data[i+2];
      const a = channels >= 4 ? data[i+3] : 255;
      if (isElevationInk(r,g,b,a)) { rowInk = true; break; }
    }
    if (rowInk) { if (firstInkRow < 0) firstInkRow = y; lastInkRow = y; }
  }
  console.log(`vertical cabinet ink spans rows [${firstInkRow}, ${lastInkRow}]`);
  const tightAspect = (lastInkCol - firstInkCol + 1) / (lastInkRow - firstInkRow + 1);
  const phys = PHYSICAL[key];
  console.log(`tight ink box aspect ${tightAspect.toFixed(4)}  physical ${phys.w}/${phys.h}=${(phys.w/phys.h).toFixed(4)}  drift ${((Math.abs(tightAspect/(phys.w/phys.h)-1))*100).toFixed(2)}%`);
}