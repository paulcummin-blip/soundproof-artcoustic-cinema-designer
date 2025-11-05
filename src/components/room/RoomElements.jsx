
"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';

export default function RoomElements({ elements = [], onChange }) {
  const addElement = () => {
    const newElement = {
      id: Date.now(),
      type: 'door',
      wall: 'back',
      width: 0.9,
      height: 2.1,
      x_position: 1,
      z_position: 0,
    };
    onChange([...elements, newElement]);
  };

  const updateElement = (id, field, value) => {
    const newElements = elements.map(el => {
      if (el.id === id) {
        const parsedValue = ['width', 'height', 'x_position', 'z_position'].includes(field) ? parseFloat(value) : value;
        return { ...el, [field]: parsedValue };
      }
      return el;
    });
    onChange(newElements);
  };

  const removeElement = (id) => {
    onChange(elements.filter(el => el.id !== id));
  };

  return (
    <div className="space-y-4 font-body">
      <div className="flex justify-end">
        <Button size="sm" onClick={addElement} className="bg-[#213428] hover:bg-[#3E4349] text-white"><Plus className="w-4 h-4 mr-2" />Add</Button>
      </div>
      {elements.length === 0 ? (
        <p className="text-[#3E4349] text-center py-8">No room elements added. Click "Add" to create doors, windows, or built-ins.</p>
      ) : (
        elements.map(element => (
          <div key={element.id} className="brand-border border rounded-lg p-4">
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-medium text-[#1B1A1A] capitalize">{element.type}</h4>
              <button
                type="button"
                className="text-brand-rust px-2 py-1 rounded-md hover-bg-brand-sand"
                onClick={() => removeElement(element.id)}
                aria-label="Remove element"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[#3E4349]">Type</Label>
                <Select value={element.type} onValueChange={(value) => updateElement(element.id, 'type', value)} modal={false}>
                  <SelectTrigger className="bg-white border-[#DCDBD6] text-[#1B1A1A]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent 
                    position="popper" 
                    sideOffset={6}
                    className="z-[70]"
                  >
                    <SelectItem value="door">Door</SelectItem>
                    <SelectItem value="window">Window</SelectItem>
                    <SelectItem value="fireplace">Fireplace</SelectItem>
                    <SelectItem value="built_in">Built-in</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[#3E4349]">Wall</Label>
                <Select value={element.wall} onValueChange={(value) => updateElement(element.id, 'wall', value)} modal={false}>
                  <SelectTrigger className="bg-white border-[#DCDBD6] text-[#1B1A1A]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent 
                    position="popper" 
                    sideOffset={6}
                    className="z-[70]"
                  >
                    <SelectItem value="front">Front</SelectItem>
                    <SelectItem value="back">Back</SelectItem>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[#3E4349]">Width (m)</Label>
                <Input type="number" step="0.1" value={element.width} onChange={(e) => updateElement(element.id, 'width', e.target.value)} className="bg-white border-[#DCDBD6] text-[#1B1A1A]" />
              </div>
              <div>
                <Label className="text-[#3E4349]">Height (m)</Label>
                <Input type="number" step="0.1" value={element.height} onChange={(e) => updateElement(element.id, 'height', e.target.value)} className="bg-white border-[#DCDBD6] text-[#1B1A1A]" />
              </div>
              <div>
                <Label className="text-[#3E4349]">Position (m)</Label>
                <Input type="number" step="0.1" value={element.x_position} onChange={(e) => updateElement(element.id, 'x_position', e.target.value)} className="bg-white border-[#DCDBD6] text-[#1B1A1A]" />
              </div>
              <div>
                <Label className="text-[#3E4349]">Height from floor (m)</Label>
                <Input type="number" step="0.1" value={element.z_position} onChange={(e) => updateElement(element.id, 'z_position', e.target.value)} className="bg-white border-[#DCDBD6] text-[#1B1A1A]" />
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
