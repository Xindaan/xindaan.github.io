export const DEFAULT_BPM = 72;
export const DEFAULT_MASTER = 45;
export const LAYERS = [
  { name: 'Tiefenpuls', description: 'Warm. Tief. Tragend.', color: '#c7ed9c', count: 3, phase: 0, volume: 70, muted: false, radius: 270 },
  { name: 'Schwebeton', description: 'Weich. Klar. Schwebend.', color: '#8cdad8', count: 4, phase: 0, volume: 65, muted: false, radius: 213 },
  { name: 'Metallklang', description: 'Hell. Fein. Schimmernd.', color: '#efb881', count: 5, phase: 0, volume: 55, muted: false, radius: 156 },
  { name: 'Korn', description: 'Leise. Körnig. Flüchtig.', color: '#b8a6e8', count: 7, phase: 0, volume: 45, muted: false, radius: 99 },
];
export const cloneLayers = () => LAYERS.map(layer => ({ ...layer }));
export const mod = (n, d = 1) => ((n % d) + d) % d;
export const period = bpm => 240 / bpm; // Four quarter notes make one shared revolution.
export const positionAt = (segment, time) => segment.cycle + Math.max(0, time - segment.time) / period(segment.bpm);

export function segmentAt(segments, time) {
  for (let i = segments.length - 1; i >= 0; i--) if (segments[i].time <= time) return segments[i];
  return segments[0];
}

// Half-open intervals give each impulse exactly one owner, also at tempo/edit boundaries.
export function eventsBetween(segments, from, to) {
  const events = [];
  for (let s = 0; s < segments.length; s++) {
    const segment = segments[s];
    const start = Math.max(from, segment.time);
    const end = Math.min(to, segments[s + 1]?.time ?? Infinity);
    if (end <= start) continue;
    const p0 = positionAt(segment, start);
    const p1 = positionAt(segment, end);
    segment.layers.forEach((layer, layerIndex) => {
      if (layer.muted || layer.volume === 0) return;
      const offset = layer.phase / 360;
      const first = Math.ceil((p0 - offset) * layer.count - 1e-9);
      for (let step = first; ; step++) {
        const cycle = offset + step / layer.count;
        if (cycle >= p1 - 1e-10) break;
        const time = segment.time + (cycle - segment.cycle) * period(segment.bpm);
        events.push({ time, cycle, layer: layerIndex, point: mod(step, layer.count), volume: layer.volume, angle: mod(cycle) * Math.PI * 2 });
      }
    });
  }
  return events.sort((a, b) => a.time - b.time || a.layer - b.layer);
}

export function appendChange(segments, time, bpm, layers) {
  const cycle = positionAt(segmentAt(segments, time), time);
  // Coalesce rapid slider changes that have not yet entered the scheduling window.
  while (segments.length > 1 && segments.at(-1).time >= time) segments.pop();
  segments.push({ time, cycle, bpm, layers: layers.map(layer => ({ ...layer })) });
}
