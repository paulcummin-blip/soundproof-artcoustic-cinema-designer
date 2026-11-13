import React from "react";
import { settingsEqual } from "./electronicApplication.js";
const level=n=>n==null?"—":n===0?"Fail":"L"+n;
export default function WhatAdiDid({receipt,instances,crossover,fingerprint,authorityCurrent,busy,onRun,onRestore,disabled,physical,children}){
  const matches=receipt && receipt.resultFingerprint===fingerprint &&
    settingsEqual({instances,crossover},receipt.after);
  const verified=matches && authorityCurrent && receipt.status==="verified";
  const noChanges=matches && authorityCurrent && receipt.status==="no-changes";
  const metrics=[["p19","P19"],["primary","P20 Primary"],["secondary","P20 Secondary"]];
  let message=busy?"Checking the best result…":verified?(receipt.operation==="restore"?"Previous settings restored and verified.":"Electronic adjustments saved and verified."):noChanges?"No changes needed":
    receipt?.status==="restored"?"Previous settings restored.":receipt?.status==="verifying"?"Verification incomplete. Previous settings are available for restoration.":
    receipt?"Design changed. Run ADI to check this design.":"Run ADI to check electronic improvements.";
  return <section aria-label="What ADI did" className="rounded-xl border border-[#E6E5E2] bg-white p-5 space-y-4 text-[#262626]">
    <div><h3 className="text-[15px] font-semibold tracking-tight">What ADI did</h3>
      <p className="mt-1 text-[12px] text-[#6B6B68]" role="status">{message}</p></div>
    {verified && receipt.changes?.length>0 && <dl className="space-y-2">
      {receipt.changes.map((r,i)=><div key={i} className="flex justify-between gap-4 text-[12px]"><dt>{r.label}</dt><dd className="text-right tabular-nums">{r.from} <span className="px-1 text-[#979792]">→</span> {r.to}</dd></div>)}
    </dl>}
    {(verified||noChanges) && <div className="grid grid-cols-3 gap-3 border-t border-[#EEEDEB] pt-3" aria-label="RP22 Level comparison">
      {metrics.map(([key,label])=>{
        const before=receipt.beforeLevels?.[key],after=receipt.afterLevels?.[key];
        const colour=before!=null&&after!=null&&after>before?"text-[#257147]":before!=null&&after!=null&&after<before?"text-[#A43B32]":"text-[#565651]";
        return <div key={key}><div className="text-[10px] text-[#7B7B75]">{label}</div><div className={"mt-1 text-[13px] tabular-nums "+colour}>{level(before)} → {level(after)}</div></div>;
      })}
    </div>}
    <div className="flex gap-4 text-[12px]">
      <button type="button" disabled={busy||disabled} onClick={onRun} className="font-medium disabled:opacity-40">{receipt?"Run ADI again":"Optimise bass"}</button>
      {(verified||receipt?.status==="verifying") && receipt?.operation!=="restore" && receipt?.before && <button type="button" disabled={busy} onClick={onRestore} className="text-[#6B6B68] disabled:opacity-40">Restore previous settings</button>}
    </div>
    {physical && <aside className="border-t border-[#EEEDEB] pt-3 text-[12px]">
      <p className="font-medium">Physical recommendations</p>
      <p className="mt-1 text-[#6B6B68]">ADI found a layout option to review. Cabinets and seats have not been moved.</p>
    </aside>}
    <details className="border-t border-[#EEEDEB] pt-3 text-[11px] text-[#777772]">
      <summary className="cursor-pointer">Technical diagnostics</summary>
      <div className="mt-3">{children}</div>
    </details>
  </section>;
}
