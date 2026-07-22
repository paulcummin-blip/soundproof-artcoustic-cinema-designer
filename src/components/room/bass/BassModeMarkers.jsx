import React from "react";
import { ReferenceLine } from "recharts";
import { ROOM_MODE_STYLES } from "@/components/room/bass/roomModePresentation";

export default function BassModeMarkers({ markers = {} }) {
  const [activeKey, setActiveKey] = React.useState(null);
  return Object.entries(markers).flatMap(([family, items]) => (items || []).map((marker) => {
    const key = `${family}-${marker.n.join("-")}-${marker.fHz.toFixed(4)}`;
    const active = activeKey === key;
    const style = ROOM_MODE_STYLES[family];
    const axis = marker.axisLabel ? `, ${marker.axisLabel} axis` : "";
    const title = `${style.label} mode ${marker.fHz.toFixed(2)} Hz${axis}, order ${marker.order}, indices (${marker.n.join(",")})`;
    return (
      <ReferenceLine
        key={key}
        x={marker.fHz}
        stroke={style.color}
        strokeWidth={active ? 2.5 : 1.2}
        opacity={active ? 1 : 0.45}
        onMouseEnter={() => setActiveKey(key)}
        onMouseLeave={() => setActiveKey(null)}
        onClick={() => setActiveKey(active ? null : key)}
      >
        <title>{title}</title>
      </ReferenceLine>
    );
  }));
}