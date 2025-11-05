import { useMemo } from "react";
import { computeRP22Metrics, proposeEqualisedNudges } from "./angles";

/**
 * Read-only hook to compute RP22 angular metrics and equal-gap proposals.
 * @param {{ mlp: {x:number;y:number}; speakers: Array<{id:string;role:string;position:{x:number;y:number;z?:number}}>; padsById: Record<string, any>; targets?: Partial<{frontWideDeg:number; sideDeg:number; rearDeg:number; equaliseWeight:number}> }} opts
 */
export function useRp22Angles(opts) {
  const targets = {
    frontWideDeg: 55,
    sideDeg: 80,
    rearDeg: 135,
    equaliseWeight: 0.7,
    ...(opts?.targets || {}),
  };

  return useMemo(() => {
    const metrics = computeRP22Metrics(opts.mlp, opts.speakers, targets);
    const eq = proposeEqualisedNudges({
      mlp: opts.mlp,
      speakers: opts.speakers,
      padsById: opts.padsById || {},
      targets,
    });
    return { metrics, eq };
  }, [
    opts.mlp?.x,
    opts.mlp?.y,
    JSON.stringify(opts.speakers || []),
    JSON.stringify(opts.padsById || {}),
    targets.frontWideDeg,
    targets.sideDeg,
    targets.rearDeg,
    targets.equaliseWeight,
  ]);
}