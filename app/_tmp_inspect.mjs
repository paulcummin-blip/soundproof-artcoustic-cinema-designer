import { isElevationInk } from "./src/components/report/elevation/elevationArtBounds.js";
import zlib from "node:zlib";

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8, header = null, palette = null, transparency = null;
  const idat = [];
  while (pos + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString("ascii", pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], interlace: data[12] };
    else if (type === "IDAT") idat.push(data);
    else if (type === "PLTE") palette = data;
    else if (type === "tRNS") transparency = data;
    else if (type === "IEND") break;
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
      else if (filter === 4) { const pa=Math.abs(b-c),pb=Math.abs(a-c),pc=Math.abs(a+b-2*c); value += pa<=pb&&pa<=pc?a:pb<=pc?b:c; }
      current[i] = value & 255;
    }
  }
  const read = (x, y) => {
    const offset = y * stride + x * channels;
    if (header.colorType === 6) return [out[offset], out[offset+1], out[offset+2], out[offset+3]];
    if (header.colorType === 2) return [out[offset], out[offset+1], out[offset+2], 255];
    return [out[offset], out[offset], out[offset], 255];
  };
  return { width: header.width, height: header.height, read };
}

const targets = [
  { name: "Evolve 3-1", href: "https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/053510389_Evolve3-1front.png", crop: {x:11,y:10,w:730,h:1005} },
  { name: "C4-1 1222", href: "https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/0103ea1cc_ChatGPTImage9Oct202610_47_24.png", crop: {x:45,y:257,w:2083,h:208} },
  { name: "C4-1 default", href: "https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/2adee2973_Screenshot2026-06-05at132314.png", crop: {x:6,y:7,w:1014,h:67} },
];

const ramps = " .:-=+*#%@";
for (const t of targets) {
  const buf = Buffer.from(await (await fetch(t.href)).arrayBuffer());
  const img = decodePng(buf);
  const inkAt = (x,y) => { const [r,g,b,a] = img.read(x,y); return isElevationInk(r,g,b,a); };
  // find ink bounds
  let minx=img.width,maxx=0,miny=img.height,maxy=0,ink=0;
  for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){if(inkAt(x,y)){ink++;if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;}}
  console.log(`\n=== ${t.name}  native ${img.width}x${img.height} ===`);
  console.log(`authority crop: x:${t.crop.x} y:${t.crop.y} w:${t.crop.w} h:${t.crop.h}  (aspect ${(t.crop.w/t.crop.h).toFixed(3)})`);
  console.log(`actual ink:     x:${minx} y:${miny} w:${maxx-minx+1} h:${maxy-miny+1}  (aspect ${((maxx-minx+1)/(maxy-miny+1)).toFixed(3)})  inkRatio:${(ink/(img.width*img.height)).toFixed(3)}`);
  const cols = 72;
  const rows = Math.max(6, Math.round((cols * img.height) / img.width));
  let art = "";
  for (let ry = 0; ry < rows; ry += 1) {
    for (let rx = 0; rx < cols; rx += 1) {
      const x0 = Math.floor((rx*img.width)/cols), x1 = Math.max(x0+1, Math.floor(((rx+1)*img.width)/cols));
      const y0 = Math.floor((ry*img.height)/rows), y1 = Math.max(y0+1, Math.floor(((ry+1)*img.height)/rows));
      let c=0, total=0;
      for (let y=y0;y<y1;y+=1) for (let x=x0;x<x1;x+=1) { total+=1; if (inkAt(x,y)) c+=1; }
      art += ramps[Math.min(ramps.length-1, Math.round((c/total)*(ramps.length-1)*2))];
    }
    art += "\n";
  }
  console.log(art);
}