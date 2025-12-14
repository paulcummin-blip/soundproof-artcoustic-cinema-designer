export class BassResponseEngine {
    constructor() {
        this.speedOfSound = 343; // m/s
        this.oneThirdOctaveBands = [15.6, 19.7, 24.8, 31.5, 39.4, 49.6, 63.0, 78.7, 99.2, 125.0, 157.5, 198.4];
        this.calculationFrequencies = this.generateFrequencyArray(15, 200, 200);
    }

    generateFrequencyArray(start, end, points) {
        const frequencies = [];
        const logStart = Math.log10(start);
        const logEnd = Math.log10(end);
        const logStep = (logEnd - logStart) / (points - 1);
        for (let i = 0; i < points; i++) {
            frequencies.push(Math.pow(10, logStart + i * logStep));
        }
        return frequencies;
    }

    calculateDistance(pos1, pos2) {
        return Math.sqrt(Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2) + Math.pow(pos1.z - pos2.z, 2));
    }

    calculateBoundaryGain(subPosition, roomDimensions) {
        let gain = 0;
        const proximity = 0.5; // meters for boundary effect
        if (subPosition.x <= proximity) gain += 3;
        if (subPosition.x >= roomDimensions.length - proximity) gain += 3;
        if (subPosition.y <= proximity) gain += 3;
        if (subPosition.y >= roomDimensions.width - proximity) gain += 3;
        if (subPosition.z <= proximity) gain += 3;
        if (subPosition.z >= roomDimensions.height - proximity) gain += 3;
        return Math.min(gain, 12);
    }

    getSubwooferResponse(subwoofer, frequency) {
        // Import subPerformance at runtime to avoid circular deps
        const { subPerformance } = require('@/components/data/subwooferData');
        
        // Lookup sub specs by model ID
        const modelId = typeof subwoofer === 'string' ? subwoofer : subwoofer?.model;
        const specs = modelId ? subPerformance[modelId] : null;
        const sensitivity = specs?.sensitivity_db_1w_1m || subwoofer?.sensitivity || 90;
        
        if (subwoofer && subwoofer.realSplData) {
            const frequencies = Object.keys(subwoofer.realSplData).map(Number).sort((a, b) => a - b);
            let lowerFreq = frequencies[0], upperFreq = frequencies[frequencies.length - 1];
            for (let i = 0; i < frequencies.length - 1; i++) {
                if (frequency >= frequencies[i] && frequency <= frequencies[i + 1]) {
                    lowerFreq = frequencies[i];
                    upperFreq = frequencies[i + 1];
                    break;
                }
            }
            if (lowerFreq === upperFreq) return subwoofer.realSplData[lowerFreq] || sensitivity;
            const lowerSpl = subwoofer.realSplData[lowerFreq];
            const upperSpl = subwoofer.realSplData[upperFreq];
            const ratio = (frequency - lowerFreq) / (upperFreq - lowerFreq);
            return lowerSpl + (upperSpl - lowerSpl) * ratio;
        }
        
        const f3 = specs?.frequency_range_hz?.[0] || subwoofer?.frequency_response_low || 20;
        if (frequency < f3) {
            const rolloff = (f3 - frequency) * 0.08;
            return Math.max(sensitivity - rolloff, sensitivity - 20);
        }
        return sensitivity;
    }

    calculateSchroederFrequency(roomDimensions, rt60 = 0.4) {
        if (!roomDimensions || !roomDimensions.length || !roomDimensions.width || !roomDimensions.height) return 0;
        const volume = roomDimensions.length * roomDimensions.width * roomDimensions.height;
        if (volume === 0) return 0;
        return 2000 * Math.sqrt(rt60 / volume);
    }

    simulateResponseWithExtras(subwoofers, seatPosition, roomDimensions) {
        if (!seatPosition || !roomDimensions) return { responseData: [], rp22Analysis: null };
        const responseData = this.oneThirdOctaveBands.map(frequency => {
            let totalPressure = { re: 0, im: 0 };
            subwoofers.forEach(sub => {
                const enabled = sub.enabled !== false;
                if (!enabled || !sub.model) return;
                
                const distance = this.calculateDistance(sub.position, seatPosition);
                const subResponseSPL = this.getSubwooferResponse(sub, frequency);
                const boundaryGain = this.calculateBoundaryGain(sub.position, roomDimensions);
                const gainAdjust = sub.gainDb || 0;
                const finalSPL = subResponseSPL + boundaryGain + gainAdjust - (20 * Math.log10(Math.max(distance, 0.1)));
                const pressureMagnitude = Math.pow(10, finalSPL / 20);
                const wavelength = this.speedOfSound / frequency;
                const distancePhase = (distance / wavelength) * 2 * Math.PI;
                const userPhase = ((sub.phaseAdjust || 0) * Math.PI) / 180;
                const delayPhase = ((sub.delay || 0) / 1000) * frequency * 2 * Math.PI;
                const polarityPhase = (sub.polarity === -1) ? Math.PI : 0;

                const totalPhase = distancePhase + userPhase + delayPhase + polarityPhase;
                totalPressure.re += pressureMagnitude * Math.cos(totalPhase);
                totalPressure.im += pressureMagnitude * Math.sin(totalPhase);
            });
            const combinedMagnitude = Math.sqrt(totalPressure.re ** 2 + totalPressure.im ** 2);
            const combinedSPL = 20 * Math.log10(combinedMagnitude);
            return { frequency, spl: isFinite(combinedSPL) ? Math.round(combinedSPL * 10) / 10 : 0 };
        });
        const rp22Analysis = this.calculateRP22Analysis(subwoofers, roomDimensions, responseData);
        return { responseData, rp22Analysis };
    }

    calculateRP22Analysis(subwoofers, roomDimensions, responseData) {
        if (!responseData || responseData.length === 0) return { calculatedSPL: 0, rp22Level: 'N/A', factors: {} };
        const activeSubs = subwoofers.filter(sub => sub.enabled && sub.model);
        if(activeSubs.length === 0) return { calculatedSPL: 0, rp22Level: 'N/A', factors: {} };
        
        // For Parameter 14, we need the PEAK SPL, not the average.
        const peakSPL = Math.max(...responseData.map(p => p.spl));

        let rp22Level = 'Below Level 1';
        if (peakSPL >= 123) rp22Level = 'Level 4';
        else if (peakSPL >= 120) rp22Level = 'Level 3';
        else if (peakSPL >= 117) rp22Level = 'Level 2';
        else if (peakSPL >= 114) rp22Level = 'Level 1';
        
        const avgBoundaryGain = activeSubs.reduce((sum, sub) => sum + this.calculateBoundaryGain(sub.position, roomDimensions), 0) / activeSubs.length;
        
        // For Parameter 4, find the seat response variation (gap between peak and trough)
        const troughSPL = Math.min(...responseData.map(p => p.spl));
        const modalVariation = peakSPL - troughSPL;

        return { 
            calculatedSPL: peakSPL, 
            rp22Level, 
            modalVariation,
            factors: { summationGain: 10 * Math.log10(activeSubs.length), boundaryGain: avgBoundaryGain, nullCount: 0 }
        };
    }
}