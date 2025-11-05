import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import RP22GradingPill from '../ui/RP22GradingPill';

export default function SpeakerSelector({ speaker, onSelectModel }) {
    if (!speaker) return null;

    const { role, model, availableModels, analysis } = speaker;
    const selectedValue = model ? model.model : 'none';

    return (
        <div className="grid grid-cols-3 items-center gap-4 p-3 bg-[#F8F8F7] rounded-lg border border-[#DCDBD6]">
            <div className="col-span-1">
                <Label className="font-bold text-[#1B1A1A] text-sm font-header">{role}</Label>
                {analysis && (
                    <div className="flex items-center gap-2 mt-1">
                        <RP22GradingPill grade={analysis.splGrade} />
                        <span className="text-xs text-[#3E4349]">{analysis.predictedMaxSPL} dB</span>
                    </div>
                )}
            </div>
            <div className="col-span-2">
                <Select value={selectedValue} onValueChange={(val) => onSelectModel(val === 'none' ? null : val)}>
                    <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Select a speaker..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {(availableModels || []).map(m => (
                            <SelectItem key={m.id} value={m.model}>
                                {m.model} ({m.max_spl}dB)
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}