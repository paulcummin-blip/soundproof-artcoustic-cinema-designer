"use client";

import React from "react";
import SubwooferSelector from "./SubwooferSelector";

export default function SubwooferMenu({
  frontCfg, setFrontCfg,
  rearCfg, setRearCfg,
  disabled = false
}) {
  return (
    <div className="space-y-6 px-1">
      <SubwooferSelector
        title="Front Subwoofers"
        cfg={frontCfg}
        onChange={setFrontCfg}
        disabled={disabled}
      />
      <div className="h-px bg-[#DCDBD6]" />
      <SubwooferSelector
        title="Rear Subwoofers"
        cfg={rearCfg}
        onChange={setRearCfg}
        disabled={disabled}
      />
    </div>
  );
}