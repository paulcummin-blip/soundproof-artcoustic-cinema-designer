import React, { useState } from "react";
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

const dolbyConfigs = [
  { value: "5.1", label: "5.1 Surround" },
  { value: "7.1", label: "7.1 Surround" },
  { value: "5.1.2", label: "5.1.2 Atmos" },
  { value: "5.1.4", label: "5.1.4 Atmos" },
  { value: "7.1.2", label: "7.1.2 Atmos" },
  { value: "7.1.4", label: "7.1.4 Atmos" },
  { value: "9.1.2", label: "9.1.2 Atmos" },
  { value: "9.1.4", label: "9.1.4 Atmos" },
  { value: "9.1.6", label: "9.1.6 Atmos" },
  { value: "9.2.4", label: "9.2.4 Atmos" },
  { value: "9.4.2", label: "9.4.2 Atmos" },
  { value: "9.4.4", label: "9.4.4 Atmos" },
  { value: "9.4.6", label: "9.4.6 Atmos" }
];

export default function NewProjectDialog({ open, onOpenChange, onProjectCreated }) {
  const [formData, setFormData] = useState({
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
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const created = await Project.create({
        ...formData,
        room_length: formData.room_length ? parseFloat(formData.room_length) : null,
        room_width: formData.room_width ? parseFloat(formData.room_width) : null,
        room_height: formData.room_height ? parseFloat(formData.room_height) : null,
        amplifier_power: formData.amplifier_power ? parseInt(formData.amplifier_power) : null,
      });
      setFormData({
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
      });
      // Pass created project to parent for session hydration
      onProjectCreated && onProjectCreated(created);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to create project:", error);
      alert("Failed to create project. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-[#DCDBD6] text-[#1B1A1A] max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold font-header">Create New Cinema Project</DialogTitle>
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
                  <SelectItem value="99" className="text-[#1B1A1A]">99 dB (Level 1 Minimum)</SelectItem>
                  <SelectItem value="102" className="text-[#1B1A1A]">102 dB (Level 2 Minimum)</SelectItem>
                  <SelectItem value="105" className="text-[#1B1A1A]">105 dB (Level 3 Minimum)</SelectItem>
                  <SelectItem value="108" className="text-[#1B1A1A]">108 dB (Level 4 Minimum)</SelectItem>
                  <SelectItem value="111" className="text-[#1B1A1A]">111 dB (Level 4 Recommended)</SelectItem>
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

          <div className="flex justify-end gap-3">
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
              className="bg-[#1B1A1A] hover:bg-[#3E4349] text-white"
              disabled={!formData.name}
            >
              Create Project
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}