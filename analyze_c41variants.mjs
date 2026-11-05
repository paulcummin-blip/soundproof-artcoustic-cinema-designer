import zlib from "node:zlib";
import { isElevationInk } from "./src/components/report/elevation/elevationArtBounds.js";
async function fetchBuf(url){const res=await fetch(url);return Buffer.from(await res.arrayBuffer());}
function paeth(a,b,c){const p=a+b-c;const pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);if(pa<=pb&&pa<=pc)return a;if(pb<=pc)return b;return c;}
function decodePng(buffer){let pos=8,header=null;const idat=[];while(pos+8<=buffer.length){const length=buffer.readUInt32BE(pos);const type=buffer.toString("ascii",pos+4,pos+8);const data=buffer.subarray(pos+8,pos+8+length);if(type==="IHDR")header={width:data.readUInt32BE(0),height:data.readUInt32BE(4),bitDepth:data[8],colorType:data[9],interlace:data[12]};else if(type==="IDAT")idat.push(data);else if(type==="IEND")break;pos+=12+length;}const raw=zlib.inflateSync(Buffer.concat(idat));const{width,height,colorType}=header;const channels=colorType===6?4:colorType===2?3:1;const bpp=channels;const rows=[];let p=0;let prev=new Uint8Array(width*bpp);for(let y=0;y<height;y++){const filter=raw[p++];const line=raw.subarray(p,p+width*bpp);p+=width*bpp;const out=new Uint8Array(width*bpp);for(let i=0;i<width*bpp;i++){const a=i>=bpp?out[i-bpp]:0;const b=prev[i]||0;const c=i>=bpp?prev[i-bpp]:0;let v;if(filter===0)v=line[i];else if(filter===1)v=(line[i]+a)&255;else if(filter===2)v=(line[i]+b)&255;else if(filter===3)v=(line[i]+((a+b)>>1))&255;else if(filter===4)v=(line[i]+paeth(a,b,c))&255;else throw new Error("filter"+filter);out[i]=v;}rows.push(out);prev=out;}return{width,height,channels,rows};}
function analyze(url,label){
  return (async()=>{
    const { width, height, channels, rows } = decodePng(await fetchBuf(url));
    function px(x,y){const row=rows[y];const i=x*channels;return[row[i],row[i+1],row[i+2],channels===4?row[i+3]:255];}
    function lum(x,y){const[r,g,b]=px(x,y);return 0.2126*r+0.7152*g+0.0722*b;}
    let corner=lum(0,0), midL=lum(0,Math.floor(height/2)), midR=lum(width-1,Math.floor(height/2)), midT=lum(Math.floor(width/2),0), midB=lum(Math.floor(width/2),height-1);
    // background sample: median of 100 edge pixels
    let edges=[]; for(let i=0;i<50;i++){edges.push(lum(i,0));edges.push(lum(width-1-i,height-1));}
    edges.sort((a,b)=>a-b); let med=edges[Math.floor(edges.length/2)];
    console.log(`${label}: ${width}x${height} corner=${corner.toFixed(0)} midL=${midL.toFixed(0)} midR=${midR.toFixed(0)} midT=${midT.toFixed(0)} midB=${midB.toFixed(0)} medEdge=${med.toFixed(0)}`);
  })();
}
await analyze("https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/0103ea1cc_ChatGPTImage9Oct202610_47_24.png","c41_1222");
await analyze("https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/40ad34db7_ChatGPTImage9Oct202610_49_42.png","c41_1441");
await analyze("https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/7759b8f47_ChatGPTImage9Oct202610_54_00.png","c41_1711");
await analyze("https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/2adee2973_Screenshot2026-06-05at132314.png","c41_default");
