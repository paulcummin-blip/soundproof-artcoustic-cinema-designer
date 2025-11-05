import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import LcrSelector from "./LcrSelector";

export default function RoomDetail({ room, onEdit, onDelete }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">{room.name || "Untitled room"}</h2>
          <div className="text-sm opacity-70">
            {room.width}m × {room.length}m × {room.height}m • {room.seats} seats
          </div>
          {room.isDraft && <Badge variant="outline" className="mt-2">Draft</Badge>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onEdit}>Edit</Button>
          <Button variant="destructive" onClick={onDelete}>Delete</Button>
        </div>
      </div>

      <Separator />

      <div>
        <div className="text-sm font-medium mb-1">Notes</div>
        <p className="text-sm whitespace-pre-wrap">{room.notes || "—"}</p>
      </div>

      <Separator />

      <div>
        <div className="text-sm font-medium mb-2">LCR Speaker Selection</div>
        <LcrSelector room={room} />
      </div>
    </div>
  );
}