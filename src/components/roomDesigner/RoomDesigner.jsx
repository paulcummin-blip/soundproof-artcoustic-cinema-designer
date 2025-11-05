"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SafeBootErrorBoundary } from "@/components/dev/SafeBootErrorBoundary";
import { SegmentBoundary } from "@/components/dev/SegmentBoundary";
import RoomList from "./RoomList";
import RoomDetail from "./RoomDetail";
import RoomForm from "./RoomForm";
import { useRooms } from "@/components/hooks/useRooms";

const containerStyle = {
  display: "grid",
  gridTemplateColumns: "320px 1fr",
  gap: "16px",
  width: "100%",
  height: "100%",
};

export default function RoomDesigner() {
  const {
    rooms,
    selectedId,
    setSelectedId,
    createRoom,
    updateRoom,
    deleteRoom,
    refresh,
    loading,
    error,
  } = useRooms();

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedId) || null,
    [rooms, selectedId]
  );

  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = useCallback(async (data) => {
    const newId = await createRoom(data);
    setSelectedId(newId);
    setIsCreating(false);
  }, [createRoom, setSelectedId]);

  const handleUpdate = useCallback(async (data) => {
    if (!selectedRoom) return;
    await updateRoom(selectedRoom.id, data);
    setIsEditing(false);
  }, [selectedRoom, updateRoom]);

  const handleDelete = useCallback(async () => {
    if (!selectedRoom) return;
    await deleteRoom(selectedRoom.id);
    setIsEditing(false);
  }, [selectedRoom, deleteRoom]);

  return (
    <SafeBootErrorBoundary>
      <SegmentBoundary name="RoomDesigner">
        <div className="p-3 md:p-4 w-full h-full">
          <div style={containerStyle}>
            <Card className="p-3 md:p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Rooms</h2>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
                    Refresh
                  </Button>
                  <Button size="sm" onClick={() => { setIsCreating(true); setIsEditing(false); }}>
                    New
                  </Button>
                </div>
              </div>
              <Separator className="my-3" />
              <RoomList
                rooms={rooms}
                selectedId={selectedId}
                onSelect={setSelectedId}
                loading={loading}
                error={error}
              />
            </Card>

            <Card className="p-3 md:p-4">
              {!selectedRoom && !isCreating && (
                <div className="text-sm opacity-80">Select a room on the left, or create a new one.</div>
              )}

              {isCreating && (
                <RoomForm
                  mode="create"
                  initialValues={{ name: "", width: 4.5, length: 6.5, height: 2.4, seats: 2, isDraft: true, notes: "" }}
                  onCancel={() => setIsCreating(false)}
                  onSubmit={handleCreate}
                />
              )}

              {selectedRoom && !isEditing && (
                <RoomDetail
                  room={selectedRoom}
                  onEdit={() => { setIsEditing(true); setIsCreating(false); }}
                  onDelete={handleDelete}
                />
              )}

              {selectedRoom && isEditing && (
                <RoomForm
                  mode="edit"
                  initialValues={selectedRoom}
                  onCancel={() => setIsEditing(false)}
                  onSubmit={handleUpdate}
                />
              )}
            </Card>
          </div>
        </div>
      </SegmentBoundary>
    </SafeBootErrorBoundary>
  );
}