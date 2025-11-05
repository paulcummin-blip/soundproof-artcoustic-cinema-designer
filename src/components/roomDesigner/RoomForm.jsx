import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

export default function RoomForm({ mode, initialValues, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: initialValues?.name ?? "",
    width: Number(initialValues?.width ?? 4.5),
    length: Number(initialValues?.length ?? 6.5),
    height: Number(initialValues?.height ?? 2.4),
    seats: Number(initialValues?.seats ?? 2),
    isDraft: Boolean(initialValues?.isDraft ?? true),
    notes: initialValues?.notes ?? "",
  });

  const [saving, setSaving] = useState(false);

  const update = useCallback((k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
  }, []);

  const submit = useCallback(async () => {
    setSaving(true);
    try {
      await onSubmit(form);
    } finally {
      setSaving(false);
    }
  }, [form, onSubmit]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} />
        </div>

        <div>
          <Label htmlFor="width">Width (m)</Label>
          <Input id="width" type="number" step="0.01" value={form.width}
                 onChange={(e) => update("width", Number(e.target.value))}/>
        </div>

        <div>
          <Label htmlFor="length">Length (m)</Label>
          <Input id="length" type="number" step="0.01" value={form.length}
                 onChange={(e) => update("length", Number(e.target.value))}/>
        </div>

        <div>
          <Label htmlFor="height">Height (m)</Label>
          <Input id="height" type="number" step="0.01" value={form.height}
                 onChange={(e) => update("height", Number(e.target.value))}/>
        </div>

        <div>
          <Label htmlFor="seats">Seats</Label>
          <Input id="seats" type="number" value={form.seats}
                 onChange={(e) => update("seats", Number(e.target.value))}/>
        </div>

        <div className="flex items-end gap-2">
          <Switch id="isDraft" checked={form.isDraft} onCheckedChange={(v) => update("isDraft", v)} />
          <Label htmlFor="isDraft">Draft</Label>
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={5} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
      </div>

      <Separator />

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>
          {mode === "edit" ? "Save changes" : "Create room"}
        </Button>
      </div>
    </div>
  );
}