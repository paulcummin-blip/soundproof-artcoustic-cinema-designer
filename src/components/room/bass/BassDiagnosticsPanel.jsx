// BassDiagnosticsPanel.jsx
// Extracted diagnostic panel wiring from BassResponse.jsx (no behaviour/physics/graph changes).
// Contains: the collapsed "Developer Bass Diagnostics" dev-only block, the always-visible
// temporary diagnostic panels (Image-Source Parity Shootout, Q Clamp Bypass A/B, Live Modal
// Contributor Audit, Live Modal Vector Build, Freq-Dep Q Audit), and the "Geometry & REW Import"
// dev-only block. Graph rendering, engine logic, room state, and seat/sub calculations all
// remain in BassResponse.jsx and are passed through here as read-only props / setters.

import React from "react";
import { getSubwooferCurve } from "@/components/models/speakers/registry";
import RewBenchmarkComparisonTable from "@/components/room/bass/RewBenchmarkComparisonTable";
import ActiveParityInvestigations from "@/components/room/bass/ActiveParityInvestigations";
import AcousticSolverShootoutBatch1 from "@/components/room/bass/AcousticSolverShootoutBatch1";
import AcousticSolverShootoutBatch2 from "@/components/room/bass/AcousticSolverShootoutBatch2";
import AcousticSolverShootoutBatch3 from "@/components/room/bass/AcousticSolverShootoutBatch3";
import AcousticSolverShootoutBatch4 from "@/components/room/bass/AcousticSolverShootoutBatch4";
import ArchivedInvestigations from "@/components/room/bass/ArchivedInvestigations";
import ImageSourceParityShootout from "@/components/room/bass/ImageSourceParityShootout";
import QClampBypassABTest from "@/components/room/bass/QClampBypassABTest";
import FreqDepQAuditPanel from "@/components/room/bass/FreqDepQAuditPanel";
import LiveModalContributorAudit from "@/components/room/bass/LiveModalContributorAudit";
import LiveModalVectorBuildPanel from "@/components/room/bass/LiveModalVectorBuildPanel";
import NullRecoveryMechanismAudit from "@/components/room/bass/NullRecoveryMechanismAudit";
import NullVectorDecompositionAudit from "@/components/room/bass/NullVectorDecompositionAudit";
import LiveVectorGeometryAudit from "@/components/room/bass/LiveVectorGeometryAudit";
import PhaseEvolutionModalTransferAudit from "@/components/room/bass/PhaseEvolutionModalTransferAudit";
import ProjectionMathematicsAudit from "@/components/room/bass/ProjectionMathematicsAudit";
import DominantModeConstructionAudit from "@/components/room/bass/DominantModeConstructionAudit";
import RewTransferFunctionParityAudit from "@/components/room/bass/RewTransferFunctionParityAudit";
import ModalPhysicsInputAudit from "@/components/room/bass/ModalPhysicsInputAudit";
import ModalEquationForensicsAudit from "@/components/room/bass/ModalEquationForensicsAudit";
import MultiModeInteractionAudit from "@/components/room/bass/MultiModeInteractionAudit";
import ModalTransferSkirtShapeAudit from "@/components/room/bass/ModalTransferSkirtShapeAudit";
import IsolatedModalTransferRootCauseAudit from "@/components/room/bass/IsolatedModalTransferRootCauseAudit";
import FrequencyScalingChainAudit from "@/components/room/bass/FrequencyScalingChainAudit";
import QTransferResolutionAudit from "@/components/room/bass/QTransferResolutionAudit";
import PressureAssemblyAudit from "@/components/room/bass/PressureAssemblyAudit";

// Development flag — set to false to hide all diagnostic UI panels in production.
// Flip to true to re-enable. Do not delete diagnostic code. (Identical to BassResponse.jsx's const.)
const IS_DEVELOPMENT_MODE = false;

export default function BassDiagnosticsPanel({
  // room / seat / sub state (read-only)
  roomDims, seatingPositions, subsForSimulation, orderedSeats, surfaceAbsorption,
  frontSubsCfg, rearSubsCfg, frontSubsLive, rearSubsLive,
  autoAlignEnabled, autoAlignDelays, resolveAutoDelayForSub, getSeatColor,
  // simulation outputs
  simulationResults, multiSeries, selectedSeatIds,
  // REW parity diagnostic state + setters
  rewSourceCurveMode, setRewSourceCurveMode,
  modalSourceReferenceMode, setModalSourceReferenceMode,
  modalDistanceBlend, setModalDistanceBlend,
  modalGainScalar, setModalGainScalar,
  axialQ, setAxialQ,
  modalStorageMode,
  propagationPhaseScale, setPropagationPhaseScale,
  disableReflectionPhaseJitter, disableReflectionCoherenceWeight,
  disableLateField, disableModalPropagationPhase,
  mute68HzAxialMode,
  debugDisableModalContribution,
  rewParityFieldMode, setRewParityFieldMode,
  overrideConstantAxialQ, overrideAbsorptionAxialQ,
  debugMode200Multiplier, setDebugMode200Multiplier,
  debugModalPhaseConvention, setDebugModalPhaseConvention,
  debugModalHSign, setDebugModalHSign,
  reflectionGainScale, setReflectionGainScale,
  rewParityModalMagnitudeScale, setRewParityModalMagnitudeScale,
  modalCoherenceMode, setModalCoherenceMode,
  highOrderAxialScale, setHighOrderAxialScale,
  enableRewCoreReflections, setEnableRewCoreReflections,
  resetToParityPreset, isParityPresetActive,
  setActiveTestEngine,
  // REW overlay (production exposure of the diagnostic panels needs this)
  rewOverlayText, setRewOverlayText, showRewOverlay, setShowRewOverlay,
  normalizeRewOverlay, setNormalizeRewOverlay, rewOverlaySeries,
  // Q strategy (for Freq-Dep Q Audit Panel)
  qStrategy,
}) {
  return (
    <>
      {/* ── Developer Bass Diagnostics (collapsed, dev-only) ── */}
      {IS_DEVELOPMENT_MODE && (
        <details style={{ border: '2px solid #7c3aed', borderRadius: 8, background: '#faf5ff', padding: '8px 10px', marginBottom: 8 }}>
          <summary style={{ fontWeight: 700, color: '#5b21b6', fontSize: 12, fontFamily: 'monospace', cursor: 'pointer' }}>
            🔬 Developer Bass Diagnostics
          </summary>
          <div style={{ marginTop: 8 }}>
      {/* REW Parity Controls — inside developer section */}
      <div style={{ border: '1px solid #CBD5E1', borderRadius: 8, background: '#f8fafc', padding: '10px 12px', marginBottom: 4 }}>
          <div style={{ fontWeight: 700, color: '#334155', fontSize: 11, fontFamily: 'monospace', marginBottom: 8 }}>REW Parity Controls</div>
          <div className="flex flex-col gap-2">
            <div className="text-xs text-[#6b7280] font-mono">Engine: REW Core (production — fixed)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={resetToParityPreset} style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid #213428', background: '#213428', color: '#fff', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer', fontWeight: 600 }}>
                Reset to REW parity preset
              </button>
              <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: isParityPresetActive ? '#dcfce7' : '#fef9c3', color: isParityPresetActive ? '#166534' : '#92400e', border: `1px solid ${isParityPresetActive ? '#86efac' : '#fde68a'}` }}>
                {isParityPresetActive ? '✓ REW parity preset active' : '⚠ modified'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={rewSourceCurveMode} onChange={(e) => setRewSourceCurveMode(e.target.value)} className="h-8 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]" aria-label="Source curve">
                <option value="product">Source curve: current product</option>
                <option value="flat_rew_reference">Source curve: Flat REW reference</option>
                <option value="flat90">Source curve: flat 90 dB</option>
                <option value="rew20HzPorted">Source curve: REW-style 20 Hz ported</option>
                <option value="flat_0_500hz_rew_parity">Flat 0–500Hz REW parity</option>
              </select>
              <select value={modalSourceReferenceMode} onChange={(e) => setModalSourceReferenceMode(e.target.value)} className="h-8 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]" aria-label="Modal source reference">
                <option value="existing">Modal source: existing 1 m reference</option>
                <option value="no_volume">Modal source: no volume attenuation ⚠️ diagnostic</option>
                <option value="distance_normalized">Modal source: distance matched to listener ⚠️</option>
                <option value="distance_blend">Modal source: distance blend ⚠️</option>
                <option value="room_normalized">Modal source: room-normalised</option>
              </select>
              {modalSourceReferenceMode === 'distance_blend' && (
                <label className="flex h-8 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 text-xs text-amber-800 font-mono">
                  Modal distance blend:
                  <input type="number" min="0.00" max="1.00" step="0.05" value={modalDistanceBlend} onChange={(e) => setModalDistanceBlend(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))} className="w-16 rounded border border-amber-300 bg-white px-1 py-0.5 text-xs font-mono text-right focus:outline-none" />
                </label>
              )}
              <select value={modalGainScalar} onChange={(e) => setModalGainScalar(Number(e.target.value))} className="h-8 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]" aria-label="Modal gain">
                <option value={1.0}>Modal gain: 1.0</option>
                <option value={1.2}>Modal gain: 1.2</option>
                <option value={1.4}>Modal gain: 1.4</option>
                <option value={1.6}>Modal gain: 1.6</option>
              </select>
              <select value={axialQ} onChange={(e) => setAxialQ(Number(e.target.value))} className="h-8 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]" aria-label="Axial Q">
                <option value={4.0}>Axial Q: 4.0 (parity)</option>
                <option value={5.0}>Axial Q: 5.0</option>
                <option value={6.0}>Axial Q: 6.0</option>
                <option value={6.5}>Axial Q: 6.5</option>
                <option value={7.0}>Axial Q: 7.0</option>
                <option value={8.0}>Axial Q: 8.0 (legacy)</option>
              </select>
              <select value={propagationPhaseScale} onChange={(e) => setPropagationPhaseScale(Number(e.target.value))} className="h-8 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]" aria-label="Propagation phase scale">
                <option value={0.00}>Propagation phase scale: 0.00</option>
                <option value={0.10}>Propagation phase scale: 0.10</option>
                <option value={0.20}>Propagation phase scale: 0.20</option>
                <option value={0.30}>Propagation phase scale: 0.30</option>
                <option value={0.40}>Propagation phase scale: 0.40</option>
                <option value={0.50}>Propagation phase scale: 0.50</option>
                <option value={0.60}>Propagation phase scale: 0.60</option>
                <option value={0.70}>Propagation phase scale: 0.70</option>
                <option value={1.00}>Propagation phase scale: 1.00</option>
              </select>
              <select value={debugMode200Multiplier} onChange={(e) => setDebugMode200Multiplier(Number(e.target.value))} className="h-8 rounded-md border border-amber-300 bg-amber-50 px-2 text-xs text-amber-800 font-semibold" aria-label="(2,0,0) axial overlay">
                <option value={1.00}>(2,0,0) axial overlay: 1.00</option>
                <option value={0.75}>(2,0,0) axial overlay: 0.75</option>
                <option value={0.50}>(2,0,0) axial overlay: 0.50</option>
                <option value={0.25}>(2,0,0) axial overlay: 0.25</option>
              </select>
              {/* __TEMP_DIAGNOSTIC_MODAL_PHASE_CONVENTION__ — only active when flat_rew_reference is selected */}
              <select
                value={debugModalPhaseConvention}
                onChange={(e) => setDebugModalPhaseConvention(e.target.value)}
                className="h-8 rounded-md border border-purple-400 bg-purple-50 px-2 text-xs text-purple-900 font-semibold"
                aria-label="Modal phase convention"
                title="Diagnostic: applies a phase-convention transform to the modal sum before it is added to the pre-modal field. Active only when source curve = flat_rew_reference."
              >
                <option value="normal">Modal convention: normal (Re, Im)</option>
                <option value="invert">Modal convention: invert (−Re, −Im) = 180°</option>
                <option value="conjugate">Modal convention: conjugate (Re, −Im)</option>
                <option value="negative_conjugate">Modal convention: −conjugate (−Re, Im)</option>
              </select>
              {/* __TEMP_DIAGNOSTIC_MODAL_H_SIGN__ — only active when flat_rew_reference is selected */}
              <select
                value={debugModalHSign}
                onChange={(e) => setDebugModalHSign(e.target.value)}
                className="h-8 rounded-md border border-rose-400 bg-rose-50 px-2 text-xs text-rose-900 font-semibold"
                aria-label="Modal H sign"
                title="Diagnostic: switches the imaginary sign of the resonator transfer function. Active only when source curve = flat_rew_reference."
              >
                <option value="normal">Modal H sign: Normal (−Im)</option>
                <option value="rew_test">Modal H sign: REW test (+Im)</option>
              </select>
              {/* __TEMP_DIAGNOSTIC_MODAL_COHERENCE__ */}
              <select
                value={modalCoherenceMode}
                onChange={(e) => setModalCoherenceMode(e.target.value)}
                className="h-8 rounded-md border border-indigo-400 bg-indigo-50 px-2 text-xs text-indigo-900 font-semibold"
                aria-label="Modal coherence mode"
                title="Diagnostic: tests whether 80–150 Hz over-prediction is caused by fully coherent modal summation."
              >
                <option value="coherent">Modal coherence: coherent</option>
                <option value="distributed">Modal coherence: distributed diagnostic ⚠️</option>
                <option value="split">Modal coherence: split diagnostic ⚠️</option>
              </select>
              {/* __TEMP_REW_PARITY_HIGH_ORDER_AXIAL_SCALE__ */}
              <select
                value={highOrderAxialScale}
                onChange={(e) => setHighOrderAxialScale(Number(e.target.value))}
                className="h-8 rounded-md border border-amber-400 bg-amber-50 px-2 text-xs text-amber-900 font-semibold"
                aria-label="High-order axial scale"
                title="Diagnostic: scales axial modes with order ≥ 2. Default 1.00 = no change."
              >
                <option value={1.00}>High-order axial scale: 1.00</option>
                <option value={0.85}>High-order axial scale: 0.85</option>
                <option value={0.70}>High-order axial scale: 0.70</option>
                <option value={0.60}>High-order axial scale: 0.60</option>
                <option value={0.50}>High-order axial scale: 0.50</option>
              </select>
              {/* __TEMP_REW_PARITY_MODAL_MAGNITUDE_SCALE__ — only active when flat_rew_reference is selected */}
              <label className="flex h-8 items-center gap-2 rounded-md border border-teal-400 bg-teal-50 px-2 text-xs text-teal-900 font-mono font-semibold" title="Scales the entire modal sum before adding to direct+reflections. Active only when source = flat_rew_reference. Tests whether parity is a magnitude issue.">
                Modal mag scale:
                <input
                  type="number"
                  min="0.25"
                  max="2.00"
                  step="0.05"
                  value={rewParityModalMagnitudeScale}
                  onChange={(e) => setRewParityModalMagnitudeScale(Math.max(0.25, Math.min(2.0, parseFloat(e.target.value) || 1.0)))}
                  className="w-16 rounded border border-teal-300 bg-white px-1 py-0.5 text-xs font-mono text-right focus:outline-none"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="flex h-8 items-center gap-1 rounded-md border border-[#DCDBD6] bg-white px-2 text-xs text-[#1B1A1A]">
                <input type="checkbox" checked={enableRewCoreReflections} onChange={(e) => setEnableRewCoreReflections(e.target.checked)} />
                Reflections
              </label>
              <label className="flex h-8 items-center gap-1 rounded-md border border-orange-300 bg-orange-50 px-2 text-xs text-orange-800 font-mono">
                Refl gain:
                <input type="number" min="0.00" max="2.00" step="0.05" value={reflectionGainScale} onChange={(e) => setReflectionGainScale(Math.max(0, Math.min(2, parseFloat(e.target.value) || 0)))} className="w-14 rounded border border-orange-300 bg-white px-1 py-0.5 text-xs font-mono text-right focus:outline-none" />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'reflections_only', label: 'Reflections only' },
                { value: 'modes_only', label: 'Modes only' },
                { value: 'direct_plus_modes', label: 'Direct + Modes' },
                { value: 'full_field', label: 'Full field' },
              ].map(({ value, label }) => (
                <button key={value} onClick={() => setRewParityFieldMode(value)} className={`h-8 px-3 rounded-md border text-xs font-mono transition-colors ${rewParityFieldMode === value ? 'bg-[#213428] text-white border-[#213428]' : 'bg-white text-[#1B1A1A] border-[#DCDBD6] hover:border-[#213428]'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="w-full max-w-xl rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-[11px] text-[#334155] font-mono leading-5">
              <div className="font-bold text-[#1E293B]">Active model:</div>
              <div>Source: {rewSourceCurveMode}</div>
              <div>Modal source: {modalSourceReferenceMode}{modalSourceReferenceMode === 'distance_blend' ? ` ⚠️` : ''}</div>
              {modalSourceReferenceMode === 'distance_blend' && <div style={{ color: '#b45309', fontWeight: 700 }}>Modal distance blend: {modalDistanceBlend.toFixed(2)}</div>}
              <div>Modal gain: {modalGainScalar.toFixed(1)}</div>
              {(() => {
                // Distance normalisation factor readout — mirrors the engine's distance_normalized path
                const _dnSeat = selectedSeatIds[0]
                  ? (seatingPositions || []).find(s => (s.id || `${s.x}-${s.y}`) === selectedSeatIds[0])
                  : null;
                const _dnSub = subsForSimulation[0] ?? null;
                if (!_dnSeat || !_dnSub) return null;
                const _seatZ = Number.isFinite(Number(_dnSeat.z)) ? Number(_dnSeat.z) : 1.2;
                const _dx = _dnSub.x - _dnSeat.x;
                const _dy = _dnSub.y - _dnSeat.y;
                const _dz = (_dnSub.z ?? 0.35) - _seatZ;
                const _dist = Math.sqrt(_dx*_dx + _dy*_dy + _dz*_dz);
                const _lossDb = -20 * Math.log10(Math.max(_dist, 0.01));
                const _factor = Math.pow(10, _lossDb / 20);
                const activeRefMode = modalSourceReferenceMode === 'distance_blend' ? 'distance_blend→engine:' + (modalDistanceBlend >= 1 ? 'distance_normalized' : 'existing') : modalSourceReferenceMode;
                const isDistNorm = activeRefMode === 'distance_normalized' || (modalSourceReferenceMode === 'distance_blend' && modalDistanceBlend >= 1);
                return (
                  <>
                    <div style={{ color: isDistNorm ? '#166534' : '#6b7280', fontWeight: isDistNorm ? 700 : undefined }}>
                      modalSourceReferenceMode: {activeRefMode}{isDistNorm ? '' : ' (not distance_normalized)'}
                    </div>
                    <div style={{ color: isDistNorm ? '#166534' : '#6b7280' }}>
                      distance normalisation factor: {_factor.toFixed(4)} ({_lossDb.toFixed(2)} dB @ {_dist.toFixed(3)} m)
                    </div>
                  </>
                );
              })()}
              <div>Axial Q: {axialQ.toFixed(1)}</div>
              <div>Storage: {modalStorageMode}</div>
              <div>Propagation phase scale: {propagationPhaseScale.toFixed(2)}</div>
              <div>pureDeterministicModalSum: {rewSourceCurveMode === 'flat_rew_reference' ? 'true (REW parity)' : 'false'}</div>
              <div style={{ color: simulationResults?.activeModalVectorPath === 'storedModalContrib clean path' ? '#166534' : '#92400e', fontWeight: 600 }}>
                activeModalVectorPath: {simulationResults?.activeModalVectorPath || 'not reported'}
              </div>
              <div className="mt-1">Reflections: {enableRewCoreReflections ? 'ON' : 'OFF'}</div>
              <div style={{ color: reflectionGainScale !== 1.0 ? '#b45309' : undefined, fontWeight: reflectionGainScale !== 1.0 ? 700 : undefined }}>
                Reflection gain scale: {reflectionGainScale.toFixed(2)}{reflectionGainScale !== 1.0 ? ' ⚠️' : ''}
              </div>
              <div style={{ color: debugMode200Multiplier !== 1.0 ? '#b45309' : undefined, fontWeight: debugMode200Multiplier !== 1.0 ? 700 : undefined }}>
                (2,0,0) overlay after 0.5x axial correction: {debugMode200Multiplier.toFixed(2)}{debugMode200Multiplier !== 1.0 ? ' ⚠️' : ''}
              </div>
              {debugMode200Multiplier !== 1.0 && (
                <div style={{ color: '#dc2626', fontWeight: 700, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 4, padding: '2px 6px', marginTop: 2 }}>
                  ⛔ WARNING: (2,0,0) diagnostic multiplier is active
                </div>
              )}
              {(() => {
                const isNonDefault = rewParityFieldMode !== 'full_field';
                const isParityIsolated = rewSourceCurveMode === 'flat_rew_reference' && rewParityFieldMode === 'full_field';
                const label = `Parity isolation: ${rewParityFieldMode}${isParityIsolated ? ' → REW direct + modes only' : rewParityFieldMode === 'full_field' ? ' (true full field)' : ''}`;
                return <div style={{ color: isParityIsolated ? '#0369a1' : isNonDefault ? '#b45309' : undefined, fontWeight: isParityIsolated || isNonDefault ? 700 : undefined }}>{label}</div>;
              })()}
              {rewSourceCurveMode === 'flat_rew_reference' && rewParityFieldMode === 'full_field' && (
                <div style={{ color: '#0369a1', fontWeight: 700 }}>Reflections: suppressed for REW parity</div>
              )}
              {(() => {
                const isNonDefault = debugModalPhaseConvention !== 'normal';
                const isActive = rewSourceCurveMode === 'flat_rew_reference';
                return (
                  <div style={{ color: isNonDefault && isActive ? '#7e22ce' : isNonDefault ? '#9ca3af' : undefined, fontWeight: isNonDefault && isActive ? 700 : undefined }}>
                    Modal phase convention: {debugModalPhaseConvention}{!isActive ? ' (inactive — flat_rew_reference not selected)' : isNonDefault ? ' ⚠️' : ''}
                  </div>
                );
              })()}
              {(() => {
                const isNonDefault = debugModalHSign !== 'normal';
                const isActive = rewSourceCurveMode === 'flat_rew_reference';
                return (
                  <div style={{ color: isNonDefault && isActive ? '#be123c' : isNonDefault ? '#9ca3af' : undefined, fontWeight: isNonDefault && isActive ? 700 : undefined }}>
                    Modal H sign: {debugModalHSign}{!isActive ? ' (inactive — flat_rew_reference not selected)' : isNonDefault ? ' ⚠️' : ''}
                  </div>
                );
              })()}
              {(() => {
                const isNonDefault = modalCoherenceMode !== 'coherent';
                return (
                  <div style={{ color: isNonDefault ? '#3730a3' : undefined, fontWeight: isNonDefault ? 700 : undefined }}>
                    Modal coherence: {modalCoherenceMode}{isNonDefault ? ' ⚠️' : ''}
                  </div>
                );
              })()}
              {(() => {
                const isNonDefault = highOrderAxialScale !== 1.0;
                return (
                  <div style={{ color: isNonDefault ? '#b45309' : undefined, fontWeight: isNonDefault ? 700 : undefined }}>
                    High-order axial scale: {highOrderAxialScale.toFixed(2)}{isNonDefault ? ' ⚠️ (axial order ≥ 2 only)' : ''}
                  </div>
                );
              })()}
              {(() => {
                const isNonDefault = rewParityModalMagnitudeScale !== 1.0;
                const isActive = rewSourceCurveMode === 'flat_rew_reference';
                return (
                  <div style={{ color: isNonDefault && isActive ? '#0f766e' : isNonDefault ? '#9ca3af' : undefined, fontWeight: isNonDefault && isActive ? 700 : undefined }}>
                    Modal magnitude scale: {rewParityModalMagnitudeScale.toFixed(2)}{!isActive ? ' (inactive — flat_rew_reference not selected)' : isNonDefault ? ' ⚠️' : ''}
                  </div>
                );
              })()}

            </div>

            {/* ── REW Benchmark Comparison Table ── */}
            <div style={{ marginTop: 10, borderTop: '1px solid #CBD5E1', paddingTop: 8 }}>
              <div style={{ fontWeight: 700, color: '#334155', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 }}>
                REW Benchmark Comparison — seat: {selectedSeatIds[0] || '—'}
                {modalSourceReferenceMode === 'no_volume' && (
                  <span style={{ marginLeft: 8, color: '#b45309', fontSize: 10 }}>⚠️ no_volume mode active</span>
                )}
              </div>
              {multiSeries.length > 0 ? (
                <RewBenchmarkComparisonTable
                  b44Data={multiSeries[0]?.data ?? []}
                  label={`B44 dB (${modalSourceReferenceMode})`}
                />
              ) : (
                <div style={{ color: '#6b7280', fontSize: 10, fontFamily: 'monospace' }}>No simulation data — add a sub and seat.</div>
              )}
            </div>

            {/* Investigation tools moved to Deep Engine Diagnostics → ActiveParityInvestigations / ArchivedInvestigations */}
          </div>
        </div>

      {/* ── Core Parity Diagnostics ── */}
      {IS_DEVELOPMENT_MODE && (() => {
        /* Phase at Null Region */
        const PHASE_TARGET_HZ = [70, 75, 77, 78, 80, 85];
        const stepDebugInline = simulationResults.stepDebug;
        const getStepRowAtHzInline = (rows, targetHz) => {
          if (!Array.isArray(rows) || rows.length === 0) return null;
          let best = null, bestDist = Infinity;
          for (const row of rows) {
            const hz = row?.frequencyHz ?? row?.hz ?? null;
            if (hz === null) continue;
            const dist = Math.abs(hz - targetHz);
            if (dist < bestDist) { bestDist = dist; best = row; }
          }
          return best && bestDist <= 5 ? best : null;
        };
        const radToDegInline = (r) => (r * 180) / Math.PI;
        const magToDbInline = (v) => (Number.isFinite(v) && v > 0) ? 20 * Math.log10(v) : null;
        const fmt1Inline = (v) => (v !== null && Number.isFinite(Number(v))) ? Number(v).toFixed(1) : '—';
        const fmt0Inline = (v) => (v !== null && Number.isFinite(Number(v))) ? Number(v).toFixed(0) : '—';
        const fmt3Inline = (v) => (v !== null && Number.isFinite(Number(v))) ? Number(v).toFixed(3) : '—';
        const hasPhaseData = Array.isArray(stepDebugInline) && stepDebugInline.length > 0;

        /* Layer Breakdown */
        const wcdInline = simulationResults.wholeCurveDebugRows;
        const preModalSeriesInline = wcdInline?.preModalSeries;
        const modalOnlySeriesInline = wcdInline?.modalOnlySeries;
        const postModalSeriesInline = wcdInline?.postModalSeries;
        const LAYER_TARGET_HZ = [30, 34.3, 40, 50, 58, 60, 68.6, 70, 80, 100];
        const magToDbL = (v) => (Number.isFinite(v) && v != null) ? 20 * Math.log10(Math.max(v, 1e-10)) : null;
        const getDbAtHzL = (series, targetHz) => {
          if (!Array.isArray(series) || series.length === 0) return null;
          let best = null, bestDist = Infinity;
          for (const pt of series) {
            const hz = pt.hz ?? pt.frequency ?? pt.frequencyHz;
            const dist = Math.abs((hz ?? 0) - targetHz);
            if (dist < bestDist) { bestDist = dist; best = pt; }
          }
          if (!best || bestDist > 5) return null;
          return best.db ?? best.spl ?? best.dB ?? best.splDb ?? null;
        };
        const getRowAtHzL = (rows, targetHz) => {
          if (!Array.isArray(rows)) return null;
          let best = null, bestDist = Infinity;
          for (const row of rows) {
            const hz = row.hz ?? row.frequency ?? row.freq ?? row.frequencyHz ?? row.targetHz;
            const dist = Math.abs((hz ?? 0) - targetHz);
            if (dist < bestDist) { bestDist = dist; best = row; }
          }
          return best && bestDist <= 5 ? best : null;
        };
        const fmtL = (v) => (v !== null && v !== undefined && Number.isFinite(Number(v))) ? Number(v).toFixed(1) : '—';
        const hasLayerData = preModalSeriesInline || modalOnlySeriesInline || postModalSeriesInline || (Array.isArray(wcdInline) && wcdInline.length > 0);

        return (
          <>
            {/* Phase at Null Region */}
            <div style={{ border: '1px solid #0891b2', borderRadius: 6, background: '#ecfeff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
              <div style={{ fontWeight: 700, color: '#0e7490', marginBottom: 4 }}>
                Phase at null region — seat: {selectedSeatIds[0] || '—'}
              </div>
              <div style={{ color: '#164e63', fontSize: 9, marginBottom: 6, fontStyle: 'italic' }}>
                Source: <code>targetVectorDebug.applicationComparison</code> — prevRe/Im = pre-modal field. modalSumRe/Im = isolated modal sum. livePostRe/Im = final summed field.
                Δ phase = modal° − pre-modal°, wrapped [−180°, +180°]. Destructive = |Δ| &gt; 135°.
              </div>
              {!hasPhaseData ? (
                <div style={{ color: '#0e7490' }}>No stepDebug data — stepDebug is only populated for TARGET_DEBUG_FREQUENCIES in the engine.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 580 }}>
                    <thead>
                     <tr style={{ borderBottom: '1px solid #a5f3fc', color: '#0e7490', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 38 }}>Hz</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 52 }}>Pre-modal dB</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 52 }}>Pre-modal °</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 52 }}>Modal dB</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 52 }}>Modal °</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 60 }}>Δ phase °</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 52 }}>Final dB</th>
                       <th style={{ textAlign: 'left',  padding: '2px 5px', minWidth: 80 }}>Verdict</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 58, borderLeft: '1px solid #a5f3fc', color: '#0e4f1a' }}>PRE RE</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 58, color: '#0e4f1a' }}>PRE IM</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 58, color: '#7c2d12' }}>MOD RE</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 58, color: '#7c2d12' }}>MOD IM</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 58, color: '#1c1917' }}>FINAL RE</th>
                       <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 58, color: '#1c1917' }}>FINAL IM</th>
                     </tr>
                    </thead>
                    <tbody>
                      {PHASE_TARGET_HZ.map(hz => {
                        const row = getStepRowAtHzInline(stepDebugInline, hz);
                        const ac = row?.applicationComparison ?? null;
                        const pmRe = ac?.prevRe ?? null; const pmIm = ac?.prevIm ?? null;
                        const mRe = ac?.modalSumRe ?? null; const mIm = ac?.modalSumIm ?? null;
                        const postRe = ac?.livePostRe ?? null; const postIm = ac?.livePostIm ?? null;
                        const pmMag = (pmRe !== null && pmIm !== null) ? Math.sqrt(pmRe*pmRe + pmIm*pmIm) : null;
                        const mMag = (mRe !== null && mIm !== null) ? Math.sqrt(mRe*mRe + mIm*mIm) : null;
                        const postMag = (postRe !== null && postIm !== null) ? Math.sqrt(postRe*postRe + postIm*postIm) : null;
                        const preModalDb = magToDbInline(pmMag); const modalDb = magToDbInline(mMag); const finalDb = magToDbInline(postMag);
                        const preModalPhase = (pmRe !== null && pmIm !== null) ? radToDegInline(Math.atan2(pmIm, pmRe)) : null;
                        const modalPhase = (mRe !== null && mIm !== null) ? radToDegInline(Math.atan2(mIm, mRe)) : null;
                        let phaseDiff = null;
                        if (preModalPhase !== null && modalPhase !== null) {
                          phaseDiff = modalPhase - preModalPhase;
                          while (phaseDiff > 180) phaseDiff -= 360;
                          while (phaseDiff < -180) phaseDiff += 360;
                        }
                        const noData = ac === null;
                        const verdict = (() => {
                          if (noData) return 'no data';
                          if (phaseDiff === null) return '—';
                          const absDiff = Math.abs(phaseDiff);
                          if (absDiff > 135) return '⚠ destructive';
                          if (absDiff > 90) return '~ partial cancel';
                          if (absDiff < 45) return '✓ constructive';
                          return '~ partial add';
                        })();
                        const verdictColor = verdict.startsWith('⚠') ? '#b91c1c' : verdict.startsWith('✓') ? '#15803d' : verdict === 'no data' ? '#9ca3af' : '#92400e';
                        return (
                          <tr key={hz} style={{ borderBottom: '1px solid #cffafe', background: noData ? '#f0fdfa' : undefined }}>
                            <td style={{ textAlign: 'right', padding: '1px 5px', fontWeight: 700, color: '#0c4a6e' }}>{hz}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#0e4f1a' }}>{fmt1Inline(preModalDb)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#0e4f1a' }}>{fmt0Inline(preModalPhase)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#7c2d12' }}>{fmt1Inline(modalDb)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#7c2d12' }}>{fmt0Inline(modalPhase)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', fontWeight: 700, color: phaseDiff !== null && Math.abs(phaseDiff) > 90 ? '#b91c1c' : '#1c1917' }}>{fmt0Inline(phaseDiff)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', fontWeight: 700, color: '#1c1917' }}>{fmt1Inline(finalDb)}</td>
                            <td style={{ textAlign: 'left', padding: '1px 5px', color: verdictColor, fontWeight: 600 }}>{verdict}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', borderLeft: '1px solid #cffafe', color: '#0e4f1a', fontFamily: 'monospace', fontSize: 9 }}>{fmt3Inline(ac?.prevRe ?? null)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#0e4f1a', fontFamily: 'monospace', fontSize: 9 }}>{fmt3Inline(ac?.prevIm ?? null)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#7c2d12', fontFamily: 'monospace', fontSize: 9 }}>{fmt3Inline(ac?.modalSumRe ?? null)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#7c2d12', fontFamily: 'monospace', fontSize: 9 }}>{fmt3Inline(ac?.modalSumIm ?? null)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#1c1917', fontFamily: 'monospace', fontSize: 9 }}>{fmt3Inline(ac?.livePostRe ?? null)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#1c1917', fontFamily: 'monospace', fontSize: 9 }}>{fmt3Inline(ac?.livePostIm ?? null)}</td>
                            </tr>
                            );
                            })}
                            </tbody>
                            </table>
                            <div style={{ marginTop: 4, color: '#0891b2', fontSize: 9, fontStyle: 'italic' }}>
                            Source: applicationComparison.modalSumRe/modalSumIm — isolated modal sum, same as used in graph.
                    stepDebug only populated for TARGET_DEBUG_FREQUENCIES in the engine (30–72 Hz range by default).
                  </div>
                </div>
              )}
            </div>

            {/* Layer Contribution Breakdown */}
            <div style={{ border: '1px solid #7c3aed', borderRadius: 6, background: '#f5f3ff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
              <div style={{ fontWeight: 700, color: '#5b21b6', marginBottom: 4 }}>
                Layer Contribution Breakdown — seat: {selectedSeatIds[0] || '—'}
              </div>
              {!hasLayerData ? (
                <div style={{ color: '#7c3aed' }}>No wholeCurveDebugRows data available for this seat.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 500 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #c4b5fd', color: '#5b21b6', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 42 }}>Hz</th>
                        <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 50 }}>Direct</th>
                        <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 50 }}>Refl</th>
                        <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 60 }}>Pre-Modal</th>
                        <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 50 }}>Modal</th>
                        <th style={{ textAlign: 'right', padding: '2px 5px', minWidth: 50 }}>Final</th>
                        <th style={{ textAlign: 'left',  padding: '2px 5px', minWidth: 80 }}>Top mode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {LAYER_TARGET_HZ.map(hz => {
                        const row = getRowAtHzL(wcdInline, hz);
                        const directDb = row?.directDb ?? row?.direct_db ?? row?.directPressureDb ?? magToDbL(row?.directMagnitude) ?? null;
                        const reflDb = row?.reflectionsDb ?? row?.reflDb ?? row?.refl_db ?? magToDbL(row?.reflectionMagnitude) ?? null;
                        const preModalDb = row?.preModalDb ?? row?.pre_modal_db ?? magToDbL(row?.preModalMagnitude) ?? getDbAtHzL(preModalSeriesInline, hz);
                        const modalDb = row?.modalDb ?? row?.modal_db ?? magToDbL(row?.modalSumMagnitude) ?? getDbAtHzL(modalOnlySeriesInline, hz);
                        const finalDb = row?.finalSplDb ?? row?.finalDb ?? row?.final_db ?? row?.splDb ?? row?.spl_db ?? getDbAtHzL(postModalSeriesInline, hz);
                        const sm = row?.strongestMode ?? row?.dominant_mode ?? row?.dominantMode ?? row?.topMode ?? null;
                        const modeLabel = sm ? (typeof sm === 'string' ? sm : (sm.label ?? sm.mode ?? `(${[sm.nx,sm.ny,sm.nz].filter(v=>v!=null).join(',')})`)) : '—';
                        return (
                          <tr key={hz} style={{ borderBottom: '1px solid #ede9fe' }}>
                            <td style={{ textAlign: 'right', padding: '1px 5px', fontWeight: 700, color: '#4c1d95' }}>{hz}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#1e3a5f' }}>{fmtL(directDb)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#1e3a5f' }}>{fmtL(reflDb)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#0e4f1a' }}>{fmtL(preModalDb)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', color: '#7c2d12' }}>{fmtL(modalDb)}</td>
                            <td style={{ textAlign: 'right', padding: '1px 5px', fontWeight: 700, color: '#1c1917' }}>{fmtL(finalDb)}</td>
                            <td style={{ textAlign: 'left', padding: '1px 5px', color: '#6b21a8', fontSize: 9 }}>{modeLabel}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 4, color: '#7c3aed', fontSize: 9, fontStyle: 'italic' }}>
                    Pre-Modal = direct + reflections summed before modal addition. All values dBSPL.
                  </div>
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* ── Image-Source Parity Shootout ── */}
      {IS_DEVELOPMENT_MODE && (() => {
        return (
          <ImageSourceParityShootout
            roomDims={roomDims}
            seatingPositions={seatingPositions}
            subsForSimulation={subsForSimulation}
            surfaceAbsorption={surfaceAbsorption}
            rewOverlaySeries={rewOverlaySeries}
            liveProductionData={multiSeries[0]?.data ?? null}
          />
        );
      })()}

      {/* ── Deep Engine Diagnostics (reorganised) ── */}
      {IS_DEVELOPMENT_MODE && (
        <details style={{ border: '1px solid #CBD5E1', borderRadius: 8, background: '#f8fafc', padding: '8px 10px', marginBottom: 4 }}>
          <summary style={{ fontWeight: 700, color: '#334155', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
            Deep Engine Diagnostics
          </summary>
          <div style={{ marginTop: 8 }}>

            {/* ── SECTION 1: Active REW Parity Investigation ── */}
            <div style={{ fontWeight: 700, color: '#213428', fontSize: 11, fontFamily: 'monospace', marginBottom: 8, paddingBottom: 6, borderBottom: '2px solid #213428' }}>
              Section 1 — Active REW Parity Investigation
            </div>
            {(() => {
              const activeSeat = selectedSeatIds[0]
                ? (seatingPositions || []).find(s => (s.id || `${s.x}-${s.y}`) === selectedSeatIds[0])
                : null;
              const activeSub = subsForSimulation[0] ?? null;
              return (
                <ActiveParityInvestigations
                  roomDims={roomDims}
                  seat={activeSeat}
                  sub={activeSub}
                  seatingPositions={seatingPositions}
                  subsForSimulation={subsForSimulation}
                  surfaceAbsorption={surfaceAbsorption}
                  axialQ={axialQ}
                  multiSeries={multiSeries}
                  modalSourceReferenceMode={modalSourceReferenceMode}
                  modalGainScalar={modalGainScalar}
                  modalDistanceBlend={modalDistanceBlend}
                  propagationPhaseScale={propagationPhaseScale}
                  enableRewCoreReflections={enableRewCoreReflections}
                  rewParityModalMagnitudeScale={rewParityModalMagnitudeScale}
                  debugModalPhaseConvention={debugModalPhaseConvention}
                  debugModalHSign={debugModalHSign}
                  modalCoherenceMode={modalCoherenceMode}
                  modalStorageMode={modalStorageMode}
                  disableLateField={disableLateField}
                  onPromoteRefined={(spec) => setActiveTestEngine(spec)}
                />
              );
            })()}

            {/* ── Acoustic Solver Shootout — Batch 1 ── */}
            {(() => {
              const shootoutSeat = selectedSeatIds[0]
                ? (seatingPositions || []).find(s => (s.id || `${s.x}-${s.y}`) === selectedSeatIds[0])
                : null;
              const shootoutSub = subsForSimulation[0] ?? null;
              const shootoutCurve = shootoutSub ? getSubwooferCurve(shootoutSub.modelKey) : null;
              if (!shootoutSeat || !shootoutSub || !shootoutCurve || !roomDims?.widthM) return null;
              const _rdims = { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM };
              const _seatPos = { x: shootoutSeat.x, y: shootoutSeat.y, z: Number.isFinite(Number(shootoutSeat.z)) ? Number(shootoutSeat.z) : 1.2 };
              const _liveData = multiSeries[0]?.data ?? null;
              return (
                <>
                  <AcousticSolverShootoutBatch1
                    roomDims={_rdims}
                    seatPos={_seatPos}
                    subsForSimulation={subsForSimulation}
                    subProductCurve={shootoutCurve}
                    surfaceAbsorption={surfaceAbsorption}
                    axialQ={axialQ}
                    liveProductionData={_liveData}
                  />
                  <AcousticSolverShootoutBatch2
                    roomDims={_rdims}
                    seatPos={_seatPos}
                    subsForSimulation={subsForSimulation}
                    subProductCurve={shootoutCurve}
                    surfaceAbsorption={surfaceAbsorption}
                    axialQ={axialQ}
                    liveProductionData={_liveData}
                  />
                  <AcousticSolverShootoutBatch3
                    roomDims={_rdims}
                    seatPos={_seatPos}
                    subsForSimulation={subsForSimulation}
                    surfaceAbsorption={surfaceAbsorption}
                    axialQ={axialQ}
                    liveProductionData={_liveData}
                  />
                  <AcousticSolverShootoutBatch4
                    roomDims={_rdims}
                    seatPos={_seatPos}
                    subsForSimulation={subsForSimulation}
                    surfaceAbsorption={surfaceAbsorption}
                  />
                </>
              );
            })()}

            {/* ── SECTION 2: Archived Investigations ── */}
            <div style={{ fontWeight: 700, color: '#4c1d95', fontSize: 11, fontFamily: 'monospace', margin: '16px 0 8px', paddingBottom: 6, borderBottom: '2px solid #c4b5fd' }}>
              Section 2 — Archived Investigations
            </div>
            {(() => {
              const archiveSeat = selectedSeatIds[0]
                ? (seatingPositions || []).find(s => (s.id || `${s.x}-${s.y}`) === selectedSeatIds[0])
                : null;
              const archiveSub = subsForSimulation[0] ?? null;
              const archiveSweepSettings = {
                axialQ, modalSourceReferenceMode, modalGainScalar,
                propagationPhaseScale: 0, pureDeterministicModalSum: true,
                disableModalPropagationPhase: true, modalStorageMode,
                highOrderAxialScale, rewParityModalMagnitudeScale,
                enableReflections: false, disableLateField: true, modalCoherenceMode: 'coherent',
              };
              return (
                <ArchivedInvestigations
                  roomDims={roomDims}
                  seat={archiveSeat}
                  sub={archiveSub}
                  subs={subsForSimulation}
                  seatingPositions={seatingPositions}
                  surfaceAbsorption={surfaceAbsorption}
                  axialQ={axialQ}
                  multiSeries={multiSeries}
                  simulationResults={simulationResults}
                  sweepSettings={archiveSweepSettings}
                  modalDistanceBlend={modalDistanceBlend}
                  modalSourceReferenceMode={modalSourceReferenceMode}
                  modalGainScalar={modalGainScalar}
                  disableModalPropagationPhase={disableModalPropagationPhase}
                  propagationPhaseScale={propagationPhaseScale}
                  rewSourceCurveMode={rewSourceCurveMode}
                  selectedSeatIds={selectedSeatIds}
                  subsForSimulation={subsForSimulation}
                  frontSubsCfg={frontSubsCfg}
                  enableRewCoreReflections={enableRewCoreReflections}
                  disableLateField={disableLateField}
                  modalStorageMode={modalStorageMode}
                  disableReflectionPhaseJitter={disableReflectionPhaseJitter}
                  disableReflectionCoherenceWeight={disableReflectionCoherenceWeight}
                  mute68HzAxialMode={mute68HzAxialMode}
                  debugDisableModalContribution={debugDisableModalContribution}
                />
              );
            })()}

            {/* ── Inline geometry debug panels (preserved) ── */}
      {/* __B44_SEAT_MAP_DEBUG__ */}
      {Array.isArray(seatingPositions) && seatingPositions.length > 0 && (() => {
        const debugRows = orderedSeats.map((seat) => {
          const sid = seat.id || `${seat.x}-${seat.y}`;
          const rowNum = Number(seat?.row || seat?.rowNumber) || 1;
          const rowSeatsOrdered = orderedSeats.filter(s => (Number(s?.row || s?.rowNumber) || 1) === rowNum);
          const posInRow = rowSeatsOrdered.findIndex(s => (s.id || `${s.x}-${s.y}`) === sid) + 1;
          const label = `R${rowNum}S${posInRow}`;
          const color = getSeatColor(sid);
          const isSelected = selectedSeatIds.includes(sid);
          const hasResponse = !!simulationResults.seatResponses[sid];
          return { label, sid, x: seat.x, y: seat.y, indexInRow: seat.indexInRow, isPrimary: !!seat.isPrimary, isSelected, color, hasResponse };
        });
        const firstSeriesId = multiSeries[0]?.id ?? '—';
        const allSeriesIds = multiSeries.map(s => s.id).join(', ') || '—';
        return (
          <div style={{ border: '1px solid #f97316', borderRadius: 6, background: '#fff7ed', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
            <div style={{ fontWeight: 700, color: '#9a3412', marginBottom: 6 }}>Bass seat mapping debug</div>
            <div style={{ marginBottom: 4, color: '#7c2d12' }}><strong>orderedSeats sequence:</strong> {orderedSeats.map(s => s.id || `${s.x}-${s.y}`).join(' → ')}</div>
            <div style={{ marginBottom: 4, color: '#7c2d12' }}><strong>selectedSeatIds:</strong> [{selectedSeatIds.join(', ')}]</div>
            <div style={{ marginBottom: 4, color: '#7c2d12' }}><strong>multiSeries first id:</strong> {firstSeriesId}</div>
            <div style={{ marginBottom: 6, color: '#7c2d12' }}><strong>multiSeries all ids:</strong> [{allSeriesIds}]</div>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #fed7aa', color: '#9a3412' }}>
                  <th style={{ textAlign: 'left', padding: '1px 4px' }}>label</th>
                  <th style={{ textAlign: 'left', padding: '1px 4px' }}>id</th>
                  <th style={{ textAlign: 'right', padding: '1px 4px' }}>x</th>
                  <th style={{ textAlign: 'right', padding: '1px 4px' }}>y</th>
                  <th style={{ textAlign: 'right', padding: '1px 4px' }}>idxInRow</th>
                  <th style={{ textAlign: 'center', padding: '1px 4px' }}>MLP</th>
                  <th style={{ textAlign: 'center', padding: '1px 4px' }}>sel</th>
                  <th style={{ textAlign: 'left', padding: '1px 4px' }}>colour</th>
                  <th style={{ textAlign: 'center', padding: '1px 4px' }}>hasResp</th>
                </tr>
              </thead>
              <tbody>
                {debugRows.map(r => (
                  <tr key={r.sid} style={{ borderBottom: '1px solid #ffedd5', background: r.isSelected ? '#fef3c7' : undefined }}>
                    <td style={{ padding: '1px 4px', fontWeight: 700, color: '#9a3412' }}>{r.label}</td>
                    <td style={{ padding: '1px 4px', color: '#78350f', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sid}</td>
                    <td style={{ textAlign: 'right', padding: '1px 4px' }}>{Number.isFinite(r.x) ? r.x.toFixed(3) : '—'}</td>
                    <td style={{ textAlign: 'right', padding: '1px 4px' }}>{Number.isFinite(r.y) ? r.y.toFixed(3) : '—'}</td>
                    <td style={{ textAlign: 'right', padding: '1px 4px' }}>{r.indexInRow ?? '—'}</td>
                    <td style={{ textAlign: 'center', padding: '1px 4px' }}>{r.isPrimary ? '✓' : ''}</td>
                    <td style={{ textAlign: 'center', padding: '1px 4px', fontWeight: r.isSelected ? 700 : 400 }}>{r.isSelected ? '●' : '○'}</td>
                    <td style={{ padding: '1px 4px' }}><span style={{ display: 'inline-block', width: 10, height: 10, background: r.color, borderRadius: 2, marginRight: 3, verticalAlign: 'middle' }} />{r.color}</td>
                    <td style={{ textAlign: 'center', padding: '1px 4px' }}>{r.hasResponse ? '✓' : '✗'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* __B44_GEOMETRY_DEBUG__ */}
      {(() => {
        const firstSelectedId = selectedSeatIds[0] || null;
        const firstSeat = firstSelectedId ? (seatingPositions || []).find(s => (s.id || `${s.x}-${s.y}`) === firstSelectedId) : null;
        const firstSeriesSeatId = multiSeries[0]?.id ?? null;
        return (
          <div style={{ border: '1px solid #6366f1', borderRadius: 6, background: '#eef2ff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
            <div style={{ fontWeight: 700, color: '#4338ca', marginBottom: 6 }}>Bass runtime geometry debug</div>
            <div style={{ marginBottom: 4 }}><strong>selectedSeatIds:</strong> [{selectedSeatIds.join(', ')}]</div>
            <div style={{ marginBottom: 4 }}><strong>first graph series seat:</strong> {firstSeriesSeatId ?? '—'}</div>
            <div style={{ marginBottom: 4, borderTop: '1px solid #c7d2fe', paddingTop: 4 }}>
              <strong>seat id:</strong> {firstSeat ? (firstSeat.id || `${firstSeat.x}-${firstSeat.y}`) : '—'}<br/>
              <strong>seat x:</strong> {firstSeat ? firstSeat.x : '—'}<br/>
              <strong>seat y:</strong> {firstSeat ? firstSeat.y : '—'}<br/>
              <strong>seat z:</strong> {firstSeat ? (Number.isFinite(Number(firstSeat.z)) ? Number(firstSeat.z) : 1.2) : '—'}
            </div>
            <div style={{ marginBottom: 4, borderTop: '1px solid #c7d2fe', paddingTop: 4 }}>
              <strong>room width:</strong> {roomDims?.widthM ?? '—'}<br/>
              <strong>room length:</strong> {roomDims?.lengthM ?? '—'}<br/>
              <strong>room height:</strong> {roomDims?.heightM ?? '—'}
            </div>
            <div style={{ marginBottom: 4, borderTop: '1px solid #c7d2fe', paddingTop: 4 }}>
              <strong>subs ({subsForSimulation.length}):</strong>
              {subsForSimulation.length === 0 && <span> none</span>}
              {subsForSimulation.map((sub, i) => (
                <div key={sub.id || i} style={{ marginLeft: 8 }}>[{i}] id: {sub.id ?? '—'}, model: {sub.modelKey ?? '—'}, x: {sub.x}, y: {sub.y}, z: {sub.z ?? '—'}, gain: {sub.tuning?.gainDb ?? 0} dB, delay: {sub.tuning?.delayMs ?? 0} ms, polarity: {sub.tuning?.polarity ?? 0}°</div>
              ))}
            </div>
            <div style={{ marginBottom: 4, borderTop: '1px solid #c7d2fe', paddingTop: 4 }}>
              <strong>surface absorption:</strong><br/>
              <span style={{ marginLeft: 8 }}>front: {surfaceAbsorption.front}, back: {surfaceAbsorption.back}, left: {surfaceAbsorption.left}, right: {surfaceAbsorption.right}, ceiling: {surfaceAbsorption.ceiling}, floor: {surfaceAbsorption.floor}</span>
            </div>
            <div style={{ borderTop: '1px solid #c7d2fe', paddingTop: 4 }}>
              <strong>reflections:</strong> {String(enableRewCoreReflections)}<br/>
              <strong>modes:</strong> true<br/>
              <strong>smoothing:</strong> none<br/>
              <strong>freq min:</strong> 20 Hz<br/>
              <strong>freq max:</strong> 200 Hz
            </div>
          </div>
        );
      })()}

      {/* __B44_RUNTIME_AUDIT__ */}
      {(() => {
        const auditFirstSeatId = selectedSeatIds[0] || null;
        const auditFirstSeat = auditFirstSeatId ? (seatingPositions || []).find(s => (s.id || `${s.x}-${s.y}`) === auditFirstSeatId) : null;
        return (
          <div style={{ border: '2px solid #0ea5e9', borderRadius: 8, background: '#f0f9ff', padding: '10px 12px', fontSize: 10, fontFamily: 'monospace', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: 8, fontSize: 12 }}>⚡ Bass Runtime Audit Panel</div>
            <div style={{ marginBottom: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', color: '#0c4a6e' }}>
              <div><strong>frontSubsCfg.count:</strong> {frontSubsCfg?.count ?? 'undefined'}</div>
              <div><strong>rearSubsCfg.count:</strong> {rearSubsCfg?.count ?? 'undefined'}</div>
              <div><strong>frontSubsLive.length:</strong> {Array.isArray(frontSubsLive) ? frontSubsLive.length : 'not array'}</div>
              <div><strong>rearSubsLive.length:</strong> {Array.isArray(rearSubsLive) ? rearSubsLive.length : 'not array'}</div>
              <div><strong>autoAlignEnabled:</strong> {String(autoAlignEnabled)}</div>
              <div><strong>selectedSeatIds:</strong> [{selectedSeatIds.join(', ')}]</div>
            </div>
            <div style={{ borderTop: '1px solid #bae6fd', paddingTop: 6, marginBottom: 6, color: '#0c4a6e' }}>
              <strong>First selected seat:</strong>{' '}
              {auditFirstSeat ? `id=${auditFirstSeat.id ?? `${auditFirstSeat.x}-${auditFirstSeat.y}`}  x=${auditFirstSeat.x}  y=${auditFirstSeat.y}  z=${Number.isFinite(Number(auditFirstSeat.z)) ? Number(auditFirstSeat.z) : 1.2}` : '—'}
            </div>
            <div style={{ borderTop: '1px solid #bae6fd', paddingTop: 6, marginBottom: 6, color: '#0c4a6e' }}>
              <strong>autoAlignDelays:</strong>{' '}
              {Object.keys(autoAlignDelays).length === 0 ? '{}' : Object.entries(autoAlignDelays).map(([k, v]) => `${k}: ${Number.isFinite(v) ? v.toFixed(3) : v}ms`).join('  |  ')}
            </div>
            <div style={{ borderTop: '1px solid #bae6fd', paddingTop: 6, color: '#0c4a6e' }}>
              <strong>subsForSimulation ({subsForSimulation.length}):</strong>
              {subsForSimulation.length === 0 && <span style={{ marginLeft: 8 }}>none</span>}
              {subsForSimulation.map((sub, i) => (
                <div key={sub.id || i} style={{ border: '1px solid #bae6fd', borderRadius: 4, background: '#fff', padding: '4px 8px', marginTop: 4 }}>
                  <span style={{ fontWeight: 700, color: '#0369a1' }}>[{i}] {sub.id ?? '—'}</span>
                  {'  '}model: {sub.modelKey ?? '—'}
                  {'  '}x: {Number.isFinite(sub.x) ? sub.x.toFixed(4) : '—'}
                  {'  '}y: {Number.isFinite(sub.y) ? sub.y.toFixed(4) : '—'}
                  {'  '}z: {Number.isFinite(sub.z) ? sub.z.toFixed(4) : '—'}
                  {'  '}gainDb: {sub.tuning?.gainDb ?? 0}
                  {'  '}delayMs: {Number.isFinite(sub.tuning?.delayMs) ? sub.tuning.delayMs.toFixed(3) : 0}
                  {'  '}polarity: {sub.tuning?.polarity ?? 0}°
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* RewDebugPanel moved to ArchivedInvestigations */}

      {/* Delay optimiser moved to ArchivedInvestigations */}

      {/* REW Geometry Match Values + Alignment Audit — in Geometry & REW Import section below the graph */}

          </div>
        </details>
      )}
      {/* Deep Engine Diagnostics end */}
          </div>
        </details>
      )}
      {/* Developer Bass Diagnostics end */}

      {/* ── Image-Source Parity Shootout (temporary production exposure) ── */}
      <ImageSourceParityShootout
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
        rewOverlaySeries={rewOverlaySeries}
        liveProductionData={multiSeries[0]?.data ?? null}
      />

      {/* ── Q Clamp Bypass A/B Test — diagnostic only ── */}
      <QClampBypassABTest
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
      />

      {/* ── Live Modal Contributor Audit — temporary diagnostic ── */}
      <LiveModalContributorAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
      />

      {/* ── Live Modal Vector Build — temporary diagnostic ── */}
      <LiveModalVectorBuildPanel
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
      />

      {/* ── Null Recovery Mechanism Audit — temporary diagnostic ── */}
      <NullRecoveryMechanismAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
      />

      {/* ── Null Vector Decomposition Audit — temporary diagnostic ── */}
      <NullVectorDecompositionAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
      />

      {/* ── Live Vector Geometry Audit — temporary diagnostic ── */}
      <LiveVectorGeometryAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
      />

      {/* ── Phase Evolution & Modal Transfer Investigation — temporary strict audit ── */}
      <PhaseEvolutionModalTransferAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
      />

      {/* ── Projection Mathematics Audit — temporary strict audit ── */}
      <ProjectionMathematicsAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
      />

      {/* ── Dominant Mode Construction Audit — temporary strict audit ── */}
      <DominantModeConstructionAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
      />

      {/* ── REW Transfer Function Parity Audit — temporary strict audit ── */}
      <RewTransferFunctionParityAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
      />

      {/* ── Modal Physics Input Audit — temporary strict audit ── */}
      <ModalPhysicsInputAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
      />

      {/* ── Modal Equation Forensics Audit — temporary strict audit ── */}
      <ModalEquationForensicsAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
      />

      {/* ── Multi-Mode Interaction Audit — temporary strict audit ── */}
      <MultiModeInteractionAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
      />

      {/* ── Modal Transfer Skirt Shape Audit — temporary strict audit ── */}
      <ModalTransferSkirtShapeAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        surfaceAbsorption={surfaceAbsorption}
      />

      {/* ── Isolated Modal Transfer Root Cause Audit — temporary strict audit ── */}
      <IsolatedModalTransferRootCauseAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
      />

      {/* ── Frequency Scaling Chain Audit — temporary strict audit ── */}
      <FrequencyScalingChainAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
      />

      {/* ── Q And Transfer Resolution Audit — temporary strict audit ── */}
      <QTransferResolutionAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
      />

      {/* ── Pressure Assembly Audit — temporary strict audit ── */}
      <PressureAssemblyAudit
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
      />

      {/* ── Freq-Dep Q Audit Panel — Production vs Variant F ── */}
      <FreqDepQAuditPanel
        roomDims={roomDims}
        seatingPositions={seatingPositions}
        subsForSimulation={subsForSimulation}
        surfaceAbsorption={surfaceAbsorption}
        rewOverlaySeries={rewOverlaySeries}
        qStrategy={qStrategy}
      />

      {/* ── Geometry & REW Import (collapsed) ── */}
      {IS_DEVELOPMENT_MODE && (
        <details style={{ border: '1px solid #0891b2', borderRadius: 8, background: '#f0f9ff', padding: '8px 10px', marginBottom: 4 }}>
          <summary style={{ fontWeight: 700, color: '#0369a1', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
            Geometry &amp; REW Import
          </summary>
          <div style={{ marginTop: 8 }}>

      {/* __REW_GEOMETRY_MATCH__ */}
      {(() => {
        const rewSeatId = selectedSeatIds[0] || null;
        const rewSeat = rewSeatId ? (seatingPositions || []).find(s => (s.id || `${s.x}-${s.y}`) === rewSeatId) : null;
        const rewSeatZ = rewSeat && Number.isFinite(Number(rewSeat.z)) ? Number(rewSeat.z) : 1.2;
        const fmt = (v, d = 4) => Number.isFinite(v) ? Number(v).toFixed(d) : '—';
        const frontSubs = subsForSimulation.filter(s => s.id?.includes('front-sub') || s.id?.includes('sub-front'));
        const rearSubs = subsForSimulation.filter(s => s.id?.includes('rear-sub') || s.id?.includes('sub-rear'));
        return (
          <div style={{ border: '2px solid #0891b2', borderRadius: 6, background: '#ecfeff', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
            <div style={{ fontWeight: 700, color: '#0e7490', marginBottom: 6, fontSize: 11 }}>REW Geometry Match Values</div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 600, color: '#155e75', marginBottom: 2 }}>Room</div>
              <div style={{ color: '#164e63' }}>widthM: {fmt(roomDims?.widthM)} &nbsp; lengthM: {fmt(roomDims?.lengthM)} &nbsp; heightM: {fmt(roomDims?.heightM)}</div>
            </div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 600, color: '#155e75', marginBottom: 2 }}>Selected Seat</div>
              {rewSeat ? <div style={{ color: '#164e63' }}>id: {rewSeat.id || `${rewSeat.x}-${rewSeat.y}`} &nbsp; x: {fmt(rewSeat.x)} &nbsp; y: {fmt(rewSeat.y)} &nbsp; z: {fmt(rewSeatZ)}</div> : <div style={{ color: '#6b7280' }}>— none selected —</div>}
            </div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 600, color: '#155e75', marginBottom: 2 }}>All Seats ({(seatingPositions || []).length})</div>
              {(seatingPositions || []).map((seat) => {
                const sid = seat.id || `${seat.x}-${seat.y}`;
                const sz = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;
                const rowNum = Number(seat?.row || seat?.rowNumber) || 1;
                const rowSeats = orderedSeats.filter(s => (Number(s?.row || s?.rowNumber) || 1) === rowNum);
                const posInRow = rowSeats.findIndex(s => (s.id || `${s.x}-${s.y}`) === sid) + 1;
                const label = `R${rowNum}S${posInRow}`;
                return <div key={sid} style={{ color: '#164e63', paddingLeft: 8 }}>[{label}] id: {sid} &nbsp; x: {fmt(seat.x)} &nbsp; y: {fmt(seat.y)} &nbsp; z: {fmt(sz)} {seat.isPrimary ? '(MLP)' : ''}</div>;
              })}
            </div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 600, color: '#155e75', marginBottom: 2 }}>Front Subs ({frontSubs.length})</div>
              {frontSubs.length === 0 ? <div style={{ color: '#6b7280', paddingLeft: 8 }}>none</div> : frontSubs.map((sub, i) => {
                const subId = sub.id;
                const isFront = subId?.includes('front-sub') || subId?.includes('sub-front');
                const cfgForSub = isFront ? frontSubsCfg : rearSubsCfg;
                const manualDelay = Number.isFinite(cfgForSub?.settingsById?.[subId]?.delayMs) ? cfgForSub.settingsById[subId].delayMs : 0;
                const autoDelay = resolveAutoDelayForSub(subId, 'front', i);
                return <div key={sub.id || i} style={{ color: '#164e63', paddingLeft: 8, marginBottom: 2 }}>id: {sub.id} &nbsp; x: {fmt(sub.x)} &nbsp; y: {fmt(sub.y)} &nbsp; z: {fmt(sub.z)} &nbsp; model: {sub.modelKey}<br/>&nbsp;&nbsp;manual delay: {fmt(manualDelay, 3)}ms &nbsp; auto delay: {fmt(autoDelay, 3)}ms &nbsp; total: {fmt(manualDelay + autoDelay, 3)}ms &nbsp; polarity: {sub.tuning?.polarity ?? 0}°</div>;
              })}
            </div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 600, color: '#155e75', marginBottom: 2 }}>Rear Subs ({rearSubs.length})</div>
              {rearSubs.length === 0 ? <div style={{ color: '#6b7280', paddingLeft: 8 }}>none</div> : rearSubs.map((sub, i) => {
                const subId = sub.id;
                const manualDelay = Number.isFinite(rearSubsCfg?.settingsById?.[subId]?.delayMs) ? rearSubsCfg.settingsById[subId].delayMs : 0;
                const autoDelay = resolveAutoDelayForSub(subId, 'rear', i);
                return <div key={sub.id || i} style={{ color: '#164e63', paddingLeft: 8, marginBottom: 2 }}>id: {sub.id} &nbsp; x: {fmt(sub.x)} &nbsp; y: {fmt(sub.y)} &nbsp; z: {fmt(sub.z)} &nbsp; model: {sub.modelKey}<br/>&nbsp;&nbsp;manual delay: {fmt(manualDelay, 3)}ms &nbsp; auto delay: {fmt(autoDelay, 3)}ms &nbsp; total: {fmt(manualDelay + autoDelay, 3)}ms &nbsp; polarity: {sub.tuning?.polarity ?? 0}°</div>;
              })}
            </div>
            <div style={{ color: '#0e7490', fontStyle: 'italic', fontSize: 9, borderTop: '1px solid #a5f3fc', paddingTop: 4 }}>
              Coordinates are engine source points. Use these exact values in REW for parity testing.
            </div>
          </div>
        );
      })()}

      {/* __B44_ALIGNMENT_AUDIT__ */}
      {(() => {
        const auditMlpSeat = seatingPositions?.find(s => s.isPrimary) || seatingPositions?.[0];
        const auditMlpPoint = auditMlpSeat ? { x: auditMlpSeat.x, y: auditMlpSeat.y, z: Number.isFinite(Number(auditMlpSeat.z)) ? Number(auditMlpSeat.z) : 1.2 } : null;
        const auditSeatId = auditMlpSeat ? (auditMlpSeat.id || `${auditMlpSeat.x}-${auditMlpSeat.y}`) : '—';
        const SPEED_OF_SOUND = 343;
        const auditRoomW = Number(roomDims?.widthM) || 4.5;
        const auditRoomL = Number(roomDims?.lengthM) || 6.0;
        const auditRows = [];
        const buildRows = (cfg, group) => {
          const count = cfg?.count || 0;
          if (count === 0) return;
          const cfgPositions = Array.isArray(cfg?.positions) ? cfg.positions : [];
          const LABELS = ['left', 'right'];
          const isRear = group === 'rear';
          const defaultPositions = isRear
            ? [{ x: auditRoomW * 0.33, y: auditRoomL - 0.15 }, { x: auditRoomW * 0.67, y: auditRoomL - 0.15 }]
            : [{ x: auditRoomW * 0.33, y: 0.15 }, { x: auditRoomW * 0.67, y: 0.15 }];
          for (let i = 0; i < count; i++) {
            const subId = `${group}-sub-${LABELS[i] ?? i}`;
            const fromCfg = cfgPositions[i];
            const pos = fromCfg || defaultPositions[i];
            const posSource = fromCfg ? `${group}SubsCfg.positions[${i}]` : 'default';
            const subX = pos?.x ?? null;
            const subY = pos?.y ?? null;
            const subZ = 0.35;
            const settings = cfg?.settingsById?.[subId] || {};
            const manualDelayMs = Number.isFinite(settings.delayMs) ? settings.delayMs : 0;
            const appliedDelayMs = manualDelayMs + (autoAlignDelays[subId] ?? 0);
            let dx = null, dy = null, dz = null, distM = null, arrMs = null;
            if (auditMlpPoint && subX !== null && subY !== null) {
              dx = subX - auditMlpPoint.x; dy = subY - auditMlpPoint.y; dz = subZ - auditMlpPoint.z;
              distM = Math.sqrt(dx*dx + dy*dy + dz*dz); arrMs = (distM / SPEED_OF_SOUND) * 1000;
            }
            const uiLabel = count === 1 ? `${group.charAt(0).toUpperCase() + group.slice(1)} Sub Single` : `${group.charAt(0).toUpperCase() + group.slice(1)} Sub ${LABELS[i]?.charAt(0).toUpperCase() + LABELS[i]?.slice(1)}`;
            auditRows.push({ uiLabel, subId, group, subX, subY, subZ, dx, dy, dz, distM, arrMs, appliedDelayMs, posSource });
          }
        };
        buildRows(frontSubsCfg, 'front');
        buildRows(rearSubsCfg, 'rear');
        const fmt = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—');
        return (
          <div style={{ border: '1px solid #dc2626', borderRadius: 6, background: '#fef2f2', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
            <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>Two-sub alignment geometry audit</div>
            <div style={{ marginBottom: 6, color: '#7f1d1d' }}>
              <strong>MLP seat id:</strong> {auditSeatId} &nbsp;|&nbsp;
              <strong>seat x:</strong> {auditMlpPoint ? fmt(auditMlpPoint.x) : '—'} &nbsp;
              <strong>seat y:</strong> {auditMlpPoint ? fmt(auditMlpPoint.y) : '—'} &nbsp;
              <strong>seat z:</strong> {auditMlpPoint ? fmt(auditMlpPoint.z) : '—'}
            </div>
            {auditRows.length === 0 && <div style={{ color: '#7f1d1d' }}>No active subs found.</div>}
            {auditRows.map((r, idx) => (
              <div key={r.subId} style={{ border: '1px solid #fca5a5', borderRadius: 4, background: idx % 2 === 0 ? '#fff5f5' : '#fff', padding: '5px 8px', marginBottom: 4 }}>
                <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: 3 }}>{r.uiLabel} — <span style={{ color: '#6b7280' }}>{r.subId}</span> ({r.group})</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px 12px', color: '#1c1917' }}>
                  <div><strong>sub x:</strong> {fmt(r.subX)}</div>
                  <div><strong>sub y:</strong> {fmt(r.subY)}</div>
                  <div><strong>sub z:</strong> {fmt(r.subZ)}</div>
                  <div><strong>dx:</strong> {fmt(r.dx)}</div>
                  <div><strong>dy:</strong> {fmt(r.dy)}</div>
                  <div><strong>dz:</strong> {fmt(r.dz)}</div>
                  <div><strong>distance:</strong> {fmt(r.distM, 4)} m</div>
                  <div><strong>arrival:</strong> {fmt(r.arrMs, 3)} ms</div>
                  <div><strong>applied delay:</strong> {fmt(r.appliedDelayMs, 3)} ms</div>
                  <div style={{ gridColumn: '1 / -1' }}><strong>pos source:</strong> {r.posSource}</div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* __REW_OVERLAY_IMPORT__ */}
      <div style={{ border: '1px solid #ea580c', borderRadius: 6, background: '#fff7ed', padding: '8px 10px', fontSize: 10, fontFamily: 'monospace', marginBottom: 4 }}>
        <div style={{ fontWeight: 700, color: '#9a3412', marginBottom: 6, fontSize: 11 }}>REW Reference Overlay</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: '#7c2d12' }}>
            <input type="checkbox" checked={showRewOverlay} onChange={e => setShowRewOverlay(e.target.checked)} />
            Show REW overlay
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: '#7c2d12' }}>
            <input type="checkbox" checked={normalizeRewOverlay} onChange={e => setNormalizeRewOverlay(e.target.checked)} />
            Normalise at 80 Hz to B44
          </label>
          <button onClick={() => setRewOverlayText('')} style={{ padding: '1px 8px', borderRadius: 4, border: '1px solid #ea580c', background: '#fff', color: '#9a3412', cursor: 'pointer', fontSize: 10 }}>Clear</button>
        </div>
        <div style={{ color: '#92400e', marginBottom: 4, fontSize: 9 }}>Paste REW export CSV below (frequency,spl — one per line, header row OK):</div>
        <textarea
          value={rewOverlayText}
          onChange={e => setRewOverlayText(e.target.value)}
          rows={6}
          placeholder={"frequency,spl\n20,92.1\n25,93.4\n30,94.8\n..."}
          style={{ width: '100%', fontFamily: 'monospace', fontSize: 10, border: '1px solid #fed7aa', borderRadius: 4, padding: '4px 6px', background: '#fff', color: '#1c1917', resize: 'vertical', boxSizing: 'border-box' }}
        />
        {rewOverlaySeries && (
          <div style={{ marginTop: 4, color: '#059669', fontSize: 9 }}>
            ✓ {rewOverlaySeries.data.length} points parsed — {rewOverlaySeries.data[0]?.frequency.toFixed(1)}–{rewOverlaySeries.data[rewOverlaySeries.data.length - 1]?.frequency.toFixed(1)} Hz
          </div>
        )}
        {rewOverlayText.trim() && !rewOverlaySeries && (
          <div style={{ marginTop: 4, color: '#dc2626', fontSize: 9 }}>⚠ Could not parse data — check format (frequency,spl per line)</div>
        )}
      </div>

          </div>
        </details>
      )}
      {/* Geometry & REW Import end */}
    </>
  );
}