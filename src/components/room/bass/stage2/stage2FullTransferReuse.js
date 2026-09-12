import { BASS_NORMALIZED_PHYSICS_DEFAULTS } from "../bassPhysicsDefaults.js";
import { STAGE2_PLACEMENT_VERSION, STAGE2_PRODUCT_ENGINEERING_VERSION } from "./stage2Constants.js";
import { MODELS, normaliseModelKey } from "@/components/models/speakers/registry";
import { resolveSubwooferBassCapability } from "@/components/utils/speakerModelResolver";

// Companion to the existing Stage 2 finalist cache. Only completed V2 placement
// work is admitted: full product-shaped, ZERO-tuning complex data, never flat
// screening data or a confirmed recommendation. Lifetime is this page/module.
// A new build/module gets an empty cache; no acoustic/result version is changed.
export const FULL_TRANSFER_BASIS = Object.freeze({
  placementVersion: STAGE2_PLACEMENT_VERSION,
  productVersion: STAGE2_PRODUCT_ENGINEERING_VERSION,
  grid: "rew-default-360-log-15-200Hz-unsmoothed",
  convention: "stage2-product-per-source-per-seat-zero-tuning;auto-align-sum-separate",
  qStrategy: "ab_corrected",
  physics: { ...BASS_NORMALIZED_PHYSICS_DEFAULTS, rewSourceCurveMode: "product",
    disableLateField: true, disableModalPropagationPhase: true },
});

// Exact structural identity, including undefined/non-finite values. No decimal
// rounding or hash collisions: the whole string is the lookup key.
export function exactTransferIdentity(value) {
  if (value === undefined) return "undefined";
  if (typeof value === "number") return Object.is(value, -0) ? "number:-0" : `number:${value}`;
  if (Array.isArray(value)) return `[${value.map(exactTransferIdentity).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map(k => `${JSON.stringify(k)}:${exactTransferIdentity(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function fullTransferIdentity(params, basis = FULL_TRANSFER_BASIS) {
  const { finalist, seatingPositions, roomDims, rspPosition, selectedSubModel,
    amplifierPowerPerSubW, subwooferBottomHeightM } = params;
  const input = { roomDims, rspPosition, selectedSubModel, amplifierPowerPerSubW, subwooferBottomHeightM };
  // These flags only label the returned curves/priority map; the simulator
  // consumes receiver geometry. Retag below before ANY proxy/canonical use.
  const receivers = (seatingPositions || []).map(({ priority, isPrimary, isSecondary, ...seat }) => seat);
  return exactTransferIdentity({ basis, ...input,
    // buildStage2Sources consumes only these ordered source coordinates.
    // Preserve order: a reorder safely misses rather than reusing wrong indices.
    sources: finalist.sources.map(({ xNorm, yNorm }) => ({ xNorm, yNorm })),
    receivers,
    product: MODELS.find(model => model.key === normaliseModelKey(params.selectedSubModel)),
    capability: resolveSubwooferBassCapability(params.selectedSubModel),
  });
}

export function retagFullTransfer(raw, params) {
  const priorities = new Map((params.seatingPositions || []).map(seat =>
    [String(seat.id || `${seat.x}-${seat.y}`), seat.priority === "secondary" ? "secondary" : "primary"]));
  raw.finalistId = params.finalist.id;
  raw.familyId = params.finalist.familyId;
  raw.seatPriorityMap = [...priorities];
  raw.perSeatRawCurves = raw.perSeatRawCurves.map(seat => ({ ...seat,
    isPrimary: priorities.get(String(seat.seatId)) === "primary" }));
  return raw;
}

function completeFullTransfer(raw, params) {
  const sources = raw?.sources, seats = raw?.seatIds, transfers = raw?.perSourcePerSeatComplexTransfers;
  if (!sources?.length || sources.length !== params.finalist.sources.length || !seats?.length ||
      seats.length !== (params.seatingPositions || []).length + 1 || new Set(seats).size !== seats.length ||
      !Array.isArray(transfers) || transfers.length !== sources.length * seats.length) return false;
  const expectedSeats = ["rsp", ...(params.seatingPositions || []).map(s => String(s.id || `${s.x}-${s.y}`))];
  if (seats.some((id,i) => id !== expectedSeats[i]) || raw.selectedProduct !== normaliseModelKey(params.selectedSubModel) ||
      sources.some((s,i) => s.x !== params.finalist.sources[i].xNorm * Number(params.roomDims.widthM) ||
        s.y !== params.finalist.sources[i].yNorm * Number(params.roomDims.lengthM))) return false;
  const grid = raw.rspRawCurve;
  if (grid?.length !== 360 || grid[0]?.frequency !== 15 || Math.abs(grid.at(-1)?.frequency - 200) > 1e-10 ||
      !grid.every(p => Number.isFinite(p.frequency) && Number.isFinite(p.spl))) return false;
  if (sources.some(s => s.tuning?.delayMs !== 0 || s.tuning?.gainDb !== 0 || s.tuning?.polarity !== 0)) return false;
  if (raw.perSeatRawCurves?.length !== seats.length - 1 || !raw.perSeatRawCurves.every(s =>
      seats.includes(s.seatId) && s.responseData?.length === grid.length && s.responseData.every((p,i) =>
        p.frequency === grid[i].frequency && Number.isFinite(p.spl)))) return false;
  const seen = new Set();
  for (const t of transfers) {
    const pair = `${t.sourceIndex}:${t.seatId}`;
    if (!Number.isInteger(t.sourceIndex) || !sources[t.sourceIndex] || t.sourceId !== sources[t.sourceIndex].id ||
        !seats.includes(t.seatId) || seen.has(pair) || t.points?.length !== grid.length ||
        !t.points.every((p,i) => p.frequency === grid[i].frequency && Number.isFinite(p.re) && Number.isFinite(p.im))) return false;
    seen.add(pair);
  }
  return true;
}

const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
const checkLive = (signal, isStale) => {
  if (signal?.aborted || isStale?.()) throw signal?.reason || new DOMException("Transfer request no longer current", "AbortError");
};

export function createFullTransferReuseCache({ maxEntries = 32, maxBytes = 32 * 1024 * 1024 } = {}) {
  const entries = new Map();
  let bytes = 0;
  function remove(key) { bytes -= entries.get(key).bytes; entries.delete(key); }
  return {
    stats: () => ({ entries: entries.size, bytes, maxEntries, maxBytes }),
    clearProject(projectId) { for (const [key, e] of entries) if (e.projectId === projectId) remove(key); },
    async getOrCompute({ projectId, params, runId, signal, isStale, compute, onOperation, basis = FULL_TRANSFER_BASIS }) {
      checkLive(signal, isStale);
      const startedAt = now(), identity = fullTransferIdentity(params, basis);
      const key = exactTransferIdentity([projectId, identity]);
      const existing = entries.get(key);
      const operation = { candidateId: params.finalist.id, origin: params.finalist.familyId,
        identity, basis, lookup: existing ? "hit" : "miss",
        reason: existing ? (existing.runId === runId ? "same-run-completed" : "previous-run-completed") : "no-complete-exact-entry",
        startedAt, computationStart: null, computationEnd: null };
      try {
        if (existing) {
          entries.delete(key); entries.set(key, existing);
          // Stored JSON is immutable and owns no worker/consumer ArrayBuffer.
          // Each consumer receives fresh arrays, including all complex points.
          return retagFullTransfer(JSON.parse(existing.json), params);
        }
        operation.computationStart = now();
        const raw = await compute();
        operation.computationEnd = now();
        checkLive(signal, isStale);
        if (completeFullTransfer(raw, params)) {
          const json = JSON.stringify(raw);
          // Hard UTF-16 payload bound (keys included), plus bounded Map overhead.
          const entryBytes = 2 * (json.length + key.length);
          if (maxEntries > 0 && entryBytes <= maxBytes) {
            while (entries.size >= maxEntries || bytes + entryBytes > maxBytes) remove(entries.keys().next().value);
            if (entries.has(key)) remove(key);
            entries.set(key, { projectId, runId, json, bytes: entryBytes }); bytes += entryBytes;
            operation.stored = true;
          } else operation.stored = false;
        } else operation.stored = false;
        // A non-admissible result follows the unchanged caller's validation.
        return raw;
      } catch (error) {
        operation.error = error?.message || String(error);
        throw error;
      } finally {
        operation.endedAt = now();
        onOperation?.(operation);
      }
    },
  };
}

export const fullTransferReuseCache = createFullTransferReuseCache();
