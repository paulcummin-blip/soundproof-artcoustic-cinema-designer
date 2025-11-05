import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export default function RoomList({ rooms, selectedId, onSelect, loading, error }) {
  if (error) {
    return <div className="text-red-600 text-sm">Failed to load rooms: {String(error)}</div>;
  }
  if (loading && rooms.length === 0) {
    return <div className="text-sm opacity-80">Loading…</div>;
  }
  if (!loading && rooms.length === 0) {
    return <div className="text-sm opacity-80">No rooms yet.</div>;
  }

  return (
    <ScrollArea className="h-[70vh]">
      <ul className="space-y-1">
        {rooms.map((r) => (
          <li key={r.id}>
            <button
              className={cn(
                "w-full text-left px-3 py-2 rounded-md border",
                selectedId === r.id ? "border-primary" : "border-transparent hover:border-muted-foreground/20"
              )}
              onClick={() => onSelect(r.id)}
            >
              <div className="font-medium">{r.name || "Untitled room"}</div>
              <div className="text-xs opacity-70">
                {r.width}m × {r.length}m × {r.height}m • {r.seats} seats {r.isDraft ? "• Draft" : ""}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}