import { useEffect, useState, useCallback } from "react";
import { listRooms, getRoom, createRoom as createAPI, updateRoom as updateAPI, deleteRoom as deleteAPI } from "@/components/data/base44Entity";

export function useRooms() {
  const [rooms, setRooms] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listRooms();
      setRooms(data);
      if (data.length && !data.find(r => r.id === selectedId)) {
        setSelectedId(data[0].id);
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { refresh(); }, [refresh]);

  const createRoom = useCallback(async (payload) => {
    const id = await createAPI(payload);
    await refresh();
    return id;
  }, [refresh]);

  const updateRoom = useCallback(async (id, payload) => {
    await updateAPI(id, payload);
    await refresh();
  }, [refresh]);

  const deleteRoom = useCallback(async (id) => {
    await deleteAPI(id);
    await refresh();
    setSelectedId((curr) => (curr === id ? null : curr));
  }, [refresh]);

  const readRoom = useCallback(async (id) => {
    return getRoom(id);
  }, []);

  return {
    rooms,
    selectedId,
    setSelectedId,
    loading,
    error,
    refresh,
    createRoom,
    updateRoom,
    deleteRoom,
    readRoom,
  };
}