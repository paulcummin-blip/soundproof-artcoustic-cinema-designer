import { access } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root='/app/src';
async function existing(base){for(const suffix of ['', '.js','.jsx','.mjs','/index.js','/index.jsx']){const p=base+suffix;try{await access(p);return p}catch{}}return null}
export async function resolve(specifier,context,nextResolve){if(specifier.startsWith('@/')){const p=await existing(path.join(root,specifier.slice(2)));if(p)return {url:pathToFileURL(p).href,shortCircuit:true}}if(specifier.startsWith('.')&&context.parentURL){const p=await existing(path.resolve(path.dirname(new URL(context.parentURL).pathname),specifier));if(p)return {url:pathToFileURL(p).href,shortCircuit:true}}return nextResolve(specifier,context)}
export async function load(url,context,nextLoad){if(url.endsWith('.jsx')){const {readFile}=await import('node:fs/promises');return {format:'module',source:await readFile(new URL(url),'utf8'),shortCircuit:true}}return nextLoad(url,context)}