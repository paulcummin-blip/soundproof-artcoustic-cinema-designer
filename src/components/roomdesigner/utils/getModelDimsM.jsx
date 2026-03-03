import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

export function getModelDimsM(model) {
  const meta = getSpeakerModelMeta(model);
  const w = Number(meta?.widthM ?? meta?.width) || 0.5;
  const d = Number(meta?.depthM ?? meta?.depth) || 0.3;
  return { widthM: w, depthM: d };
}