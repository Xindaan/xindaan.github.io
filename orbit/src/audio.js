import { DEFAULT_BPM, DEFAULT_MASTER, cloneLayers, positionAt, segmentAt, appendChange, eventsBetween } from './timing.js';
import { createBuffers, connectOutput, scheduleVoice } from './synthesis.js';

const LOOKAHEAD = 0.12;
const EDIT_DELAY = 0.16;
export class OrbitAudio {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.layers = cloneLayers();
    this.bpm = DEFAULT_BPM;
    this.masterVolume = DEFAULT_MASTER;
    this.running = false;
    this.busy = false;
    this.context = null;
    this.cycle = 0;
    this.segments = [];
    this.events = [];
    this.voices = new Set();
    this.stats = { scheduled: 0, shown: 0, maxFrameDelay: 0, phaseError: 0, stalls: 0, visualStalls: 0, peak: 0 };
  }

  async start() {
    if (this.running || this.busy) return;
    this.busy = true;
    try {
      if (!this.context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) throw new Error('Dieser Browser unterstützt leider kein Web Audio.');
        this.context = new Audio({ latencyHint: 'interactive' });
        this.buffers = createBuffers(this.context);
        this.output = connectOutput(this.context, this.masterVolume);
        this.layerOutputs = this.layers.map(() => {
          const gain = this.context.createGain();
          gain.connect(this.output.input);
          return gain;
        });
        this.meter = new Float32Array(this.output.analyser.fftSize);
        this.context.addEventListener('statechange', () => {
          if (this.running && this.context.state !== 'running') this.pause('Audio unterbrochen. Mit Fortsetzen geht es weiter.');
        });
      }
      await this.context.resume();
      if (this.context.state !== 'running') throw new Error('Audio konnte nicht starten. Bitte erneut klicken.');
      if (document.hidden) throw new Error('Die Installation ist im Hintergrund. Bitte sichtbar erneut starten.');
      this.layerOutputs.forEach((gain, index) => {
        gain.gain.cancelScheduledValues(this.context.currentTime);
        gain.gain.setValueAtTime(this.layers[index].muted ? 0 : this.layers[index].volume / 100, this.context.currentTime);
      });
      const time = this.context.currentTime + 0.06;
      this.segments = [{ time, cycle: this.cycle, bpm: this.bpm, layers: this.layers.map(layer => ({ ...layer })) }];
      this.cursor = time;
      this.events = [];
      this.running = true;
      this.tick();
      this.timer = setInterval(() => this.tick(), 20);
      this.onChange();
    } finally { this.busy = false; }
  }

  audibleTime() {
    if (!this.context) return 0;
    const stamp = this.context.getOutputTimestamp?.();
    if (stamp?.contextTime > 0 && stamp.performanceTime > 0) {
      return Math.min(this.context.currentTime, stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000);
    }
    return Math.max(0, this.context.currentTime - (this.context.outputLatency || 0) - (this.context.baseLatency || 0));
  }

  frame() {
    if (!this.running) return { time: 0, cycle: this.cycle, layers: this.layers, bpm: this.bpm, hits: [] };
    const time = this.audibleTime();
    const segment = segmentAt(this.segments, time);
    if (this.events.some(event => !event.shown && time - event.time > 0.12)) {
      this.stats.visualStalls++;
      this.pause('Automatisch pausiert: Die Bildausgabe wurde unterbrochen.');
      return { time: 0, cycle: this.cycle, layers: this.layers, bpm: this.bpm, hits: [] };
    }
    const hits = [];
    for (const event of this.events) {
      if (!event.shown && event.time <= time) {
        event.shown = true;
        this.stats.shown++;
        this.stats.maxFrameDelay = Math.max(this.stats.maxFrameDelay, (time - event.time) * 1000);
        const eventSegment = segmentAt(this.segments, event.time);
        this.stats.phaseError = Math.max(this.stats.phaseError, Math.abs(positionAt(eventSegment, event.time) - event.cycle));
        hits.push(event);
      }
    }
    this.events = this.events.filter(event => event.time >= time - 1.5);
    // Keep enough segment history for events and the output latency correction.
    while (this.segments.length > 2 && this.segments[1].time < time - 2) this.segments.shift();
    return { time, cycle: positionAt(segment, time), layers: segment.layers, bpm: segment.bpm, hits };
  }

  tick() {
    if (!this.running) return;
    const now = this.context.currentTime;
    if (now > this.cursor) {
      // Never fire a burst of stale notes after a blocked tab or sleeping computer.
      this.stats.stalls++;
      this.pause('Automatisch pausiert: Der Browser wurde unterbrochen.');
      return;
    }
    const end = now + LOOKAHEAD;
    if (end <= this.cursor) return;
    const events = eventsBetween(this.segments, this.cursor, end);
    for (const event of events) {
      const voice = scheduleVoice(this.context, this.layerOutputs[event.layer], this.buffers, { ...event, volume: 100 });
      this.voices.add(voice);
      voice.source.onended = () => {
        voice.source.disconnect();
        voice.gain.disconnect();
        this.voices.delete(voice);
      };
      this.events.push(event);
      this.stats.scheduled++;
    }
    this.cursor = end;
  }

  pause(reason = '') {
    if (!this.running) return;
    const time = this.audibleTime();
    this.cycle = positionAt(segmentAt(this.segments, time), time);
    this.running = false;
    clearInterval(this.timer);
    const now = this.context.currentTime;
    for (const voice of this.voices) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, 0.003);
      voice.source.stop(now + 0.015);
    }
    this.events = [];
    this.onChange(reason);
  }

  change() {
    if (this.running) {
      const time = this.context.currentTime + EDIT_DELAY;
      appendChange(this.segments, time, this.bpm, this.layers);
      // Each layer has a bus so mute/volume also affect notes that are still decaying.
      this.layerOutputs.forEach((gain, index) => {
        gain.gain.setTargetAtTime(this.layers[index].muted ? 0 : this.layers[index].volume / 100, time, 0.003);
      });
    }
    this.onChange();
  }

  setLayer(index, key, value) {
    if (key === 'count') value = Math.max(1, Math.min(16, Math.round(value)));
    if (key === 'phase') value = Math.max(0, Math.min(359, Math.round(value)));
    if (key === 'volume') value = Math.max(0, Math.min(100, Math.round(value)));
    this.layers[index][key] = value;
    this.change();
  }

  setTempo(value) {
    this.bpm = Math.max(40, Math.min(160, Math.round(value)));
    this.change();
  }

  setMaster(value) {
    this.masterVolume = Math.max(0, Math.min(100, Number(value)));
    if (this.context) this.output.master.gain.setTargetAtTime(this.masterVolume / 100 * 0.7, this.context.currentTime, 0.015);
    this.onChange();
  }

  reset() {
    this.pause();
    this.cycle = 0;
    this.layers = cloneLayers();
    this.bpm = DEFAULT_BPM;
    this.setMaster(DEFAULT_MASTER);
    this.segments = [];
    this.stats = { scheduled: 0, shown: 0, maxFrameDelay: 0, phaseError: 0, stalls: 0, visualStalls: 0, peak: 0 };
    this.onChange();
  }

  diagnostics() {
    let rms = 0;
    if (this.output) {
      this.output.analyser.getFloatTimeDomainData(this.meter);
      for (const value of this.meter) { rms += value * value; this.stats.peak = Math.max(this.stats.peak, Math.abs(value)); }
      rms = Math.sqrt(rms / this.meter.length);
    }
    const time = this.audibleTime();
    const cycle = this.running ? positionAt(segmentAt(this.segments, time), time) : this.cycle;
    return { state: this.context?.state ?? 'nicht erzeugt', running: this.running, cycle, bpm: this.bpm, ...this.stats, rms, activeVoices: this.voices.size };
  }
}
