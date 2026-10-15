// ---------------------------------------------------------------------------
// scripts/measureElevationArt.mjs
// ---------------------------------------------------------------------------
// Measures the drawing's own bounds inside every catalogue artwork used by the
// ELEVATION drawings, using the SAME rules the app renders with
// (src/components/report/elevation/elevationArtBounds.js).
//
// It reads the asset list from the face-icon catalogue, downloads each asset,
// decodes the PNG, finds the ink bounds, and prints the numbers that go into the
// elevation artwork authority. Nothing here writes to an asset.
//
//   node scripts/measureElevationArt.mjs
// ---------------------------------------------------------------------------
import fs from "node:fs";
import zlib from "node:zlib";
import {
  detectElevationArtBounds,
  isElevationInk,
  boundsFromViewBox,
  elevationArtAspectCheck,
} from "../src/components/report/elevation/elevationArtBounds.js";

const ICON_FILES = [
  "src/components/report/SpeakerFaceIcons.jsx",
  "src/components/report/C41ArtworkFaceIcons.jsx",
];

// ─── PNG decode (8-bit, non-interlaced) ──────────────────────────────────────

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8;
  let header = null;
  let palette = null;
  let transparency = null;
  const idat = [];

  while (pos + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString("ascii", pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === "IDAT") idat.push(data);
    else if (type === "PLTE") palette = data;
    else if (type === "tRNS") transparency = data;
    else if (type === "IEND") break;
    pos += 12 + length;
  }

  if (!header) throw new Error("no IHDR");
  if (header.bitDepth !== 8) throw new Error(`bit depth ${header.bitDepth} unsupported`);
  if (header.interlace !== 0) throw new Error("interlaced PNG unsupported");

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

// ─── Asset list from the icon catalogue ─────────────────────────────────────

function readCatalogue() {
  const entries = [];
  for (const file of ICON_FILES) {
    const source = fs.readFileSync(file, "utf8");
    const parts = source.split("export function ");
    for (const part of parts.slice(1)) {
      const name = part.match(/^(\w+)/)?.[1];
      if (!name) continue;
      const href = part.match(/href="([^"]+)"/)?.[1] || null;
      const viewBox = part.match(/viewBox="([^"]+)"/)?.[1] || null;
      entries.push({ name, href, viewBox });
    }
  }
  return entries;
}

// ─── Report ─────────────────────────────────────────────────────────────────

const pad = (value, width) => String(value ?? "").padEnd(width);
const num = (value) => (Number.isFinite(value) ? Math.round(value * 1000) / 1000 : "—");

async function main() {
  const catalogue = readCatalogue();
  const rows = [];

  for (const entry of catalogue) {
    if (!entry.href) {
      rows.push({ ...entry, kind: "vector", note: `viewBox ${entry.viewBox || "—"}` });
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
      rows.push({
        ...entry,
        kind: "raster",
        native: `${image.width}×${image.height}`,
        bounds,
        declared,
        check,
        kb: Math.round(buffer.length / 1024),
      });
    } catch (error) {
      rows.push({ ...entry, kind: "raster", note: `MEASURE FAILED: ${error.message}` });
    }
  }

  for (const row of rows) {
    if (row.kind === "vector") {
      console.log(`${pad(row.name, 34)} VECTOR  ${row.note}`);
      continue;
    }
    if (!row.bounds) {
      console.log(`${pad(row.name, 34)} ${pad(row.native, 11)} ${row.note || "NO INK FOUND (fallback)"}`);
      continue;
    }
    const b = row.bounds;
    const t = b.trimmed;
    console.log(
      [
        pad(row.name, 34),
        pad(row.native, 11),
        pad(`${b.x},${b.y},${b.width},${b.height}`, 26),
        pad(`trim ${t.left}/${t.top}/${t.right}/${t.bottom}`, 22),
        pad(`ink ${num(b.inkRatio)}`, 14),
        pad(`aspect ${num(b.width / b.height)}`, 18),
        pad(row.declared ? `declared ${num(row.declared.width / row.declared.height)}` : "declared —", 22),
        pad(row.check?.known ? `drift ${(row.check.drift * 100).toFixed(1)}%` : "drift —", 14),
        b.fullFrame ? "FULL-FRAME" : "",
        b.frameRuleSkipped ? "FRAME-SKIPPED" : "",
        row.kb ? `${row.kb}kB` : "",
      ].join(" ")
    );
  }
}

main().catch((error) => {
  console.error("measurement failed:", error);
  process.exitCode = 1;
});