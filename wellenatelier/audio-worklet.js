import { AudioKernel } from './audio-kernel.js';

class ListenerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.kernel = new AudioKernel(sampleRate);
    this.energy = 0; this.samples = 0; this.peak = 0;
    this.port.onmessage = ({ data }) => this.kernel.setState(data.state, data.audible);
  }
  process(_inputs, outputs) {
    const channel = outputs[0][0];
    this.kernel.render(channel);
    for (const p of channel) { this.energy += p * p; this.peak = Math.max(this.peak, Math.abs(p)); }
    this.samples += channel.length;
    if (this.samples >= sampleRate / 4) {
      this.port.postMessage({ rms: Math.sqrt(this.energy / this.samples), peak: this.peak });
      this.energy = 0; this.samples = 0; this.peak = 0;
    }
    return true;
  }
}
registerProcessor('listener-pressure', ListenerProcessor);
