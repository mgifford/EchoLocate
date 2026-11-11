/**
 * Collect microphone samples in half-second blocks and transfer them to the
 * page. Keeping this in an AudioWorklet avoids blocking the main thread and
 * avoids MediaRecorder's non-standalone chunk problem.
 */
class EchoLocateCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.blocks = [];
    this.length = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    this.blocks.push(new Float32Array(channel));
    this.length += channel.length;
    if (this.length >= sampleRate / 2) {
      const output = new Float32Array(this.length);
      let offset = 0;
      for (const block of this.blocks) {
        output.set(block, offset);
        offset += block.length;
      }
      this.port.postMessage(output, [output.buffer]);
      this.blocks = [];
      this.length = 0;
    }
    return true;
  }
}

registerProcessor('echolocate-capture', EchoLocateCapture);
