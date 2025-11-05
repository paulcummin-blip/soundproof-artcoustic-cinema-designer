import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, SlidersHorizontal } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

const SubSettingsPanel = ({ subwoofers, onAdd, onUpdate, onRemove, availableSubwoofers }) => {
  return (
    <Card className="bg-[#FFFFFF] border-[#DCDBD6]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-[#1B1A1A] font-header flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5"/>
            Subwoofer Settings
          </CardTitle>
          <Button size="sm" onClick={onAdd} className="bg-[#213428] hover:bg-[#3E4349] text-white">
            <Plus className="w-4 h-4 mr-2"/>
            Add Sub
          </Button>
        </div>
        <CardDescription className="text-sm text-[#3E4349] font-body">
            Configure each subwoofer in your system.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {subwoofers.length === 0 ? (
          <p className="text-center text-[#3E4349]">No subwoofers added. Click "Add Sub" to begin.</p>
        ) : subwoofers.map(sub => (
          <div key={sub.id} className="p-4 bg-[#F9F8F6] rounded-lg border border-[#DCDBD6] space-y-3">
            <div className="flex items-center justify-between">
                <Label className="font-bold text-[#1B1A1A] flex items-center gap-2">
                    <Checkbox
                        checked={sub.enabled}
                        onCheckedChange={(checked) => onUpdate(sub.id, { enabled: checked })}
                    />
                    Subwoofer Model
                </Label>
                <Button size="icon" variant="ghost" onClick={() => onRemove(sub.id)} className="text-[#4A230F] hover:bg-[#4A230F]/10">
                    <Trash2 className="w-4 h-4"/>
                </Button>
            </div>
            
            <Select 
                value={sub.model?.id || ''} 
                onValueChange={(modelId) => onUpdate(sub.id, { model: availableSubwoofers.find(s => s.id === modelId) })}
            >
              <SelectTrigger className="bg-white border-[#DCDBD6]">
                <SelectValue placeholder="Select a subwoofer model..."/>
              </SelectTrigger>
              <SelectContent className="bg-white border-[#DCDBD6]">
                {availableSubwoofers.map(s => <SelectItem key={s.id} value={s.id}>{s.model}</SelectItem>)}
              </SelectContent>
            </Select>
            
            <div>
              <Label>Phase Adjustment ({sub.phaseAdjust}°)</Label>
              <Slider 
                value={[sub.phaseAdjust]} 
                onValueChange={([val]) => onUpdate(sub.id, { phaseAdjust: val })}
                min={0} max={360} step={1}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default SubSettingsPanel;