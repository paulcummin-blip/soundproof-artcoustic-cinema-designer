// AdiJourneyRuntimeCostBlock.jsx
// ---------------------------------------------------------------------------
// THE RUN'S RUNTIME COST, SPLIT — DEVELOPER DIAGNOSTICS ONLY.
//
// One table of named stages, read straight from the run's own measured timing
// breakdown, so the question the runtime budget asks can be answered from the
// app instead of the console:
//
//   how much of this optimiser run is delay + gain + phase/polarity +
//   confirmation — the work that belongs INSIDE Calculate Bass — and how much is
//   physical placement or seating advisory work that does not?
//
// It renders only rows that carry a measurement. A stage that was never measured
// is not a row and is never shown as zero, because an absent measurement is a
// stated gap, not a fast stage.
//
// PRESENTATION ONLY: it reads a breakdown that was already computed and saved. It
// performs no calculation, no ranking, no comparison and no decision, and it is
// never rendered outside the admin debug gate.
// ---------------------------------------------------------------------------

export default function AdiJourneyRuntimeCostBlock({ rows = [] }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  return (
    <div className="space-y-0.5" data-adi-runtime-cost="true">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        Runtime cost breakdown
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex items-baseline justify-between gap-3 text-[11px] text-[#3E4349]"
          data-adi-runtime-cost-row={row.key}
        >
          <span>{row.label}</span>
          <span className="font-medium tabular-nums">{row.value}</span>
        </div>
      ))}
      <div className="text-[10px] leading-relaxed text-[#8A7B6A]">
        A stage with no measurement is not listed: an absent figure is never shown as zero.
      </div>
    </div>
  );
}