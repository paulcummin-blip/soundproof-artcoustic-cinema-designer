import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Project } from "@/entities/Project";

export const dolbyConfigs = [
  { value: "5.1", label: "5.1 Surround — P2 - L1" },
  { value: "7.1", label: "7.1 Surround — P2 - L1" },
  { value: "5.1.2", label: "5.1.2 Atmos — P2 - L1" },
  { value: "5.1.4", label: "5.1.4 Atmos — P2 - L1" },
  { value: "5.1.6", label: "5.1.6 Atmos — P2 - L2" },
  { value: "7.1.2", label: "7.1.2 Atmos — P2 - L1" },
  { value: "7.1.4", label: "7.1.4 Atmos — P2 - L2" },
  { value: "7.1.6", label: "7.1.6 Atmos — P2 - L2" },
  { value: "9.1.2", label: "9.1.2 Atmos — P2 - L2" },
  { value: "9.1.4", label: "9.1.4 Atmos — P2 - L2" },
  { value: "9.1.6", label: "9.1.6 Atmos — P2 - L4" },
];

export const splLabels = {
  "99_min":  "99 dB — P12 - L1 Minimum",
  "102_min": "102 dB — P12 - L2 Minimum",
  "105_min": "105 dB — P12 - L3 Minimum",
  "108_min": "108 dB — P12 - L4 Minimum",
  "102_rec": "102 dB — P12 - L1 Recommended",
  "105_rec": "105 dB — P12 - L2 Recommended",
  "108_rec": "108 dB — P12 - L3 Recommended",
  "111_rec": "111 dB — P12 - L4 Recommended",
};

// SPL select options in order (value must be unique per <option>, so we use compound keys)
export const splOptions = [
  { value: "99",  label: "99 dB — P12 - L1 Minimum" },
  { value: "102", label: "102 dB — P12 - L2 Minimum" },
  { value: "105", label: "105 dB — P12 - L3 Minimum" },
  { value: "108", label: "108 dB — P12 - L4 Minimum" },
  { value: "102", label: "102 dB — P12 - L1 Recommended" },
  { value: "105", label: "105 dB — P12 - L2 Recommended" },
  { value: "108", label: "108 dB — P12 - L3 Recommended" },
  { value: "111", label: "111 dB — P12 - L4 Recommended" },
];

const EMPTY_FORM = {
  name: "",
  client_name: "",
  project_status: "Prospective",
  room_length: "",
  room_width: "",
  room_height: "",
  dolby_config: "",
  target_spl: 105,
  amplifier_power: "",
  notes: ""
};

// editProject: if provided, the dialog operates in edit mode
export default function NewProjectDialog({ open, onOpenChange, onProjectCreated, onProjectUpdated, editProject }) {
  const isEditMode = !!editProject;

  const [formData, setFormData] = useState(EMPTY_FORM);

  // When editProject changes (opening edit mode), pre-fill the form
  useEffect(() => {
    if (editProject) {
      setFormData({
        name: editProject.name || "",
        client_name: editProject.client_name || editProject.client || "",
        project_status: editProject.project_status || editProject.status || "Prospective",
        room_length: editProject.room_length != null ? String(editProject.room_length) : "",
        room_width: editProject.room_width != null ? String(editProject.room_width) : "",
        room_height: editProject.room_height != null ? String(editProject.room_height) : "",
        dolby_config: editProject.dolby_config || "",
        target_spl: editProject.target_spl != null ? editProject.target_spl : 105,
        amplifier_power: editProject.amplifier_power != null ? String(editProject.amplifier_power) : "",
        notes: editProject.notes || "",
      });
    } else {
      setFormData(EMPTY_FORM);
    }
  }, [editProject, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      room_length: formData.room_length ? parseFloat(formData.room_length) : null,
      room_width: formData.room_width ? parseFloat(formData.room_width) : null,
      room_height: formData.room_height ? parseFloat(formData.room_height) : null,
      amplifier_power: formData.amplifier_power ? parseInt(formData.amplifier_power) : null,
    };
    try {
      if (isEditMode) {
        const updated = await Project.update(editProject.id, payload);
        onProjectUpdated && onProjectUpdated(updated);
        onOpenChange(false);
      } else {
        const created = await Project.create(payload);
        setFormData(EMPTY_FORM);
        onProjectCreated && onProjectCreated(created);
        onOpenChange(false);
      }
    } catch (error) {
      console.error("Failed to save project:", error);
      alert("Failed to save project. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-[#DCDBD6] text-[#1B1A1A] max-w-2xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold font-header">
            {isEditMode ? "Edit Cinema Project" : "Create New Cinema Project"}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6 font-body">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label className="text-[#3E4349]">Project Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                placeholder="e.g. Johnson Family Cinema"
                required
              />
            </div>
            
            <div>
              <Label className="text-[#3E4349]">Client Name</Label>
              <Input
                value={formData.client_name}
                onChange={(e) => setFormData({...formData, client_name: e.target.value})}
                className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                placeholder="Client name"
              />
            </div>

            <div>
              <Label className="text-[#3E4349]">Project Status</Label>
              <Select
                value={formData.project_status}
                onValueChange={(value) => setFormData({...formData, project_status: value})}
              >
                <SelectTrigger className="bg-white border-[#DCDBD6] text-[#1B1A1A]">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="bg-white border-[#DCDBD6]">
                  <SelectItem value="Prospective" className="text-[#1B1A1A]">Prospective</SelectItem>
                  <SelectItem value="Live" className="text-[#1B1A1A]">Live</SelectItem>
                  <SelectItem value="Completed" className="text-[#1B1A1A]">Completed</SelectItem>
                  <SelectItem value="Lost" className="text-[#1B1A1A]">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[#3E4349]">Dolby Configuration</Label>
              <Select 
                value={formData.dolby_config} 
                onValueChange={(value) => setFormData({...formData, dolby_config: value})}
              >
                <SelectTrigger className="bg-white border-[#DCDBD6] text-[#1B1A1A]">
                  <SelectValue placeholder="Select Dolby config" />
                </SelectTrigger>
                <SelectContent className="bg-white border-[#DCDBD6]">
                  {dolbyConfigs.map((config) => (
                    <SelectItem key={config.value} value={config.value} className="text-[#1B1A1A]">
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[#3E4349]">Room Length (m)</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.room_length}
                onChange={(e) => setFormData({...formData, room_length: e.target.value})}
                className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
              />
            </div>

            <div>
              <Label className="text-[#3E4349]">Room Width (m)</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.room_width}
                onChange={(e) => setFormData({...formData, room_width: e.target.value})}
                className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
              />
            </div>

            <div>
              <Label className="text-[#3E4349]">Room Height (m)</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.room_height}
                onChange={(e) => setFormData({...formData, room_height: e.target.value})}
                className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
              />
            </div>

            <div>
              <Label className="text-[#3E4349]">Target SPL (dB) LCR</Label>
              <Select 
                value={formData.target_spl.toString()} 
                onValueChange={(value) => setFormData({...formData, target_spl: parseInt(value)})}
              >
                <SelectTrigger className="bg-white border-[#DCDBD6] text-[#1B1A1A]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-[#DCDBD6]">
                  {splOptions.map((opt, i) => (
                    <SelectItem key={`${opt.value}_${i}`} value={opt.value} className="text-[#1B1A1A]">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Label className="text-[#3E4349]">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                className="bg-white border-[#DCDBD6] text-[#1B1A1A] h-24"
                placeholder="Project requirements, special considerations..."
              />
            </div>
          </div>

          <div className="flex w-full shrink-0 justify-end gap-3 pt-4 pb-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              className="border-[#DCDBD6] text-[#3E4349]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!formData.name}
              className="hover:bg-[#3E4349]"
              style={{ backgroundColor: "#1B1A1A", color: "#FFFFFF" }}
            >
              Create Project
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}