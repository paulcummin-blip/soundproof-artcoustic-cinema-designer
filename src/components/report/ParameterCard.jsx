import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import RP22GradingPill from '../ui/RP22GradingPill';

export default function ParameterCard({ parameter, result }) {
    if (!parameter) return null;

    const hasResult = result && typeof result === 'object';
    const level = hasResult ? (result.level || 0) : 0;
    const value = hasResult ? result.value : null;
    const status = hasResult ? result.status : 'unknown';

    const getStatusIcon = () => {
        switch (status) {
            case 'pass': return <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--brand-green)' }} />;
            case 'warning': return <AlertTriangle className="w-4 h-4" style={{ color: 'var(--brand-outline)' }} />;
            case 'fail': return <XCircle className="w-4 h-4" style={{ color: 'var(--brand-red)' }} />;
            default: return <AlertCircle className="w-4 h-4" style={{ color: 'var(--brand-accent)' }} />;
        }
    };

    const formatValue = (val) => {
        if (val === null || val === undefined) return 'N/A';
        if (typeof val === 'number') {
            return parameter.unit ? `${val.toFixed(1)}${parameter.unit}` : val.toFixed(1);
        }
        return String(val);
    };

    return (
        <Card className="border" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--brand-border)' }}>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <CardTitle className="text-sm font-medium" style={{ color: 'var(--brand-ink)', fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}>
                            Parameter {parameter.id}
                        </CardTitle>
                        <p className="text-xs mt-1" style={{ color: 'var(--brand-brown)', fontFamily: 'Didact Gothic, Century Gothic, sans-serif' }}>
                            {parameter.short_name}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {getStatusIcon()}
                        <RP22GradingPill level={level} />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-3" style={{ fontFamily: 'Didact Gothic, Century Gothic, sans-serif' }}>
                    <div className="flex justify-between items-center">
                        <span className="text-xs" style={{ color: 'var(--brand-accent)' }}>Current Value:</span>
                        <Badge variant="outline" className="font-mono text-xs" style={{ backgroundColor: 'var(--brand-sand)', borderColor: 'var(--brand-outline)' }}>
                            {formatValue(value)}
                        </Badge>
                    </div>
                    
                    <div className="text-xs" style={{ color: 'var(--brand-brown)' }}>
                        <div className="mb-1 font-medium" style={{ color: 'var(--brand-accent)' }}>
                            {parameter.name}
                        </div>
                        <p className="leading-relaxed">
                            {parameter.description}
                        </p>
                    </div>

                    {parameter.target_range && (
                        <div className="pt-2 border-t" style={{ borderColor: 'var(--brand-border)' }}>
                            <div className="text-xs" style={{ color: 'var(--brand-accent)' }}>
                                <span className="font-medium">Target: </span>
                                <span style={{ color: 'var(--brand-brown)' }}>{parameter.target_range}</span>
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}