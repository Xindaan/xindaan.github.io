export class ListenerAudio {
  constructor(onStats) {
    this.context = null; this.node = null; this.enabled = false; this.onStats = onStats;
  }
  async start(state, playing) {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      try {
        await this.context.audioWorklet.addModule('./audio-worklet.js');
        this.node = new AudioWorkletNode(this.context, 'listener-pressure', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
        this.node.port.onmessage = ({ data }) => this.onStats(data);
        this.node.connect(this.context.destination);
      } catch (error) {
        await this.context.close();
        this.context = null; this.node = null;
        throw error;
      }
    }
    await this.context.resume();
    this.enabled = true;
    this.update(state, playing);
  }
  stop(state) { this.enabled = false; this.update(state, false); }
  update(state, playing) {
    this.node?.port.postMessage({ state, audible: this.enabled && playing });
  }
}
