import React, { useMemo, useState, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSpeakers } from "@/components/data/speakerCatalog";
import { pushLcrToOverlay } from "@/components/utils/overlayBridge";

/**
 * LCR selector emits a placement instruction for the zone overlay
 * without modifying any overlay code. If the overlay listens to
 * the event or exposes Base44Overlay.setLCR, it will render.
 *
 * We compute sensible default positions on the front wall:
 * - Coordinate system: normalized [0..1] in X (width), Y (length).
 * - Y=0 is front wall (screen), Y increases toward back wall.
 * - Center (C) at x=0.5, y=0.03; L/R offset by ~0.18 of width.
 */
export default function LcrSelector({ room }) {
  const speakers = useMemo(() => getSpeakers(), []);
  const [L, setL] = useState("");
  const [C, setC] = useState("");
  const [R, setR] = useState("");

  const onSend = useCallback(() => {
    if (!room) return;

    // Normalised default positions based on a simple cinema front layout.
    const xCenter = 0.5;
    const lrOffset = 0.18; // roughly 36% total spread; tweak later if needed
    const yFront = 0.03;   // near the screen/front wall

    const payload = {
      roomId: room.id,
      roomDims: { width_m: room.width, length_m: room.length, height_m: room.height },
      coords: {
        L: { x: xCenter - lrOffset, y: yFront, z: 1.2 / (room.height || 2.4) }, // z normalized; ~1.2m ear height
        C: { x: xCenter,            y: yFront, z: 1.2 / (room.height || 2.4) },
        R: { x: xCenter + lrOffset, y: yFront, z: 1.2 / (room.height || 2.4) },
      },
      speakers: {
        L: L || null,
        C: C || null,
        R: R || null,
      },
      meta: {
        units: "normalized",
        facing: "towards+Y", // front wall pointing towards audience
        source: "RoomDetail/LcrSelector",
      }
    };

    pushLcrToOverlay(payload);
  }, [room, L, C, R]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div>
        <Label htmlFor="lcr-l">Left (L)</Label>
        <Select value={L} onValueChange={setL}>
          <SelectTrigger id="lcr-l"><SelectValue placeholder="Choose speaker" /></SelectTrigger>
          <SelectContent>
            {speakers.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="lcr-c">Centre (C)</Label>
        <Select value={C} onValueChange={setC}>
          <SelectTrigger id="lcr-c"><SelectValue placeholder="Choose speaker" /></SelectTrigger>
          <SelectContent>
            {speakers.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="lcr-r">Right (R)</Label>
        <Select value={R} onValueChange={setR}>
          <SelectTrigger id="lcr-r"><SelectValue placeholder="Choose speaker" /></SelectTrigger>
          <SelectContent>
            {speakers.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="md:col-span-3 flex justify-end">
        <Button onClick={onSend}>Send to overlays</Button>
      </div>
    </div>
  );
}