export const DURATIONS = [0.48, 0.9, 0.7, 0.16];

// Locally generated samples. C2, G3 and E5 form a consonant C-major voicing.
// The fourth voice is unpitched, softly filtered noise. No recordings or melodies.
export function synthesize(index, sampleRate = 48000) {
  const samples = new Float32Array(Math.ceil(DURATIONS[index] * sampleRate));
  let seed = 42077;
  let low = 0;
  let previous = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1, t / [0.006, 0.018, 0.003, 0.004][index]);
    const release = Math.min(1, (samples.length - 1 - i) / (sampleRate * 0.03));
    let sample;
    if (index === 0) {
      // Integrated, small pitch descent into C2 gives the pulse a rounded onset.
      const phase = 2 * Math.PI * (65.4064 * t + 1.4 * (1 - Math.exp(-t * 22)));
      sample = (Math.sin(phase) + 0.13 * Math.sin(phase * 2)) * Math.exp(-t * 9) * 0.23;
    } else if (index === 1) {
      sample = (Math.sin(2 * Math.PI * 195.9977 * t) + 0.18 * Math.sin(2 * Math.PI * 391.9954 * t)) * Math.exp(-t * 5.2) * 0.17;
    } else if (index === 2) {
      sample = (Math.sin(2 * Math.PI * 659.2551 * t) * Math.exp(-t * 10) + 0.30 * Math.sin(2 * Math.PI * 1318.5102 * t) * Math.exp(-t * 19) + 0.14 * Math.sin(2 * Math.PI * 2643 * t) * Math.exp(-t * 32)) * 0.135;
    } else {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 2147483648 - 1;
      low += 0.22 * (noise - low);
      sample = (low - previous * 0.8) * Math.exp(-t * 35) * 0.34;
      previous = low;
    }
    samples[i] = sample * attack * release;
  }
  return samples;
}

export function createBuffers(context) {
  return DURATIONS.map((_, index) => {
    const samples = synthesize(index, context.sampleRate);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.copyToChannel(samples, 0);
    return buffer;
  });
}

export function connectOutput(context, masterVolume) {
  const input = context.createGain();
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.knee.value = 12;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;
  const master = context.createGain();
  master.gain.value = masterVolume / 100 * 0.7;
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  input.connect(compressor).connect(master).connect(analyser).connect(context.destination);
  return { input, master, analyser, compressor };
}

export function scheduleVoice(context, output, buffers, event) {
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffers[event.layer];
  gain.gain.value = event.volume / 100;
  source.connect(gain).connect(output);
  source.start(event.time);
  const voice = { source, gain, time: event.time };
  return voice;
}
