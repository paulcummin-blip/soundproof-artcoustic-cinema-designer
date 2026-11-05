import fs from "node:fs";
import zlib from "node:zlib";
import { isElevationInk } from "./src/components/report/elevation/elevationArtBounds.js";

async function fetchBuf(url) { const res = await fetch(url); return Buffer.from(await res.arrayBuffer()); }
function paeth(a,b,c){const p=a+b-c;const pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);if(pa<=pb&&pa<=pc)return a;if(pb<=pc)return b;return c;}
function decodePng(buffer) {
  let pos = 8, header = null; const idat = [];
  while (pos + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString("ascii", pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], interlace: data[12] };
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { width, height, colorType } = header;
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const bpp = channels;
  const rows = []; let p = 0; let prev = new Uint8Array(width * bpp);
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const line = raw.subarray(p, p + width * bpp); p += width * bpp;
    const out = new Uint8Array(width * bpp);
    for (let i = 0; i < width * bpp; i++) {
      const a = i >= bpp ? out[i - bpp] : 0;
      const b = prev[i] || 0;
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v;
      if (filter === 0) v = line[i];
      else if (filter === 1) v = (line[i] + a) & 255;
      else if (filter === 2) v = (line[i] + b) & 255;
      else if (filter === 3) v = (line[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) v = (line[i] + paeth(a, b, c)) & 255;
      else throw new Error("filter " + filter);
      out[i] = v;
    }
    rows.push(out); prev = out;
  }
  return { width, height, channels, rows };
}
const url = "https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/053510389_Evolve3-1front.png";
const { width, height, channels, rows } = decodePng(await fetchBuf(url));
console.log("decoded", width, height, "channels", channels);
function px(x, y) { const row = rows[y]; const i = x * channels; return [row[i], row[i+1], row[i+2], channels === 4 ? row[i+3] : 255]; }
function lum(x, y) { const [r,g,b] = px(x,y); return 0.2126*r + 0.7152*g + 0.0722*b; }
// Ink count left of 139 and right of 582
let inkLeft = 0, inkRight = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < 139; x++) if (isElevationInk(...px(x,y))) inkLeft++;
  for (let x = 582; x < width; x++) if (isElevationInk(...px(x,y))) inkRight++;
}
console.log("Ink (lum<236) left margin x<139:", inkLeft, " right margin x>=582:", inkRight);
// first dark from left at several y, thresholds 236 and 250
for (const y of [100, 300, 512, 700, 900]) {
  let f236 = -1, f250 = -1, l236 = -1, l250 = -1;
  for (let x = 0; x < width; x++) { const l = lum(x,y); if (f236<0&&l<236)f236=x; if (f250<0&&l<250)f250=x; }
  for (let x = width-1; x>=0; x--) { const l = lum(x,y); if (l236<0&&l<236)l236=x; if (l250<0&&l<250)l250=x; }
  console.log(`y=${y}: first<236=${f236} last<236=${l236} | first<250=${f250} last<250=${l250}`);
}
// Min luminance per 50px column band
let bands = [];
for (let bx = 0; bx < width; bx += 50) {
  let mn = 255;
  for (let y = 0; y < height; y += 1) for (let x = bx; x < bx+50 && x < width; x++) { const l = lum(x,y); if (l<mn) mn=l; }
  bands.push(`[${bx}:${mn.toFixed(0)}]`);
}
console.log("min lum per 50px band:", bands.join(" "));
