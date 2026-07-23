// hooks/useLiveP14Level.jsx
// Reads the completed frequency-aware P14 authority from the shared bass result.
import { useOptionalSharedBassResults } from '@/components/room/bass/bassResultsStore';

export function useLiveP14Level() {
  const shared = useOptionalSharedBassResults();
  const parameter = shared?.contract?.productAnalysis?.parameters?.p14;
  const complete = ["complete", "updating"].includes(parameter?.status);
  const valueDb = Number(parameter?.value);
  if (!complete || !Number.isFinite(valueDb) || parameter?.level == null) {
    return { hasData: false, level: null, valueDb: null, formatted: null };
  }
  const level = Number(parameter.level) > 0 ? `L${Number(parameter.level)}` : null;
  return {
    hasData: true,
    level,
    valueDb,
    formatted: `${valueDb.toFixed(1)} dBC`,
  };
}