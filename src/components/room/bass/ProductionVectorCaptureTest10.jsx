import React from "react";

const fmt = (value, digits = 6) => Number.isFinite(value) ? value.toFixed(digits) : "—";
const db = (re, im) => 20 * Math.log10(Math.max(Math.hypot(re, im), 1e-10));

function VectorTable({ row }) {
  if (!row) return null;
  return <details open style={{ marginTop: 8 }}><summary style={{ fontWeight: 700, cursor: "pointer" }}>{fmt(row.frequencyHz, 6)} Hz</summary>
    {row.subs.map((sub) => <div key={sub.subId} style={{ marginTop: 8, borderTop: "1px solid #bae6fd", paddingTop: 6 }}>
      <strong>{sub.subId} — {sub.modelKey}</strong>
      <div>source: {fmt(sub.source.x, 6)} / {fmt(sub.source.y, 6)} / {fmt(sub.source.z, 6)} | receiver: {fmt(sub.receiver.x, 6)} / {fmt(sub.receiver.y, 6)} / {fmt(sub.receiver.z, 6)}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4 }}><tbody>
        {Object.entries(sub.direct).map(([key, value]) => <tr key={key}><td>{key}</td><td style={{ textAlign: "right" }}>{typeof value === "number" ? fmt(value) : String(value)}</td></tr>)}
      </tbody></table>
      <div style={{ overflowX: "auto", marginTop: 6 }}><table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr><th>Boundary</th><th>Image x/y/z</th><th>Distance</th><th>Coeff</th><th>Weight</th><th>Phase</th><th>Re</th><th>Im</th></tr></thead><tbody>
        {sub.reflections.map((image, index) => <tr key={index}><td>{image.boundary}</td><td>{fmt(image.x, 4)} / {fmt(image.y, 4)} / {fmt(image.z, 4)}</td><td>{fmt(image.distanceM)}</td><td>{fmt(image.reflectionCoefficient)}</td><td>{fmt(image.coherenceWeight)}</td><td>{fmt(image.phase)}</td><td>{fmt(image.re)}</td><td>{fmt(image.im)}</td></tr>)}
      </tbody></table></div>
      <div>summedReflection: {fmt(sub.reflectionRe)} + j{fmt(sub.reflectionIm)} | direct + reflections: {fmt(sub.directPlusReflectionRe)} + j{fmt(sub.directPlusReflectionIm)} | {fmt(sub.directPlusReflectionSplDb)} dB</div>
      <div style={{ overflowX: "auto", marginTop: 6 }}><table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr><th>Mode</th><th>Type</th><th>f0</th><th>Q</th><th>Source ψ</th><th>Receiver ψ</th><th>Combined</th><th>Gain</th><th>Re pre</th><th>Im pre</th><th>Re post</th><th>Im post</th></tr></thead><tbody>
        {sub.modes.map((mode, index) => <tr key={index} style={(mode.nx === 1 && mode.ny === 0 && mode.nz === 0) || (mode.nx === 0 && mode.ny === 1 && mode.nz === 0) ? { fontWeight: 700 } : undefined}><td>({mode.nx},{mode.ny},{mode.nz})</td><td>{mode.type}</td><td>{fmt(mode.f0)}</td><td>{fmt(mode.q)}</td><td>{fmt(mode.sourceCoupling)}</td><td>{fmt(mode.receiverCoupling)}</td><td>{fmt(mode.combinedCoupling)}</td><td>{fmt(mode.gain)}</td><td>{fmt(mode.reBeforeScale)}</td><td>{fmt(mode.imBeforeScale)}</td><td>{fmt(mode.reAfterScale)}</td><td>{fmt(mode.imAfterScale)}</td></tr>)}
      </tbody></table></div>
      <div>√V: {fmt(sub.abSqrtVScale)} | modal: {fmt(sub.modalRe)} + j{fmt(sub.modalIm)} | magnitude: {fmt(sub.modalMagnitude)} | equivalent: {fmt(sub.modalSplEquivalentDb)} dB</div>
    </div>)}
    <div style={{ marginTop: 8, fontWeight: 700 }}>Combined pre-modal: {fmt(row.preModalRe)} + j{fmt(row.preModalIm)} | {fmt(row.preModalSplDb)} dB<br/>Combined final: {fmt(row.finalRe)} + j{fmt(row.finalIm)} | {fmt(row.finalSplDb)} dB | plotted raw graph value: {fmt(row.plottedGraphValueDb)} dB</div>
  </details>;
}

export default function ProductionVectorCaptureTest10({ capture, designEqEnabled, smoothingMode }) {
  const rows = capture?.rows || [];
  const ready = !designEqEnabled && smoothingMode === "none";
  const delta = rows.length === 2 ? rows.map((row) => ({
    hz: row.frequencyHz,
    curve: row.subs.length ? row.subs[0].direct.curveDb : null,
    direct: db(row.directRe, row.directIm),
    pre: row.directPlusReflectionSplDb,
    modal: db(row.modalRe, row.modalIm),
    final: row.finalSplDb,
  })) : null;
  return <details style={{ border: "2px solid #0369a1", borderRadius: 6, background: "#f0f9ff", padding: "8px 10px", fontSize: 10, fontFamily: "monospace", marginBottom: 8 }}>
    <summary style={{ color: "#075985", cursor: "pointer", fontWeight: 700 }}>TEST 10 — PRODUCTION 20/34 HZ VECTOR CAPTURE</summary>
    {!ready ? <div style={{ color: "#991b1b", marginTop: 6 }}>Capture is intentionally withheld until Design EQ is off and smoothing is None.</div> : !rows.length ? <div style={{ color: "#075985", marginTop: 6 }}>No live REW Core capture is available.</div> : <>
      {delta && <table style={{ marginTop: 8, borderCollapse: "collapse", width: "100%" }}><thead><tr><th>Stage</th>{delta.map((item) => <th key={item.hz}>{fmt(item.hz, 6)} Hz</th>)}<th>Delta</th></tr></thead><tbody>{[["Product curve (first active sub)", "curve"], ["Direct SPL", "direct"], ["Direct + reflections SPL", "pre"], ["Modal vector equivalent", "modal"], ["Final SPL", "final"]].map(([label, key]) => <tr key={key}><td>{label}</td>{delta.map((item) => <td key={item.hz}>{fmt(item[key])}</td>)}<td>{fmt(delta[1][key] - delta[0][key])}</td></tr>)}</tbody></table>}
      {rows.map((row) => <VectorTable key={row.frequencyHz} row={row} />)}
    </>}
  </details>;
}