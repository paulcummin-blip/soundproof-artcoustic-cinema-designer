import React, { useEffect, useState } from 'react';
import { SHOW_DEBUG_PANEL } from '@/components/utils/diagnostics';

export default function DebugOverlay() {
  const [msgs, setMsgs] = useState([]);
  
  useEffect(() => {
    if (!SHOW_DEBUG_PANEL) return;
    
    window.__APP_DEBUG = {
      push: (m) => setMsgs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${m}`].slice(-30))
    };
    const onErr = (msg, src, line, col, err) => window.__APP_DEBUG.push(`onerror: ${msg}`);
    const onRej = (e) => window.__APP_DEBUG.push(`unhandledrejection: ${e?.reason?.message || e?.reason || e}`);
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, []);
  
  if (!SHOW_DEBUG_PANEL) return null;
  if (!msgs.length) return null;
  
  return (
    <div style={{
      position:'fixed', bottom:12, left:12, zIndex:9999,
      width: '40vw', maxHeight:'40vh', overflow:'auto',
      background:'rgba(33,52,40,0.95)', color:'white', fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize:12, padding:12, borderRadius:8, boxShadow:'0 6px 24px rgba(0,0,0,0.25)'
    }}>
      <div style={{fontWeight:700, marginBottom:8}}>Debug</div>
      {msgs.map((m,i)=><div key={i} style={{opacity:0.9, margin:'2px 0'}}>{m}</div>)}
    </div>
  );
}