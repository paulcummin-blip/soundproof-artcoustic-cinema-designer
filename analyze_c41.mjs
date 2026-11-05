import zlib from "node:zlib";
import { isElevationInk } from "./src/components/report/elevation/elevationArtBounds.js";
async function fetchBuf(url){const res=await fetch(url);return Buffer.from(await res.arrayBuffer());}
function paeth(a,b,c){const p=a+b-c;const pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);if(pa<=pb&&pa<=pc)return a;if(pb<=pc)return b;return c;}
function decodePng(buffer){let pos=8,header=null;const idat=[];while(pos+8<=buffer.length){const length=buffer.readUInt32BE(pos);const type=buffer.toString("ascii",pos+4,pos+8);const data=buffer.subarray(pos+8,pos+8+length);if(type==="IHDR")header={width:data.readUInt32BE(0),height:data.readUInt32BE(4),bitDepth:data[8],colorType:data[9],interlace:data[12]};else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;pos+=12+length;}const raw=zlib.inflateSync(Buffer.concat(idat));const{width,height,colorType}=header;const channels=colorType===6?4:colorType===2?3:1;const bpp=channels;const rows=[];let p=0;let prev=new Uint8Array(width*bpp);for(let y=0;y<height;y++){const filter=raw[p++];const line=raw.subarray(p,p+width*bpp);p+=width*bpp;const out=new Uint8Array(width*bpp);for(let i=0;i<width*bpp;i++){const a=i>=bpp?out[i-bpp]:0;const b=prev[i]||0;const c=i>=bpp?prev[i-bpp]:0;let v;if(filter===0)v=line[i];else if(filter===1)v=(line[i]+a)&255;else if(filter===2)v=(line[i]+b)&255;else if(filter===3)v=(line[i]+((a+b)>>1))&255;else if(filter===4)v=(line[i]+paeth(a,b,c))&255;else throw new Error("filter"+filter);out[i]=v;}rows.push(out);prev=out;}return{width,height,channels,rows};}
const url="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/2adee2973_Screenshot2026-06-05at132314.png";
const { width, height, channels, rows } = decodePng(await fetchBuf(url));
console.log("default c41 image:", width, "x", height, "channels", channels);
function px(x,y){const row=rows[y];const i=x*channels;return[row[i],row[i+1],row[i+2],channels===4?row[i+3]:255];}
function lum(x,y){const[r,g,b]=px(x,y);return 0.2126*r+0.7152*g+0.0722*b;}
// ink bounds lum<236
let minX=width,minY=height,maxX=0,maxY=0,ink=0;
for(let y=0;y<height;y++)for(let x=0;x<width;x++){if(isElevationInk(...px(x,y))){ink++;if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}}
console.log(`ink bounds (lum<236): x[${minX},${maxX}] y[${minY},${maxY}] w=${maxX-minX+1} h=${maxY-minY+1} aspect=${((maxX-minX+1)/(maxY-minY+1)).toFixed(3)} ink=${ink}`);
// check corner pixels luminance (is the page pure white or grey?)
console.log("corner lum: (0,0)=",lum(0,0).toFixed(1),"(w-1,0)=",lum(width-1,0).toFixed(1),"(0,h-1)=",lum(0,height-1).toFixed(1),"(w-1,h-1)=",lum(width-1,height-1).toFixed(1));
// sample mid-edge
console.log("edge mids: left=",lum(0,Math.floor(height/2)).toFixed(1),"right=",lum(width-1,Math.floor(height/2)).toFixed(1),"top=",lum(Math.floor(width/2),0).toFixed(1),"bot=",lum(Math.floor(width/2),height-1).toFixed(1));
// distribution of background luminance
let hist={}; for(let y=0;y<height;y+=4)for(let x=0;x<width;x+=4){const l=Math.round(lum(x,y)/10)*10; hist[l]=(hist[l]||0)+1;}
console.log("lum histogram (sampled, /10):", Object.entries(hist).sort((a,b)=>a[0]-b[0]).map(([k,v])=>`${k}:${v}`).join(" "));
