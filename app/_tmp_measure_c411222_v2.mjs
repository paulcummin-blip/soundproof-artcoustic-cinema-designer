// Re-measure the C4-1 cabinet's TRUE outline inside the declared crop region
// (page frame excluded), to find the precise box whose aspect matches the
// physical cabinet and removes the white margin.
import zlib from 'node:zlib';
import https from 'node:https';
import { isElevationInk } from '../src/components/report/elevation/elevationArtBounds.js';

const URLS = {
  c41_1222: { url: 'https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/0103ea1cc_ChatGPTImage9Oct202610_47_24.png', declared: { x: 45, y: 257, w: 2083, h: 208 }, phys: { w: 1222, h: 120 } },
  c41_1441: { url: 'https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/40ad34db7_ChatGPTImage9Oct202610_49_42.png', declared: { x: 36, y: 275, w: 2095, h: 170 }, phys: { w: 1441, h: 120 } },
  c41_1711: { url: 'https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/7759b8f47_ChatGPTImage9Oct202610_54_00.png', declared: { x: 35, y: 277, w: 2097, h: 149 }, phys: { w: 1711, h: 120 } },
};

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return download(res.headers.location).then(resolve, reject);
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve(Buffer.concat(chunks))); res.on('error', reject);
    }).on('error', reject);
  });
}
function decodePng(buffer) {
  let pos = 8, header = null; const idat = [];
  while (pos + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(pos); const type = buffer.toString('ascii', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], interlace: data[12] };
    else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break;
    pos += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header.colorType];
  const stride = header.width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(header.height * stride);
  let cursor = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[cursor]; cursor += 1;
    const line = raw.subarray(cursor, cursor + stride); cursor += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i += 1) {
      const b = line[i]; let val;
      if (filter === 0) val = b;
      else if (filter === 1) val = (b + (i >= channels ? cur[i - channels] : 0)) & 255;
      else if (filter === 2) val = (b + (prev ? prev[i] : 0)) & 255;
      else if (filter === 3) val = (b + Math.floor(((i >= channels ? cur[i - channels] : 0) + (prev ? prev[i] : 0)) / 2)) & 255;
      else if (filter === 4) {
        const a = i >= channels ? cur[i - channels] : 0; const c = prev ? prev[i] : 0;
        const pa = Math.abs(b), pb = Math.abs(b), pc = Math.abs(b);
        if (pa <= pb && pa <= pc) val = (b + a) & 255; else if (pb <= pc) val = (b + c) & 255; else val = (b + Math.floor((a + c) / 2)) & 255;
      } else val = b;
      cur[i] = val;
    }
  }
  return { width: header.width, height: header.height, channels, data: out };
}
function px(img, x, y) {
  const i = (y * img.width + x) * img.channels;
  const a = img.channels >= 4 ? img.data[i + 3] : 255;
  return isElevationInk(img.data[i], img.data[i + 1], img.data[i + 2], a);
}

for (const [key, info] of Object.entries(URLS)) {
  const img = decodePng(await download(info.url));
  const d = info.declared;
  // Within the declared crop's vertical band, find the cabinet's true left/right
  // by scanning columns, but EXCLUDE the page frame: only count a column as
  // cabinet edge if it has ink in the cabinet's mid-height rows (not the frame).
  const yMid0 = d.y + Math.round(d.h * 0.35);
  const yMid1 = d.y + Math.round(d.h * 0.65);
  let left = -1, right = -1;
  for (let x = d.x; x < d.x + d.w; x++) {
    let ink = false;
    for (let y = yMid0; y < yMid1 && !ink; y++) if (px(img, x, y)) ink = true;
    if (ink) { if (left < 0) left = x; right = x; }
  }
  // Within the cabinet's true horizontal span, find the true top/bottom.
  let top = -1, bottom = -1;
  for (let y = d.y; y < d.y + d.h; y++) {
    let ink = false;
    for (let x = left; x <= right && !ink; x++) if (px(img, x, y)) ink = true;
    if (ink) { if (top < 0) top = y; bottom = y; }
  }
  const tightW = right - left + 1;
  const tightH = bottom - top + 1;
  const tightAspect = tightW / tightH;
  const physAspect = info.phys.w / info.phys.h;
  const drift = Math.abs(tightAspect / physAspect - 1) * 100;
  console.log(`\n=== ${key} === native ${img.width}×${img.height}  declared crop x:${d.x} y:${d.y} w:${d.w} h:${d.h} (aspect ${(d.w/d.h).toFixed(4)})`);
  console.log(`cabinet true outline (frame-excluded): x[${left},${right}] y[${top},${bottom}] → ${tightW}×${tightH} aspect ${tightAspect.toFixed(4)}`);
  console.log(`physical ${info.phys.w}×${info.phys.h} aspect ${physAspect.toFixed(4)}  drift ${drift.toFixed(2)}%`);
  // What height would the declared-width crop need to match physical aspect?
  const heightForMatch = Math.round(d.w / physAspect);
  console.log(`→ to match physical at declared width ${d.w}: set crop height ${heightForMatch} (currently ${d.h}); crop y start ${d.y} → end ${d.y + heightForMatch} (was ${d.y + d.h})`);
  // What width would the declared-height crop need?
  const widthForMatch = Math.round(d.h * physAspect);
  console.log(`→ OR to match at declared height ${d.h}: set crop width ${widthForMatch} (currently ${d.w})`);
}