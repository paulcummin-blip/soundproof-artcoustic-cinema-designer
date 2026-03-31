// BassResponse.jsx - Simplified bass simulation UI

import React, { useMemo, useEffect, useState, useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppState } from "../AppStateProvider";
import BassGraph from "@/components/room/bass/BassGraph";
import { simulateBassAtSeats } from "@/components/bass/bassSimulationEngine";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";
import { getSubwooferCurve } from "@/components/models/speakers/registry";
import SubTuningControls from "@/components/room/bass/SubTuningControls";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function BassResponse({ frontSubsCfg, rearSubsCfg, subWarnings, frontSubsLive, rearSubsLive }) {
  const { seatingPositions, roomDims, splConfig, setFrontSubsCfg, setRearSubsCfg, autosaveMeta, restoreAutosave, clearAutosave } = useAppState();
  const hasNoSeats = !Array.isArray(seatingPositions) || seatingPositions.length === 0;
  const totalSubCount = (frontSubsCfg?.count || 0) + (rearSubsCfg?.count || 0);
  const hasNoSubs = totalSubCount === 0;

  // Safe number conversion and formatting
  const toNum = (v) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const fmtFixed = (v, digits = 1, fallback = "—") => {
    const n = toNum(v);
    return n === null ? fallback : n.toFixed(digits);
  };

  const dimsTxt = `${fmtFixed(roomDims?.widthM, 1)}×${fmtFixed(roomDims?.lengthM, 1)}×${fmtFixed(roomDims?.heightM, 1)} m`;

  // --- Seat colour palette (stable, ordered, brand-aligned) ---
  const SEAT_PALETTE = ["#213428", "#625143", "#8B7F76", "#A67C52", "#6B8A8F", "#7E8B6F"];

  // Build a stable ordered seat list so palette indices are deterministic
  const orderedSeats = useMemo(() => {
    if (!Array.isArray(seatingPositions)) return [];
    return [...seatingPositions].sort((a, b) => {
      const ra = Number(a?.row || a?.rowNumber) || 1;
      const rb = Number(b?.row || b?.rowNumber) || 1;
      if (ra !== rb) return ra - rb;
      // Use indexInRow only if both seats have a valid (non-zero) value
      const ia = Number(a?.indexInRow);
      const ib = Number(b?.indexInRow);
      const bothHaveIndex = Number.isFinite(ia) && ia > 0 && Number.isFinite(ib) && ib > 0;
      if (bothHaveIndex) return ia - ib;
      // Fall back to physical x position (left → right)
      return (Number(a?.x) || 0) - (Number(b?.x) || 0);
    });
  }, [seatingPositions]);

  const getSeatColor = (seatId) => {
    const idx = orderedSeats.findIndex(s => (s.id || `${s.x}-${s.y}`) === seatId);
    return SEAT_PALETTE[Math.max(0, idx) % SEAT_PALETTE.length];
  };

  // --- Multi-seat selection state ---
  const resolveFallbackIds = (seats) => {
    const primary = seats?.find(s => s.isPrimary);
    if (primary) return [primary.id || `${primary.x}-${primary.y}`];
    const first = seats?.[0];
    if (first) return [first.id || `${first.x}-${first.y}`];
    return [];
  };

  const [selectedSeatIds, setSelectedSeatIds] = useState(() => resolveFallbackIds(seatingPositions));

  // Keep selectedSeatIds valid when seats change
  useEffect(() => {
    const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
    const allIds = new Set(seats.map(s => s.id || `${s.x}-${s.y}`));
    const still = selectedSeatIds.filter(id => allIds.has(id));
    if (still.length === 0) {
      setSelectedSeatIds(resolveFallbackIds(seats));
    } else if (still.length !== selectedSeatIds.length) {
      setSelectedSeatIds(still);
    }
  }, [seatingPositions]);

  const toggleSeat = (sid) => {
    setSelectedSeatIds(prev => {
      if (prev.includes(sid)) {
        // Don't allow deselecting the last active seat
        return prev.length === 1 ? prev : prev.filter(id => id !== sid);
      }
      return [...prev, sid];
    });
  };

  // State declarations
  const [autoAlignEnabled, setAutoAlignEnabled] = useState(true);
  const [tryPolarity, setTryPolarity] = useState(false);
  const [hasAutoAlignedFront, setHasAutoAlignedFront] = useState(false);
  const [hasAutoAlignedRear, setHasAutoAlignedRear] = useState(false);
  const [absorptionPct, setAbsorptionPct] = useState(30);
  const [roomDamping, setRoomDamping] = useState(20);
  const [useRewCoreTestMode, setUseRewCoreTestMode] = useState(false);
  const [isDraggingSub, setIsDraggingSub] = useState(false);
  const lastStablePlotRef = useRef(null);

  // Auto-align loop guards
  const frontCfgRef = React.useRef(null);
  const rearCfgRef = React.useRef(null);
  const roomDimsRef = React.useRef(null);
  const seatingRef = React.useRef(null);
  const lastAutoAlignApplySigRef = React.useRef({ Front: null, Rear: null });
  const lastAutoAlignTriggerSigRef = React.useRef(null);

  const __b44SafeSig = (v) => {
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  };

  const __b44SettingsSig = (settingsById, ids) => {
    const obj = {};
    (ids || []).forEach((id) => {
      const s = settingsById?.[id] || {};
      obj[id] = {
        gainDb: Number.isFinite(s.gainDb) ? Math.round(s.gainDb * 10) / 10 : 0,
        delayMs: Number.isFinite(s.delayMs) ? Math.round(s.delayMs * 1000) / 1000 : 0,
        polarity: s.polarity || "normal",
      };
    });
    return __b44SafeSig(obj);
  };

  // Convert absorption % to coefficient
  const absorptionCoeff = Math.max(0, Math.min(1, absorptionPct / 100));
  const surfaceAbsorption = {
    front: absorptionCoeff,
    back: absorptionCoeff,
    left: absorptionCoeff,
    right: absorptionCoeff,
    ceiling: absorptionCoeff,
    floor: absorptionCoeff
  };

  // Keep refs current
  React.useEffect(() => { frontCfgRef.current = frontSubsCfg; }, [frontSubsCfg]);
  React.useEffect(() => { rearCfgRef.current = rearSubsCfg; }, [rearSubsCfg]);
  React.useEffect(() => { roomDimsRef.current = roomDims; }, [roomDims]);
  React.useEffect(() => { seatingRef.current = seatingPositions; }, [seatingPositions]);

  // Build subs array for simulation
  const subsForSimulation = useMemo(() => {
    const liveFront = Array.isArray(frontSubsLive) ? frontSubsLive : [];
    const liveRear = Array.isArray(rearSubsLive) ? rearSubsLive : [];

    const getTuning = (subId, cfg) => {
      const settings = cfg?.settingsById?.[subId] || {};
      return {
        gainDb: settings.gainDb || 0,
        delayMs: settings.delayMs || 0,
        polarity: settings.polarity === 'invert' ? 180 : 0
      };
    };

    const toSource = (s, group, idx, cfg) => {
      const p = s?.position ?? s;
      const x = Number(p?.x);
      const y = Number(p?.y);
      const z = p?.z;

      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

      const subId = s?.id ?? `${group}-sub-${idx}`;
      const tuning = getTuning(subId, cfg);

      return {
        id: subId,
        modelKey: s?.model ?? "SUB2-12",
        x, y,
        z: Number.isFinite(Number(z)) ? Number(z) : 0.35,
        tuning,
      };
    };

    const sources = [
      ...liveFront.map((s, i) => toSource(s, "front", i, frontSubsCfg)),
      ...liveRear.map((s, i) => toSource(s, "rear", i, rearSubsCfg)),
    ].filter(Boolean);

    return sources;
  }, [frontSubsLive, rearSubsLive, frontSubsCfg?.settingsById, rearSubsCfg?.settingsById]);

  // Run bass simulation engine
  const simulationResults = useMemo(() => {
    if (hasNoSeats || hasNoSubs || !roomDims?.widthM || !roomDims?.lengthM || !roomDims?.heightM) {
      return { seatResponses: {}, metrics: null, audit: null };
    }

    if (!useRewCoreTestMode) {
      return simulateBassAtSeats({
        roomDims: {
          widthM: roomDims.widthM,
          lengthM: roomDims.lengthM,
          heightM: roomDims.heightM
        },
        seats: seatingPositions,
        subs: subsForSimulation,
        splConfig: {
          globalPowerW: splConfig?.globalPowerW ?? 100,
          globalEqHeadroomDb: splConfig?.globalEqHeadroomDb ?? 0,
          radiationMode: splConfig?.radiationMode ?? 'half-space',
          modesEnabled: true,
          roomDamping,
          sbirEnabled: true
        },
        options: {}
      });
    }

    const seatResponses = {};
    // __B44_STEP_DEBUG__ temporary — remove after diagnosis
    let __b44StepDebugCapture = null;
    const mlpSeatForDebug = seatingPositions.find(s => s.isPrimary) || seatingPositions[0];
    const firstSubForDebug = subsForSimulation[0];

    seatingPositions.forEach((seat) => {
      const seatId = seat.id || `${seat.x}-${seat.y}`;
      let sumRe = null;
      let sumIm = null;
      let freqsHz = null;

      subsForSimulation.forEach((sub) => {
        const subCurve = getSubwooferCurve(sub.modelKey);
        if (!subCurve || subCurve.length === 0) return;

        const rewResult = simulateBassResponseRewCore(
          {
            widthM: roomDims.widthM,
            lengthM: roomDims.lengthM,
            heightM: roomDims.heightM,
          },
          {
            x: seat.x,
            y: seat.y,
            z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2,
          },
          sub,
          subCurve,
          {
            enableReflections: true,
            enableModes: true,
            surfaceAbsorption,
            freqMinHz: 20,
            freqMaxHz: 200,
            smoothing: 'none',
          }
        );

        // __B44_STEP_DEBUG__ temporary — capture for MLP seat + first sub only
        if (
          __b44StepDebugCapture === null &&
          mlpSeatForDebug && firstSubForDebug &&
          seat === mlpSeatForDebug && sub === firstSubForDebug &&
          rewResult.stepDebug?.length > 0
        ) {
          __b44StepDebugCapture = rewResult.stepDebug;
        }

        if (!freqsHz) {
          freqsHz = rewResult.freqsHz;
          sumRe = rewResult.complexPressure.map(cp => cp.re);
          sumIm = rewResult.complexPressure.map(cp => cp.im);
        } else {
          rewResult.complexPressure.forEach((cp, index) => {
            if (Number.isFinite(cp.re) && Number.isFinite(cp.im)) {
              sumRe[index] += cp.re;
              sumIm[index] += cp.im;
            }
          });
        }
      });

      if (freqsHz && sumRe && sumIm) {
        seatResponses[seatId] = {
          freqsHz,
          splDb: sumRe.map((re, index) => {
            const im = sumIm[index];
            const magnitude = Math.sqrt(re * re + im * im);
            return 20 * Math.log10(Math.max(magnitude, 1e-10));
          }),
          nulls: { count: 0, worstDb: 0, nulls: [] },
        };
      }
    });

    return {
      seatResponses,
      metrics: null,
      audit: null,
      stepDebug: __b44StepDebugCapture, // __B44_STEP_DEBUG__ temporary — remove after diagnosis
    };
  }, [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM, seatingPositions, subsForSimulation, splConfig, roomDamping, hasNoSeats, hasNoSubs, useRewCoreTestMode, absorptionPct]);

  // Build one clean series per selected seat
  const multiSeries = useMemo(() => {
    const responses = simulationResults.seatResponses;
    const activeIds = selectedSeatIds.filter(id => responses[id]);

    const series = activeIds.map(sid => {
      const response = responses[sid];
      if (!response?.freqsHz || !response?.splDb) return null;

      const raw = response.freqsHz
        .map((frequency, i) => ({
          frequency,
          spl: Number.isFinite(response.splDb[i]) ? response.splDb[i] : null,
        }))
        .filter(p => Number.isFinite(p.frequency) && p.frequency > 0);

      const sorted = [...raw].sort((a, b) => a.frequency - b.frequency);
      const deduped = [];
      for (let i = 0; i < sorted.length; i++) {
        const curr = sorted[i];
        const next = sorted[i + 1];
        if (next && Math.abs(curr.frequency - next.frequency) < 1e-9) continue;
        deduped.push(curr);
      }

      return { id: sid, color: getSeatColor(sid), data: deduped };
    }).filter(Boolean);

    if (!isDraggingSub && series.length > 0 && series[0].data.length > 0) {
      lastStablePlotRef.current = series[0].data;
    }

    return series;
  }, [selectedSeatIds, simulationResults.seatResponses, orderedSeats, isDraggingSub]);

  // Keep a single-seat "selectedSeat" reference for the graph title + per-seat detail cards
  const primarySelectedSeat = useMemo(() => {
    const responses = simulationResults.seatResponses;
    const sid = selectedSeatIds[0];
    if (sid && responses[sid]) {
      const seatMeta = seatingPositions?.find(s => (s.id || `${s.x}-${s.y}`) === sid);
      return { id: sid, isPrimary: !!seatMeta?.isPrimary };
    }
    return null;
  }, [selectedSeatIds, seatingPositions, simulationResults.seatResponses]);

  // Schroeder frequency
  const schroederFrequency = React.useMemo(() => {
    const w = roomDims?.widthM ?? 0;
    const l = roomDims?.lengthM ?? 0;
    const h = roomDims?.heightM ?? 0;
    if (!(w > 0 && l > 0 && h > 0)) return 0;
    const volume = w * l * h;
    const rt60 = 0.4;
    return 2000 * Math.sqrt(rt60 / volume);
  }, [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM]);

  const rp22Levels = React.useMemo(() => ([
    { level: "L1", spl: 114, color: "#C1B6AD" },
    { level: "L2", spl: 117, color: "#8B7F76" },
    { level: "L3", spl: 120, color: "#625143" },
    { level: "L4", spl: 123, color: "#213428" },
  ]), []);

  // Compute geometric distances
  const subDistances = useMemo(() => {
    const mlpSeat = seatingPositions?.find(s => s.isPrimary);
    if (!mlpSeat) return {};
    
    const mlpPoint = { x: mlpSeat.x, y: mlpSeat.y, z: mlpSeat.z ?? 1.2 };
    const SPEED_OF_SOUND = 343;
    const distances = {};
    
    const frontCount = frontSubsCfg?.count || 0;
    const frontPositions = frontSubsCfg?.positions || [];
    if (frontCount > 0) {
      const roomWidth = roomDims?.widthM || 4.5;
      const defaultFrontPos = [
        { x: roomWidth * 0.33, y: 0.15 },
        { x: roomWidth * 0.67, y: 0.15 }
      ];
      const frontIds = frontCount === 1 ? ['front-sub-left'] : ['front-sub-left', 'front-sub-right'];
      frontIds.forEach((id, i) => {
        const pos = frontPositions[i] || defaultFrontPos[i];
        const dx = pos.x - mlpPoint.x;
        const dy = pos.y - mlpPoint.y;
        const dz = 0.35 - mlpPoint.z;
        const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
        distances[id] = {
          distanceM: distance,
          timeMs: (distance / SPEED_OF_SOUND) * 1000
        };
      });
    }
    
    const rearCount = rearSubsCfg?.count || 0;
    const rearPositions = rearSubsCfg?.positions || [];
    if (rearCount > 0) {
      const roomWidth = roomDims?.widthM || 4.5;
      const roomLength = roomDims?.lengthM || 6.0;
      const defaultRearPos = [
        { x: roomWidth * 0.33, y: roomLength - 0.15 },
        { x: roomWidth * 0.67, y: roomLength - 0.15 }
      ];
      const rearIds = rearCount === 1 ? ['rear-sub-left'] : ['rear-sub-left', 'rear-sub-right'];
      rearIds.forEach((id, i) => {
        const pos = rearPositions[i] || defaultRearPos[i];
        const dx = pos.x - mlpPoint.x;
        const dy = pos.y - mlpPoint.y;
        const dz = 0.35 - mlpPoint.z;
        const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
        distances[id] = {
          distanceM: distance,
          timeMs: (distance / SPEED_OF_SOUND) * 1000
        };
      });
    }
    
    return distances;
  }, [seatingPositions, frontSubsCfg, rearSubsCfg, roomDims]);

  // Auto-align function
  const autoAlignSubs = React.useCallback((groupLabel) => {
    if (!autoAlignEnabled) return;

    const seatingPositionsNow = seatingRef.current;
    const roomDimsNow = roomDimsRef.current;
    const mlpSeat = seatingPositionsNow?.find(s => s.isPrimary) || seatingPositionsNow?.[0];
    if (!mlpSeat) return;

    const mlpPoint = { x: mlpSeat.x, y: mlpSeat.y, z: mlpSeat.z ?? 1.2 };
    const SPEED_OF_SOUND = 343;
    const isRear = groupLabel === "Rear";
    const cfg = isRear ? rearCfgRef.current : frontCfgRef.current;
    const count = cfg?.count || 0;
    if (count === 0) return;

    const positions = Array.isArray(cfg?.positions) ? cfg.positions : [];
    const settingsById = cfg?.settingsById || {};
    const prefix = groupLabel.toLowerCase();
    const subIds = count === 1 ? [`${prefix}-sub-left`] : [`${prefix}-sub-left`, `${prefix}-sub-right`];

    const roomWidth = Number(roomDimsNow?.widthM) || 4.5;
    const roomLength = Number(roomDimsNow?.lengthM) || 6.0;

    const defaultPositions = isRear
      ? [{ x: roomWidth * 0.33, y: roomLength - 0.15 }, { x: roomWidth * 0.67, y: roomLength - 0.15 }]
      : [{ x: roomWidth * 0.33, y: 0.15 }, { x: roomWidth * 0.67, y: 0.15 }];

    const subData = subIds.map((subId, i) => {
      const pos = positions[i] || defaultPositions[i] || { x: roomWidth / 2, y: isRear ? roomLength - 0.15 : 0.15 };
      const dx = pos.x - mlpPoint.x;
      const dy = pos.y - mlpPoint.y;
      const dz = 0.35 - mlpPoint.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const arrivalTime = distance / SPEED_OF_SOUND;
      return { subId, arrivalTime, pos };
    });

    const minArrival = Math.min(...subData.map(s => s.arrivalTime));
    const newSettings = { ...settingsById };
    subData.forEach(({ subId, arrivalTime }) => {
      const delayMs = Math.max(0, Math.min(30, (arrivalTime - minArrival) * 1000));
      newSettings[subId] = {
        ...newSettings[subId],
        gainDb: newSettings[subId]?.gainDb ?? 0,
        polarity: newSettings[subId]?.polarity ?? "normal",
        delayMs
      };
    });

    const prevSig = lastAutoAlignApplySigRef.current?.[groupLabel] || null;
    const nextSig = __b44SettingsSig(newSettings, subIds);
    if (prevSig === nextSig) return;
    lastAutoAlignApplySigRef.current = {
      ...(lastAutoAlignApplySigRef.current || {}),
      [groupLabel]: nextSig
    };

    if (isRear) {
      setRearSubsCfg(prev => ({ ...prev, settingsById: newSettings }));
    } else {
      setFrontSubsCfg(prev => ({ ...prev, settingsById: newSettings }));
    }
  }, [autoAlignEnabled, tryPolarity, setFrontSubsCfg, setRearSubsCfg]);

  // Auto-align effects
  useEffect(() => {
    if (!autoAlignEnabled) return;
    const frontCount = frontSubsCfg?.count || 0;
    if (frontCount > 0 && !hasAutoAlignedFront) {
      autoAlignSubs('Front');
      setHasAutoAlignedFront(true);
    } else if (frontCount === 0) {
      setHasAutoAlignedFront(false);
    }
  }, [autoAlignEnabled, frontSubsCfg?.count, hasAutoAlignedFront, autoAlignSubs]);

  useEffect(() => {
    if (!autoAlignEnabled) return;
    const rearCount = rearSubsCfg?.count || 0;
    if (rearCount > 0 && !hasAutoAlignedRear) {
      autoAlignSubs('Rear');
      setHasAutoAlignedRear(true);
    } else if (rearCount === 0) {
      setHasAutoAlignedRear(false);
    }
  }, [autoAlignEnabled, rearSubsCfg?.count, hasAutoAlignedRear, autoAlignSubs]);

  // Expose drag state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__B44_setIsDraggingSub = (dragging) => setIsDraggingSub(dragging);
    }
  }, []);

  return (
    <div className="space-y-4" style={{ fontFamily: 'Didact Gothic, Century Gothic, sans-serif' }}>

      {(hasNoSeats || hasNoSubs) && (
        <Alert className="border border-[#DCDBD6] bg-[#F8F8F7] text-[#3E4349]">
          <AlertDescription className="text-sm">
            {hasNoSeats && <>No seating found. Go to <strong>Layout → Seating</strong> and generate at least one row.</>}
            {hasNoSeats && hasNoSubs && <><br/></>}
            {hasNoSubs && <>No subwoofers found. Add one in <strong>Speakers</strong> (front corner is fine to start).</>}
          </AlertDescription>
        </Alert>
      )}

      {/* Fairness Summary */}
      {simulationResults.metrics?.fairness && (
        <div className="rounded-lg border border-[#213428] bg-[#213428]/5 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-bold text-[#213428]">Designer Metrics</div>
            <div className="text-2xl font-bold text-[#213428]">
              {simulationResults.metrics.fairness.score}/100
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-[#3E4349]">Best↔Worst:</span>
              <span className="ml-1 font-medium text-[#1B1A1A]">
                {fmtFixed(simulationResults.metrics.fairness.spreadBestWorstDb, 1)} dB
              </span>
            </div>
            <div>
              <span className="text-[#3E4349]">Worst Null:</span>
              <span className="ml-1 font-medium text-[#1B1A1A]">
                {fmtFixed(simulationResults.metrics.fairness.nulls.worstNullDb, 1)} dB
              </span>
            </div>
          </div>
          {simulationResults.metrics.fairness.nulls.worstSeatId && (
            <div className="text-xs text-[#3E4349] mt-2">
              @ Seat {simulationResults.metrics.fairness.nulls.worstSeatId}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge className="bg-[#F8F8F7] text-[#1B1A1A] border-[#DCDBD6]">Room: {dimsTxt}</Badge>
        <Badge className="bg-[#F8F8F7] text-[#1B1A1A] border-[#DCDBD6]">Subs: {totalSubCount}</Badge>
        <Badge className="bg-[#F8F8F7] text-[#1B1A1A] border-[#DCDBD6]">Seats: {seatingPositions?.length ?? 0}</Badge>
        <Badge className={useRewCoreTestMode ? "bg-[#213428] text-white border-[#213428]" : "bg-[#F8F8F7] text-[#1B1A1A] border-[#DCDBD6]"}>
          Engine: {useRewCoreTestMode ? "REW Core Test" : "Live Engine"}
        </Badge>
      </div>
      
      {(subWarnings?.front?.length > 0 || subWarnings?.rear?.length > 0) && (
        <Alert className="border border-[#C1B6AD] bg-[#F8F8F7] text-[#3E4349]">
          <AlertDescription className="text-sm">
            {subWarnings.front.map((w, i) => <div key={`f-${i}`}>{w}</div>)}
            {subWarnings.rear.map((w, i) => <div key={`r-${i}`}>{w}</div>)}
          </AlertDescription>
        </Alert>
      )}

      {/* Bass Response Graph */}
      <div style={{ border: "1px solid #DCDBD6", borderRadius: 16, background: "#FFFFFF", padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1B1A1A" }}>
            Bass Response
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="rew-core-test-toggle" className="text-xs text-[#3E4349]">Temporary REW core test</Label>
            <Switch id="rew-core-test-toggle" checked={useRewCoreTestMode} onCheckedChange={setUseRewCoreTestMode} />
          </div>
        </div>

        {/* Seat selector pills — stacked rows, multi-select toggles */}
        {Array.isArray(seatingPositions) && seatingPositions.length > 0 && (() => {
          const rowMap = new Map();
          orderedSeats.forEach(seat => {
            const r = Number(seat?.row || seat?.rowNumber) || 1;
            if (!rowMap.has(r)) rowMap.set(r, []);
            rowMap.get(r).push(seat);
          });
          const rowNums = Array.from(rowMap.keys()).sort((a, b) => a - b);

          return (
            <div style={{ display: "grid", gap: 5, marginBottom: 12 }}>
              {rowNums.map(r => {
                const rowSeats = rowMap.get(r) || [];
                return (
                  <div key={r} style={{ display: "flex", gap: 5 }}>
                    {rowSeats.map(seat => {
                      const sid = seat.id || `${seat.x}-${seat.y}`;
                      const isOn = selectedSeatIds.includes(sid);
                      const isPrimary = !!seat.isPrimary;
                      const color = getSeatColor(sid);
                      const rowNum = Number(seat?.row || seat?.rowNumber) || 1;
                      const rowSeatsOrdered = orderedSeats.filter(s => (Number(s?.row || s?.rowNumber) || 1) === rowNum);
                      const posInRow = rowSeatsOrdered.findIndex(s => (s.id || `${s.x}-${s.y}`) === sid) + 1;
                      const label = `R${rowNum}S${posInRow}`;
                      return (
                        <button
                          key={sid}
                          onClick={() => toggleSeat(sid)}
                          title={`${label}${isPrimary ? " — MLP" : ""}`}
                          style={{
                            width: 52,
                            height: 26,
                            border: isOn ? `2px solid ${color}` : isPrimary ? "1px solid #A09386" : "1px solid #DCDBD6",
                            borderRadius: 9999,
                            fontSize: 11,
                            fontWeight: isOn ? 700 : 500,
                            background: isOn ? color : "#F6F3EE",
                            color: isOn ? "#fff" : isPrimary ? "#3E4349" : "#625143",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            outline: "none",
                            flexShrink: 0,
                            transition: "background 0.12s, border-color 0.12s",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })()}

        <div className="mt-4">
          {multiSeries.length > 0 ? (
            <BassGraph
              multiSeries={multiSeries}
              responseData={multiSeries[0]?.data ?? []}
              schroederFrequency={schroederFrequency}
              rp22Levels={rp22Levels}
              toggles={{}}
              crossoverFrequency={80}
              modeFrequencies={[]}
              showModeMarkers={false}
              modeMarkers={{ axial: [], tangential: [], oblique: [] }}
              linearHzAxis={false}
              rewStyleMode={true}
              yDomain={undefined}
              xDomain={[20, 200]}
              showAxialOnly={false}
              refDb={85}
              disableHighlight={false}
            />
          ) : (
            <div style={{ border: "1px solid #DCDBD6", borderRadius: 12, background: "#F8F8F7", padding: 24, color: "#3E4349", fontSize: 13, textAlign: "center" }}>
              No bass data yet. Add at least one subwoofer and one seat.
            </div>
          )}
        </div>
      </div>

      {/* __B44_STEP_DEBUG__ temporary debug card — remove after diagnosis */}
      {useRewCoreTestMode && simulationResults.stepDebug?.length > 0 && (
        <div style={{ border: '1px solid #f59e0b', borderRadius: 8, background: '#fffbeb', padding: 12, fontSize: 11, fontFamily: 'monospace', overflowX: 'auto' }}>
          <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 8 }}>REW Step Debug (43–55 Hz) — MLP seat, sub[0]</div>
          <table style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #fde68a', color: '#78350f' }}>
                <th style={{ textAlign: 'left', padding: '2px 6px' }}>Freq</th>
                <th style={{ textAlign: 'right', padding: '2px 6px' }}>directAmp</th>
                <th style={{ textAlign: 'right', padding: '2px 6px', borderLeft: '1px solid #fde68a' }}>reflRe</th>
                <th style={{ textAlign: 'right', padding: '2px 6px' }}>reflIm</th>
                <th style={{ textAlign: 'right', padding: '2px 6px', fontWeight: 700 }}>reflMag</th>
                <th style={{ textAlign: 'right', padding: '2px 6px', borderLeft: '1px solid #fde68a' }}>lfRe</th>
                <th style={{ textAlign: 'right', padding: '2px 6px' }}>lfIm</th>
                <th style={{ textAlign: 'right', padding: '2px 6px', fontWeight: 700 }}>lfMag</th>
                <th style={{ textAlign: 'right', padding: '2px 6px', borderLeft: '1px solid #fde68a', fontWeight: 700 }}>preModalMag</th>
                <th style={{ textAlign: 'right', padding: '2px 6px', fontWeight: 700 }}>postModalMag</th>
              </tr>
            </thead>
            <tbody>
              {simulationResults.stepDebug.map((row) => {
                const isNearNull = Math.abs(row.frequencyHz - 44.5) < 1.5;
                const rowBg = isNearNull ? '#fef08a' : undefined;
                const postMag = row.postModal ? row.postModal.magnitude : null;
                return (
                  <tr key={row.frequencyHz} style={{ borderBottom: '1px solid #fef3c7', background: rowBg }}>
                    <td style={{ padding: '2px 6px', color: '#92400e', fontWeight: isNearNull ? 700 : 600 }}>{row.frequencyHz.toFixed(2)}</td>
                    <td style={{ textAlign: 'right', padding: '2px 6px' }}>{row.direct.amplitude.toFixed(4)}</td>
                    <td style={{ textAlign: 'right', padding: '2px 6px', borderLeft: '1px solid #fde68a' }}>{row.summedWeightedReflectionsRe.toFixed(4)}</td>
                    <td style={{ textAlign: 'right', padding: '2px 6px' }}>{row.summedWeightedReflectionsIm.toFixed(4)}</td>
                    <td style={{ textAlign: 'right', padding: '2px 6px', fontWeight: 700, color: '#b45309' }}>{row.summedWeightedReflectionsMag.toFixed(4)}</td>
                    <td style={{ textAlign: 'right', padding: '2px 6px', borderLeft: '1px solid #fde68a' }}>{row.lateFieldRe.toFixed(4)}</td>
                    <td style={{ textAlign: 'right', padding: '2px 6px' }}>{row.lateFieldIm.toFixed(4)}</td>
                    <td style={{ textAlign: 'right', padding: '2px 6px', fontWeight: 700, color: '#7c3aed' }}>{row.lateFieldMag.toFixed(4)}</td>
                    <td style={{ textAlign: 'right', padding: '2px 6px', borderLeft: '1px solid #fde68a', fontWeight: 700 }}>{row.summedBeforeModes.preModalMagnitude.toFixed(4)}</td>
                    <td style={{ textAlign: 'right', padding: '2px 6px', fontWeight: 700, color: postMag !== null ? '#15803d' : '#9ca3af' }}>
                      {postMag !== null ? postMag.toFixed(4) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 8, fontSize: 10, color: '#92400e' }}>
            Highlighted rows = ±1.5 Hz around 44.5 Hz null region. reflMag = summed weighted reflections vector magnitude. lfMag = late-field amplitude.
          </div>
          {/* Modal transfer sub-table — rows near 44.5 Hz only */}
          {simulationResults.stepDebug.some(r => r.strongestModeFreq != null && Math.abs(r.frequencyHz - 44.5) < 4) && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: 4, fontSize: 11 }}>Strongest Active Mode + Final Modal Transfer (43–50 Hz)</div>
              <table style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap', fontSize: 10 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #bfdbfe', color: '#1e40af' }}>
                    <th style={{ textAlign: 'left', padding: '2px 5px' }}>Freq</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px' }}>modeFreq</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px' }}>type</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px' }}>nx,ny,nz</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px' }}>Q</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px' }}>srcC</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px' }}>rcvC</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px' }}>combC</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px' }}>bwHz</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px' }}>df</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px' }}>norm</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px' }}>wt</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px' }}>mTfRe</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px' }}>mTfIm</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px', borderLeft: '1px solid #bfdbfe', fontWeight: 700 }}>TfReFinal</th>
                    <th style={{ textAlign: 'right', padding: '2px 5px', fontWeight: 700 }}>TfImFinal</th>
                  </tr>
                </thead>
                <tbody>
                  {simulationResults.stepDebug
                    .filter(r => r.frequencyHz >= 43 && r.frequencyHz <= 50)
                    .map((row) => {
                      const isNearNull = Math.abs(row.frequencyHz - 44.5) < 1.5;
                      const hasMode = row.strongestModeFreq != null;
                      return (
                        <tr key={row.frequencyHz} style={{ borderBottom: '1px solid #dbeafe', background: isNearNull ? '#eff6ff' : undefined }}>
                          <td style={{ padding: '2px 5px', color: '#1e40af', fontWeight: isNearNull ? 700 : 500 }}>{row.frequencyHz.toFixed(2)}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? row.strongestModeFreq.toFixed(2) : '—'}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? row.strongestModeType : '—'}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? `${row.strongestModeNx},${row.strongestModeNy},${row.strongestModeNz}` : '—'}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? row.strongestModeQ.toFixed(2) : '—'}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? row.strongestModeSourceCoupling.toFixed(4) : '—'}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? row.strongestModeReceiverCoupling.toFixed(4) : '—'}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px', fontWeight: 700 }}>{hasMode ? row.strongestModeCombinedCoupling.toFixed(4) : '—'}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? row.strongestModeBandwidthHz.toFixed(3) : '—'}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? row.strongestModeDf.toFixed(3) : '—'}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? row.strongestModeNormalized.toFixed(4) : '—'}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? row.strongestModeWeight.toFixed(4) : '—'}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? row.strongestModeTransferRe.toFixed(4) : '—'}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px' }}>{hasMode ? row.strongestModeTransferIm.toFixed(4) : '—'}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px', borderLeft: '1px solid #bfdbfe', fontWeight: 700, color: '#1d4ed8' }}>{row.modalTransferReFinal != null ? row.modalTransferReFinal.toFixed(4) : '—'}</td>
                          <td style={{ textAlign: 'right', padding: '2px 5px', fontWeight: 700, color: '#1d4ed8' }}>{row.modalTransferImFinal != null ? row.modalTransferImFinal.toFixed(4) : '—'}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              <div style={{ marginTop: 4, fontSize: 10, color: '#1e40af' }}>
                srcC/rcvC/combC = source/receiver/combined coupling. norm = normalized df. wt = Hann weight. mTfRe/Im = single strongest mode transfer. TfReFinal/ImFinal = full accumulated modal transfer applied to field.
              </div>
            </div>
          )}
        </div>
      )}
      {/* __B44_STEP_DEBUG__ end */}

      {/* Absorption Control */}
      <div className="rounded-lg border border-[#DCDBD6] bg-white p-4">
        <div className="text-sm font-medium text-[#1B1A1A] mb-3">Room Acoustics</div>
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-[#3E4349]">Absorption</Label>
              <span className="text-xs font-mono text-[#1B1A1A]">{fmtFixed(absorptionPct, 0)}%</span>
            </div>
            <input
              type="range"
              value={absorptionPct}
              onChange={(e) => setAbsorptionPct(Number(e.target.value))}
              min="0"
              max="100"
              step="5"
              className="w-full"
            />
            <div className="flex justify-between text-xs text-[#3E4349] mt-1">
              <span>Reflective (0%)</span>
              <span>Absorptive (100%)</span>
            </div>
          </div>
          <div className="text-xs text-[#3E4349]">
            Applies to all room surfaces. Default: 30% (typical cinema).
          </div>
        </div>
      </div>

      {/* Room Damping Control */}
      <div className="rounded-lg border border-[#DCDBD6] bg-white p-4">
        <div className="text-sm font-medium text-[#1B1A1A] mb-3">Room Acoustics</div>
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-[#3E4349]">Room Damping</Label>
              <span className="text-xs font-mono text-[#1B1A1A]">{fmtFixed(roomDamping, 0)}</span>
            </div>
            <input
              type="range"
              value={roomDamping}
              onChange={(e) => setRoomDamping(Number(e.target.value))}
              min="8"
              max="35"
              step="1"
              className="w-full"
            />
            <div className="flex justify-between text-xs text-[#3E4349] mt-1">
              <span>Dead (8)</span>
              <span>Lively (35)</span>
            </div>
          </div>
          <div className="text-xs text-[#3E4349]">
            Modal + SBIR simulation (REW parity, always on)
          </div>
        </div>
      </div>

      {/* Auto Align Controls */}
      {totalSubCount > 0 && (
        <div className="rounded-lg border border-[#DCDBD6] bg-white p-4">
          <div className="text-sm font-medium text-[#1B1A1A] mb-3">Time Alignment</div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-align-toggle" className="text-xs text-[#3E4349]">Auto time-align to MLP</Label>
              <Switch id="auto-align-toggle" checked={autoAlignEnabled} onCheckedChange={setAutoAlignEnabled} />
            </div>
            {autoAlignEnabled && (
              <div className="text-xs text-[#3E4349] bg-[#F8F8F7] p-2 rounded">
                Subs are automatically aligned by distance to MLP for coherent summation.
              </div>
            )}
            {!autoAlignEnabled && (
              <div className="text-xs text-[#3E4349] bg-[#F8F8F7] p-2 rounded">
                Manual mode: adjust delays below.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub Tuning Controls */}
      <div className="space-y-4">
        {frontSubsCfg?.count > 0 && (
          <div>
            <div className="text-sm font-medium text-[#1B1A1A] mb-3">Front Subwoofer Tuning</div>
            <SubTuningControls
              subsCfg={frontSubsCfg}
              groupLabel="Front"
              subDistances={subDistances}
              autoAlignEnabled={autoAlignEnabled}
              onSettingsChange={(newSettings) => {
                setFrontSubsCfg(prev => ({ ...prev, settingsById: newSettings }));
              }}
            />
          </div>
        )}

        {rearSubsCfg?.count > 0 && (
          <div>
            <div className="text-sm font-medium text-[#1B1A1A] mb-3">Rear Subwoofer Tuning</div>
            <SubTuningControls
              subsCfg={rearSubsCfg}
              groupLabel="Rear"
              subDistances={subDistances}
              autoAlignEnabled={autoAlignEnabled}
              onSettingsChange={(newSettings) => {
                setRearSubsCfg(prev => ({ ...prev, settingsById: newSettings }));
              }}
            />
          </div>
        )}
      </div>

      {/* Per-seat detail cards */}
      {!useRewCoreTestMode && Object.keys(simulationResults.seatResponses).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Object.entries(simulationResults.seatResponses).map(([seatId, response]) => {
            const seat = seatingPositions.find(s => (s.id || `${s.x}-${s.y}`) === seatId);
            const isPrimary = seat?.isPrimary || false;
            const nullInfo = response.nulls || { count: 0, worstDb: 0 };
            
            return (
              <div key={seatId} className="rounded-lg border border-[#DCDBD6] bg-white p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-[#1B1A1A]">Seat {seatId}</div>
                  {isPrimary && <Badge className="bg-[#213428] text-white border-[#213428]">MLP</Badge>}
                </div>
                <div className="space-y-1 text-xs">
                  {nullInfo.count > 0 && (
                    <>
                      <div className="text-[#3E4349]">
                        <span className="font-medium">Nulls:</span> {nullInfo.count}
                      </div>
                      <div className="text-[#3E4349]">
                        <span className="font-medium">Worst:</span> {fmtFixed(nullInfo.worstDb, 1)} dB
                      </div>
                    </>
                  )}
                  {nullInfo.count === 0 && (
                    <div className="text-[#3E4349]">No significant nulls</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}