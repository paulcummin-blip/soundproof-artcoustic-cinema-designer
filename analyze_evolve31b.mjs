import zlib from "node:zlib";
import { isElevationInk } from "./src/components/report/elevation/elevationArtBounds.js";
async function fetchBuf(url){const res=await fetch(url);return Buffer.from(await res.arrayBuffer());}
function paeth(a,b,c){const p=a+b-c;const pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);if(pa<=pb&&pa<=pc)return a;if(pb<=pc)return b;return c;}
function decodePng(buffer){let pos=8,header=null;const idat=[];while(pos+8<=buffer.length){const length=buffer.readUInt32BE(pos);const type=buffer.toString("ascii",pos+4,pos+8);const data=buffer.subarray(pos+8,pos+8+length);if(type==="IHDR")header={width:data.readUInt32BE(0),height:data.readUInt32BE(4),bitDepth:data[8],colorType:data[9],interlace:data[12]};else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;pos+=12+length;}const raw=zlib.inflateSync(Buffer.concat(idat));const{width,height,colorType}=header;const channels=colorType===6?4:colorType===2?3:1;const bpp=channels;const rows=[];let p=0;let prev=new Uint8Array(width*bpp);for(let y=0;y<height;y++){const filter=raw[p++];const line=raw.subarray(p,p+width*bpp);p+=width*bpp;const out=new Uint8Array(width*bpp);for(let i=0;i<width*bpp;i++){const a=i>=bpp?out[i-bpp]:0;const b=prev[i]||0;const c=i>=bpp?prev[i-bpp]:0;let v;if(filter===0)v=line[i];else if(filter===1)v=(line[i]+a)&255;else if(filter===2)v=(line[i]+b)&255;else if(filter===3)v=(line[i]+((a+b)>>1))&255;else if(filter===4)v=(line[i]+paeth(a,b,c))&255;else throw new Error("filter"+filter);out[i]=v;}rows.push(out);prev=out;}return{width,height,channels,rows};}
const { width, height, channels, rows } = decodePng(await fetchBuf("https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/053510389_Evolve3-1front.png"));
function px(x,y){const row=rows[y];const i=x*channels;return[row[i],row[i+1],row[i+2],channels===4?row[i+3]:255];}
function lum(x,y){const[r,g,b]=px(x,y);return 0.2126*r+0.7152*g+0.0722*b;}
// Column ink counts (lum<236) for first 12 and last 12 columns
const colCount = new Array(width).fill(0);
for (let x=0;x<width;x++) for (let y=0;y<height;y++) if (isElevationInk(...px(x,y))) colCount[x]++;
console.log("Column ink counts (lum<236), x=0..11:", colCount.slice(0,12).join(","));
console.log("Column ink counts, x=740..750:", colCount.slice(740,751).join(","));
console.log("threshold (0.03*1024 ceil)=", Math.max(2, Math.ceil(0.03*height)));
// What if pageLevel=250? Recount edge columns
let colCount250 = new Array(width).fill(0);
for (let x=0;x<width;x++) for (let y=0;y<height;y++){const[r,g,b,a]=px(x,y);const l=0.2126*r+0.7152*g+0.0722*b; if(a>=8 && l<250) colCount250[x]++;}
console.log("With lum<250, x=0..11:", colCount250.slice(0,12).join(","), " x=740..750:", colCount250.slice(740,751).join(","));
// Is there a vertical cabinet line? Check column 1 and 750 row-by-row sample
let c1rows=[]; for(let y=0;y<height;y++) if(isElevationInk(...px(1,y))) c1rows.push(y);
let c750rows=[]; for(let y=0;y<height;y++) if(isElevationInk(...px(750,y))) c750rows.push(y);
console.log("col x=1 ink rows count:", c1rows.length, "first 10:", c1rows.slice(0,10), "last 10:", c1rows.slice(-10));
console.log("col x=750 ink rows count:", c750rows.length, "first 10:", c750rows.slice(0,10), "last 10:", c750rows.slice(-10));
// Total ink across full image and what % is in margins
let total=0; for(let x=0;x<width;x++) total+=colCount[x];
console.log("total ink:", total, "left margin(<139):", colCount.slice(0,139).reduce((a,b)=>a+b,0), "right margin(>=582):", colCount.slice(582).reduce((a,b)=>a+b,0));
