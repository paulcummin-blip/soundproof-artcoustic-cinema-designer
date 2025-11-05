
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { SlidersHorizontal } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const SubwooferControl = ({ sub, onUpdate }) => (
    <div className="space-y-3 p-3 border border-gray-200 rounded-md">
        <div className="flex items-center space-x-2">
            <Checkbox
                id={`enable-${sub.id}`}
                checked={sub.enabled !== false} // Default to true if undefined
                onCheckedChange={(checked) => onUpdate(sub.id, { enabled: checked })}
            />
            <Label htmlFor={`enable-${sub.id}`} className="font-medium text-[#1B1A1A] text-sm">
                {sub.id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </Label>
        </div>
        <div className="grid grid-cols-2 gap-4">
            <div>
                <Label className="text-xs text-[#3E4349]" htmlFor={`delay-${sub.id}`}>Delay (ms)</Label>
                <Input
                    id={`delay-${sub.id}`}
                    type="number"
                    value={sub.delay || 0}
                    onChange={(e) => onUpdate(sub.id, { delay: parseFloat(e.target.value) || 0 })}
                    className="bg-white border-[#DCDBD6] text-xs h-8"
                    disabled={sub.enabled === false}
                />
            </div>
            <div>
                <Label className="text-xs text-[#3E4349]" htmlFor={`phase-${sub.id}`}>Phase (°)</Label>
                <Input
                    id={`phase-${sub.id}`}
                    type="number"
                    value={sub.phaseAdjust || 0}
                    onChange={(e) => onUpdate(sub.id, { phaseAdjust: parseFloat(e.target.value) || 0 })}
                    className="bg-white border-[#DCDBD6] text-xs h-8"
                    disabled={sub.enabled === false}
                />
            </div>
        </div>
    </div>
);

export default function SubSettingsPanel({ subwoofers = [], onUpdate }) {
    const groupedSubs = React.useMemo(() => {
        return subwoofers.reduce((acc, sub) => {
            const group = sub.placement || 'custom';
            if (!acc[group]) {
                acc[group] = [];
            }
            acc[group].push(sub);
            return acc;
        }, {});
    }, [subwoofers]);
    
    if (subwoofers.length === 0) {
        return (
             <Card className="bg-[#FFFFFF] border-[#DCDBD6] relative overflow-hidden">
                <CardHeader>
                    <CardTitle className="text-[#1B1A1A] font-header flex items-center gap-2">
                        <SlidersHorizontal className="w-5 h-5" /> Subwoofer Settings
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-[#3E4349] text-center py-4">No subwoofers configured.</p>
                </CardContent>
                <img
                    src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/c0d2feeed_Artcoustic-logo_dark-grey-icon_TRANSPARENT_BACKGROUND.png"
                    alt="Artcoustic Watermark"
                    className="absolute bottom-3 right-3 w-16 h-16 opacity-[0.12] pointer-events-none"
                />
            </Card>
        )
    }

    return (
        <Card className="bg-[#FFFFFF] border-[#DCDBD6] relative overflow-hidden">
            <CardHeader>
                <CardTitle className="text-[#1B1A1A] font-header flex items-center gap-2">
                    <SlidersHorizontal className="w-5 h-5" /> Individual Subwoofer Settings
                </CardTitle>
                 <CardDescription className="text-sm text-[#3E4349] font-body">Fine-tune delay and phase for each subwoofer.</CardDescription>
            </CardHeader>
            <CardContent>
                <Accordion type="multiple" defaultValue={Object.keys(groupedSubs)} className="w-full">
                    {Object.entries(groupedSubs).map(([groupName, subs]) => (
                        <AccordionItem value={groupName} key={groupName}>
                            <AccordionTrigger className="text-base font-header capitalize">
                                {groupName} Subwoofers ({subs.length})
                            </AccordionTrigger>
                            <AccordionContent className="space-y-4 pt-2">
                                {subs.map(sub => (
                                    <SubwooferControl key={sub.id} sub={sub} onUpdate={onUpdate} />
                                ))}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            </CardContent>
            <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/c0d2feeed_Artcoustic-logo_dark-grey-icon_TRANSPARENT_BACKGROUND.png"
                alt="Artcoustic Watermark"
                className="absolute bottom-3 right-3 w-16 h-16 opacity-[0.12] pointer-events-none"
            />
        </Card>
    );
}
