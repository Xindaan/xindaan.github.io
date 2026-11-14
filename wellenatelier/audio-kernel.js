import { fieldPhasor, TAU } from './model.js';

// Fixed gain, no compressor / AGC / automatic loudness compensation.
export const AUDIO_GAIN = 0.025;
export const RAMP_SECONDS = 0.02;

// Used unchanged in the browser AudioWorklet and the numerical audio tests.
export class AudioKernel {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.theta = 0;
    this.re = 0; this.im = 0; this.frequency = 220; this.remaining = 0;
    this.target = { re: 0, im: 0, frequency: 220 };
  }
  setState(state, audible = true) {
    const z = fieldPhasor(state);
    this.target = { re: audible ? z.re : 0, im: audible ? z.im : 0, frequency: state.frequency };
    this.remaining = Math.max(1, Math.round(this.sampleRate * RAMP_SECONDS));
  }
  render(output) {
    for (let i = 0; i < output.length; i++) {
      if (this.remaining) {
        this.re += (this.target.re - this.re) / this.remaining;
        this.im += (this.target.im - this.im) / this.remaining;
        this.frequency += (this.target.frequency - this.frequency) / this.remaining;
        this.remaining--;
      }
      output[i] = AUDIO_GAIN * (this.re * Math.cos(this.theta) - this.im * Math.sin(this.theta));
      this.theta = (this.theta + TAU * this.frequency / this.sampleRate) % TAU;
    }
  }
}
