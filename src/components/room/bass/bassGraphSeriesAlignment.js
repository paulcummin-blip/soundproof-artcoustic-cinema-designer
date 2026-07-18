const EXACT_FREQUENCY_TOLERANCE_HZ = 0.001;

const isFiniteNumber = (value) => Number.isFinite(Number(value));

function normaliseSeries(series) {
  const sorted = (Array.isArray(series?.data) ? series.data : [])
    .map((point) => ({ frequency: Number(point?.frequency), spl: Number(point?.spl) }))
    .filter((point) => isFiniteNumber(point.frequency) && point.frequency > 0)
    .sort((a, b) => a.frequency - b.frequency);

  return sorted.reduce((points, point) => {
    const previous = points[points.length - 1];
    if (previous && Math.abs(previous.frequency - point.frequency) < EXACT_FREQUENCY_TOLERANCE_HZ) {
      points[points.length - 1] = point;
    } else {
      points.push(point);
    }
    return points;
  }, []);
}

function interpolateLogFrequency(points, frequency) {
  if (!points.length || frequency < points[0].frequency || frequency > points[points.length - 1].frequency) {
    return { value: null, interpolated: false };
  }

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (Math.abs(point.frequency - frequency) < EXACT_FREQUENCY_TOLERANCE_HZ) {
      if (import.meta.env.DEV && Math.abs(point.frequency - frequency) >= EXACT_FREQUENCY_TOLERANCE_HZ) {
        throw new Error("Bass graph exact-frequency alignment assertion failed.");
      }
      return { value: isFiniteNumber(point.spl) ? point.spl : null, interpolated: false };
    }
    if (point.frequency > frequency) {
      const low = points[index - 1];
      const high = point;
      if (!low || !isFiniteNumber(low.spl) || !isFiniteNumber(high.spl)) return { value: null, interpolated: true };
      const ratio = Math.log(frequency / low.frequency) / Math.log(high.frequency / low.frequency);
      return { value: low.spl + (high.spl - low.spl) * ratio, interpolated: true };
    }
  }

  return { value: null, interpolated: false };
}

export function mergeBassGraphSeries(seriesList) {
  const normalised = (Array.isArray(seriesList) ? seriesList : []).map((series) => ({
    ...series,
    data: normaliseSeries(series),
  }));
  const frequencies = normalised
    .flatMap((series) => series.data.map((point) => point.frequency))
    .sort((a, b) => a - b)
    .reduce((axis, frequency) => {
      const previous = axis[axis.length - 1];
      if (previous == null || Math.abs(previous - frequency) >= EXACT_FREQUENCY_TOLERANCE_HZ) axis.push(frequency);
      return axis;
    }, []);

  return frequencies.map((frequency) => {
    const row = { frequency, __interpolatedSeries: [] };
    normalised.forEach((series) => {
      const sample = interpolateLogFrequency(series.data, frequency);
      row[`spl_${series.id}`] = sample.value;
      if (sample.interpolated) row.__interpolatedSeries.push(series.id);
    });
    return row;
  });
}